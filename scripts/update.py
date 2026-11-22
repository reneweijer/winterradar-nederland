#!/usr/bin/env python3
"""Winterradar: daily public-data snapshot (Python standard library only).

Forecasts are model results, not observations; the index data source may lag.
Missing values remain null rather than being turned into zero.
"""
import csv
import io
import re
import datetime as dt
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from winter_v2 import regional_forecast, previous_snapshot
from outlook import regional_outlook
from data_quality import merge_sources

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "latest.json"
HEADERS = {
    "User-Agent": "Winterradar-Nederland/1.0 (independent public weather dashboard)",
    "Accept": "application/json,text/plain;q=0.9,*/*;q=0.5",
}

def download(url, timeout=15):
    error = None
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read().decode("utf-8")
        except Exception as ex:
            error = ex
            if attempt < 1:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(str(error))

def api(base, params):
    url = base + "?" + urllib.parse.urlencode(params)
    payload = json.loads(download(url))
    if isinstance(payload, dict) and payload.get("error"):
        raise RuntimeError(payload.get("reason", "API error"))
    return payload

def forecast():
    params = dict(
        latitude=52.101, longitude=5.18,
        daily="temperature_2m_min,temperature_2m_max,wind_direction_10m_dominant,snowfall_sum",
        timezone="Europe/Amsterdam", forecast_days=14
    )
    return api("https://api.open-meteo.com/v1/forecast", params)



def local_forecast(latitude, longitude, model=None):
    params=dict(latitude=latitude,longitude=longitude,
        daily="temperature_2m_min,temperature_2m_max,wind_direction_10m_dominant,snowfall_sum",
        timezone="Europe/Amsterdam",forecast_days=14)
    if model: params["models"]=model
    return api("https://api.open-meteo.com/v1/forecast",params)

def recent_reference():
    """Open-Meteo historical reanalysis: comparison reference, NOT KNMI station observation."""
    yesterday=dt.datetime.now(dt.timezone.utc).date()-dt.timedelta(days=2)
    start=yesterday-dt.timedelta(days=19)
    return api("https://archive-api.open-meteo.com/v1/archive",dict(
        latitude=52.101,longitude=5.18,
        start_date=start.isoformat(),end_date=yesterday.isoformat(),
        daily="temperature_2m_min,temperature_2m_max",
        timezone="Europe/Amsterdam"))

def read_daily_index(url, name):
    """Read NOAA's daily-updated CDAS CSV; ignore all missing/future values."""
    observations = []
    try:
        content = download(url)
        lines = content.splitlines()
        if lines:
            print(name, "CDAS first CSV line:", lines[0][:180])
        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            if not row:
                continue
            key = next((k for k in row if k and name.lower() + "_index_cdas" in k.lower()), None)
            if key is None:
                key = next((k for k in row if k and ("index" in k.lower() or "value" in k.lower())), None)
            raw_value = row.get(key, "") if key else ""
            if all(k in row for k in ("year","month","day")):
                try:
                    date = dt.date(int(row["year"]),int(row["month"]),int(row["day"]))
                except (TypeError,ValueError):
                    continue
            else:
                raw_date = next((str(v) for k,v in row.items()
                         if k and k.lower().strip() in ("time","date","datetime")), "")
                match = re.search(r"(?:19|20)\d{2}[-/](?:0?[1-9]|1[012])[-/](?:0?[1-9]|[12]\d|3[01])", raw_date)
                if not match:
                    continue
                date = dt.date.fromisoformat(match.group(0).replace("/", "-"))
            try:
                value = float(str(raw_value).strip())
            except (ValueError, TypeError):
                continue
            if date > dt.date.today() + dt.timedelta(days=1) or date < dt.date(1950,1,1):
                continue
            if not math.isfinite(value) or abs(value) > 20:
                continue
            observations.append(dict(date=date.isoformat(), value=round(value,3)))
    except Exception as ex:
        return dict(error=str(ex)[:250], date=None, value=None, source=url)
    if not observations:
        return dict(error="No valid CDAS CSV values", date=None, value=None, source=url)
    observations.sort(key=lambda x: x["date"])
    last = observations[-1]
    return dict(date=last["date"], value=last["value"], series=observations[-45:],
                kind="daily", source=url)


def read_scand(url):
    """NOAA CPC monthly Scandinavia teleconnection pattern (not daily)."""
    observations = []
    try:
        content = download(url)
        for line in content.splitlines():
            parts = line.split()
            if len(parts) != 3 or not re.fullmatch(r"(?:19|20)\d{2}",parts[0]):
                continue
            try:
                year, month = int(parts[0]), int(parts[1])
                value = float(parts[2])
                date = dt.date(year,month,1)
                if not math.isfinite(value) or value <= -90 or date > dt.date.today():
                    continue
                observations.append(dict(date=date.isoformat(),value=round(value,2)))
            except (ValueError, OverflowError):
                continue
    except Exception as ex:
        return dict(error=str(ex)[:250],date=None,value=None,source=url,kind="monthly")
    if not observations:
        return dict(error="No monthly observations",date=None,value=None,source=url,kind="monthly")
    observations.sort(key=lambda p:p["date"])
    last=observations[-1]
    return dict(date=last["date"],value=last["value"],series=observations[-24:],kind="monthly",source=url)


def upper_air():
    """250 hPa speed over De Bilt: model estimate, NOT jetstream position."""
    params=dict(latitude=52.101,longitude=5.18,
                hourly="wind_speed_250hPa,wind_direction_250hPa",
                models="gfs_seamless",forecast_days=2,timezone="UTC")
    return api("https://api.open-meteo.com/v1/forecast",params)


def polar_vortex():
    """Sparse GEM 10 hPa / 60 N model sampling, NOT an SSW diagnostic."""
    longitudes=[0,60,120,180,-120,-60]
    params=dict(latitude=",".join(["60"]*len(longitudes)),
                longitude=",".join(map(str,longitudes)),
                hourly="wind_speed_10hPa,wind_direction_10hPa",
                models="gem_global",forecast_days=2,timezone="UTC")
    data=api("https://api.open-meteo.com/v1/gem",params)
    grids=data if isinstance(data,list) else [data]
    components=[]
    samples=[]
    for grid in grids:
        speed=(grid.get("hourly") or {}).get("wind_speed_10hPa") or []
        direction=(grid.get("hourly") or {}).get("wind_direction_10hPa") or []
        valid=next(((float(s),float(d)) for s,d in zip(speed,direction)
                    if isinstance(s,(float,int)) and isinstance(d,(float,int))
                    and math.isfinite(s) and math.isfinite(d)),None)
        if valid:
            s,d=valid
            u=-s*math.sin(math.radians(d)) / 3.6
            components.append(u)
            samples.append(dict(longitude=grid.get("longitude"),
                                eastward_wind_ms=round(u,1)))
    if len(components)<4:
        raise RuntimeError("Less than 4 model grid points with valid 10 hPa wind")
    return dict(kind="model_approximation",date=dt.date.today().isoformat(),
                zonal_wind_ms=round(sum(components)/len(components),1),
                n_points=len(components),samples=samples,
                source="Open-Meteo GEM Global model, 10 hPa / 60°N",
                disclaimer="Only sparse model estimate, NOT validated vortex index or SSW diagnosis")

def main():
    now = dt.datetime.now(dt.timezone.utc)
    regions = [
        ("Warschau",52.23,21.01),
        ("Białystok",53.13,23.16),
        ("Minsk",53.90,27.57),
        ("Smolensk",54.78,32.05),
        ("Moskou",55.76,37.62)
    ]
    result = dict(
        collected_at=now.isoformat(), forecast=None,
        ensemble=None, snow=None, upper_air=None, vortex=None, europe=None, outlook=None, previous=None, indices={}, errors={}
    )
    result["previous"] = previous_snapshot(download, ROOT / "data" / "last_good.json")
    operations = {
        "forecast": forecast,
        "forecast_maarssen": lambda: local_forecast(52.139,5.041),
        "forecast_gfs": lambda: local_forecast(52.101,5.18,"gfs_seamless"),
        "reference_reanalysis": recent_reference,
        "europe": lambda: regional_forecast(api),
        "outlook": lambda: regional_outlook(api),
        "ensemble": lambda: api(
            "https://ensemble-api.open-meteo.com/v1/ensemble",
            dict(latitude=52.101,longitude=5.18,
                 daily="temperature_2m_min,temperature_2m_max",
                 models="ecmwf_ifs025_ensemble",
                 timezone="Europe/Amsterdam",forecast_days=14)),
        "upper_air": upper_air,
        "vortex": polar_vortex,
        "snow": lambda: api(
            "https://api.open-meteo.com/v1/forecast",
            dict(latitude=",".join(str(x[1]) for x in regions),
                 longitude=",".join(str(x[2]) for x in regions),
                 hourly="snow_depth,temperature_2m",
                 forecast_days=2,timezone="UTC")),
    }
    # Independent APIs: one slow or unavailable model does not block all the others.
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {name: pool.submit(fn) for name, fn in operations.items()}
        for name, future in futures.items():
            try:
                result[name] = future.result()
                print("OK", name)
            except Exception as ex:
                result["errors"][name] = str(ex)[:250]
                print("UNAVAILABLE", name, ex)

    for name,url in {
        "nao":"https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.nao.cdas.z500.19500101_current.csv",
        "ao":"https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.ao.cdas.z1000.19500101_current.csv",
    }.items():
        result["indices"][name]=read_daily_index(url,name)
        print(name,result["indices"][name].get("date"),result["indices"][name].get("value"),
              result["indices"][name].get("error",""))

    scand_url="https://ftp.cpc.ncep.noaa.gov/wd52dg/data/indices/scand_index.tim"
    result["indices"]["scand"]=read_scand(scand_url)
    print("scand",result["indices"]["scand"].get("date"),
          result["indices"]["scand"].get("value"),
          result["indices"]["scand"].get("error",""))

    if not isinstance(result["forecast"], dict) or not result["forecast"].get("daily", {}).get("time"):
        print("WARNING: forecast unavailable; the website will fetch directly upon opening.")
        result["errors"]["forecast"] = result["errors"].get("forecast","No usable daily forecast")
        result["forecast"] = None
    result = merge_sources(result, ROOT / "data" / "last_good.json", now)
    print("DATA QUALITY", json.dumps(result["data_quality"],ensure_ascii=False))
    for source, status in result["source_status"].items():
        print("SOURCE", source, status["state"], status.get("retrieved_at"))
    result["comparison_sources"]={"forecast_maarssen":"Open-Meteo model, Maarssen 52.139/5.041",
        "forecast_gfs":"Open-Meteo GFS seamless, De Bilt",
        "reference_reanalysis":"Open-Meteo historical reanalysis, NOT official KNMI station observation"}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("Published data snapshot for", now.isoformat(), "size", OUT.stat().st_size)

if __name__ == "__main__":
    main()
