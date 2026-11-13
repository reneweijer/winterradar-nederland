#!/usr/bin/env python3
"""Winterradar: daily public-data snapshot (Python standard library only).

Forecasts are model results, not observations; the index data source may lag.
Missing values remain null rather than being turned into zero.
"""
import datetime as dt
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request

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
    try:
        return api("https://api.open-meteo.com/v1/forecast", params)
    except Exception as ex:
        print("250 hPa forecast unavailable; retrying without high-altitude wind:", ex)
        params.pop("hourly")
        return api("https://api.open-meteo.com/v1/forecast", params)

def nao_ao_index(url):
    observations = []
    try:
        for line in download(url).splitlines():
            values = line.split()
            if len(values) < 4:
                continue
            try:
                yy, mm, dd = map(int, values[:3])
                value = float(values[3])
                date = dt.date(yy, mm, dd)
                if not (dt.date(1950,1,1) <= date <= dt.date.today() + dt.timedelta(days=1)):
                    continue
                if not math.isfinite(value) or abs(value) > 20:
                    continue
                observations.append(dict(date=date.isoformat(), value=round(value, 3)))
            except (ValueError, OverflowError):
                continue
    except Exception as ex:
        return dict(error=str(ex)[:250], date=None, value=None, source=url)
    if not observations:
        return dict(error="No valid data", date=None, value=None, source=url)
    observations.sort(key=lambda x: x["date"])
    return dict(
        date=observations[-1]["date"],
        value=observations[-1]["value"],
        series=observations[-45:],
        source=url
    )

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
        ensemble=None, snow=None, indices={}, errors={}
    )
    operations = {
        "forecast": forecast,
        "ensemble": lambda: api(
            "https://ensemble-api.open-meteo.com/v1/ensemble",
            dict(latitude=52.101,longitude=5.18,
                 daily="temperature_2m_min,temperature_2m_max",
                 models="ecmwf_ifs025_ensemble",
                 timezone="Europe/Amsterdam",forecast_days=14)),
        "snow": lambda: api(
            "https://api.open-meteo.com/v1/forecast",
            dict(latitude=",".join(str(x[1]) for x in regions),
                 longitude=",".join(str(x[2]) for x in regions),
                 hourly="snow_depth,temperature_2m",
                 forecast_days=2,timezone="UTC")),
    }
    for name, fn in operations.items():
        try:
            result[name] = fn()
            print("OK", name)
        except Exception as ex:
            result["errors"][name] = str(ex)[:250]
            print("UNAVAILABLE", name, ex)

    for name, url in {
        "nao": "https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.nao.index.b500101.current.ascii",
        "ao": "https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.ao.index.b500101.current.ascii",
    }.items():
        result["indices"][name] = nao_ao_index(url)
        print(name, result["indices"][name].get("date"))

    if not isinstance(result["forecast"], dict) or not result["forecast"].get("daily", {}).get("time"):
        raise SystemExit("Daily forecast missing: retaining previous deployed site")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("Published data snapshot for", now.isoformat(), "size", OUT.stat().st_size)

if __name__ == "__main__":
    main()
