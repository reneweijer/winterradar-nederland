"""GFS 14-day *model* circulation and upper-air samples for the two KouRadar windows.

Sparsely sampled points do not prove a pressure blocking system or
predict the position of a jet stream. No values are invented.
"""
import datetime as dt
import math
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

LOCATIONS = [
    ("Londen", 51.51, -0.13),
    ("Oslo", 59.91, 10.75),
    ("Stockholm", 59.33, 18.07),
    ("Helsinki", 60.17, 24.94),
    ("Berlijn", 52.52, 13.40),
    ("Warschau", 52.23, 21.01),
    ("Minsk", 53.90, 27.57),
]
HOURLY = "temperature_850hPa,pressure_msl"
LOCAL = ZoneInfo("Europe/Amsterdam")


def _mean(values):
    sample=[float(v) for v in values if isinstance(v,(int,float)) and math.isfinite(v)]
    return round(sum(sample)/len(sample), 2) if sample else None


def _group(api, locations):
    params=dict(
        latitude=",".join(str(x[1]) for x in locations),
        longitude=",".join(str(x[2]) for x in locations),
        hourly=HOURLY,
        forecast_days=14,
        models="gfs_seamless",
        timezone="UTC",
    )
    data=api("https://api.open-meteo.com/v1/forecast",params)
    datasets=data if isinstance(data,list) else [data]
    if len(datasets)!=len(locations):
        raise RuntimeError("Incomplete GFS location array")
    return dict(zip([x[0] for x in locations],datasets))


def regional_outlook(api, today=None):
    """Build 0–7 and 8–14 day windows from common 12 UTC model samples."""
    today=today or dt.datetime.now(dt.timezone.utc).astimezone(LOCAL).date()
    groups=[LOCATIONS[:4], LOCATIONS[4:]]
    points={}
    failures=[]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda group: _safe_group(api,group),groups))
    for result, failure in results:
        points.update(result)
        failures.extend(failure)
    if len(points)<4:
        raise RuntimeError(f"GFS long-range outlook unavailable: {len(points)} locations")
    windows={}
    for key, a, b in (("near",0,7),("later",7,14)):
        day_set={(today+dt.timedelta(days=i)).isoformat() for i in range(a,b)}
        monthly={}
        for name, model in points.items():
            h=model.get("hourly",{}) or {}
            dates=h.get("time",[]) or []
            idx=[i for i,t in enumerate(dates)
                 if t[:10] in day_set and len(t)>=16 and t[11:16]=="12:00"]
            if len(idx)<4:
                continue
            temperature=h.get("temperature_850hPa",[]) or []
            pressure=h.get("pressure_msl",[]) or []
            temps=_mean([temperature[i] for i in idx if i<len(temperature)])
            hpa=_mean([pressure[i] for i in idx if i<len(pressure)])
            monthly[name]={"t850_c":temps,"pressure_hpa":hpa,"n_days":len(idx)}
        src=[monthly.get(k,{}).get("t850_c") for k in ("Berlijn","Warschau","Minsk")]
        cold=_mean(src)
        scand=[monthly.get(k,{}).get("pressure_hpa") for k in ("Oslo","Stockholm","Helsinki")]
        north=_mean(scand)
        london=monthly.get("Londen",{}).get("pressure_hpa")
        diff=round(north-london,2) if north is not None and london is not None else None
        windows[key]=dict(start=(today+dt.timedelta(days=a)).isoformat(),
                          end=(today+dt.timedelta(days=b-1)).isoformat(),
                          t850_c=cold if sum(x is not None for x in src)>=2 else None,
                          scandi_minus_london_hpa=diff if sum(x is not None for x in scand)>=2 else None,
                          sites=monthly,
                          source_sites=len(monthly))
    return dict(kind="forecast_model_samples",model="Open-Meteo GFS seamless",
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        windows=windows,
        locations_available=len(points),locations_expected=len(LOCATIONS),
        failures=failures, note="14-daagse GFS: schaarse 12 UTC-modelpunten, niet de precieze blokkade of jetstroom.")


def _safe_group(api,group):
    try:
        return _group(api,group),[]
    except Exception as e:
        print("GFS outlook group failed:",group[0][0],str(e)[:120])
        return {},[group[0][0]]
