"""Winterradar v2: multi-site pressure and upper-level forecast samples.

Every value is a forecast model output, not an observation.
A handful of samples are not a meteorological weather chart and do not
locate a blocking high or jet stream with scientific precision.
"""
import datetime as dt
import math
from concurrent.futures import ThreadPoolExecutor

SITES = [
    ("Azoren", 37.75, -25.67),
    ("IJsland", 64.14, -21.94),
    ("Londen", 51.51, -0.13),
    ("Parijs", 48.86, 2.35),
    ("De Bilt", 52.10, 5.18),
    ("Berlijn", 52.52, 13.40),
    ("Kopenhagen", 55.68, 12.57),
    ("Oslo", 59.91, 10.75),
    ("Stockholm", 59.33, 18.07),
    ("Helsinki", 60.17, 24.94),
    ("Warschau", 52.23, 21.01),
    ("Minsk", 53.90, 27.57),
    ("Moskou", 55.75, 37.62),
]
VARIABLES = {
    "pressure_msl": "pressure_hpa",
    "wind_speed_10m": "wind10_kmh",
    "wind_direction_10m": "wind10_from",
    "temperature_850hPa": "t850_c",
    "wind_speed_250hPa": "jet250_kmh",
    "wind_direction_250hPa": "jet250_from"
}

def finite_or_none(value, digits=1):
    if isinstance(value, (int, float)) and math.isfinite(value):
        return round(float(value), digits)
    return None


def regional_forecast(api):
    """Retrieve independent groups; return partial, *labeled* model points on failure."""
    # Using smaller requests prevents one slow or unavailable point from
    # making the entire European view disappear.
    groups = [SITES[:5], SITES[5:9], SITES[9:]]
    results = []
    failures = []

    def fetch_group(group):
        params = dict(
            latitude=",".join(str(x[1]) for x in group),
            longitude=",".join(str(x[2]) for x in group),
            hourly=",".join(VARIABLES.keys()),
            models="gfs_seamless", forecast_days=3, timezone="UTC",
        )
        trouble = None
        try:
            raw = api("https://api.open-meteo.com/v1/forecast", params)
        except Exception as exc:
            trouble = group[0][0]
            print("Regional upper-level batch failed:", trouble, str(exc)[:150])
            params["hourly"] = "pressure_msl,wind_speed_10m,wind_direction_10m,temperature_850hPa"
            try:
                raw = api("https://api.open-meteo.com/v1/forecast", params)
            except Exception as second:
                print("Regional fallback batch failed:", trouble, str(second)[:150])
                return [], [trouble]
        samples = raw if isinstance(raw,list) else [raw]
        if len(samples) != len(group):
            return [], [group[0][0]]
        return list(zip(group,samples)), ([trouble] if trouble else [])

    # Independent requests in parallel: a slow model group no longer stalls
    # every other group sequentially.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for group_data, group_failures in pool.map(fetch_group,groups):
            results.extend(group_data)
            failures.extend(group_failures)
    if len(results) < 3:
        raise RuntimeError("Fewer than 3 usable model locations after partial retries")

    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    frames = []
    for lead in (6,24,48):
        target=now+dt.timedelta(hours=lead)
        spots = []
        valid_for = None
        for site, data in results:
            hourly = data.get("hourly") or {}
            times = hourly.get("time") or []
            if not times:
                continue
            index = next(
                (i for i, stamp in enumerate(times)
                 if dt.datetime.fromisoformat(stamp.replace("Z","+00:00")).replace(tzinfo=None)>=target),
                len(times)-1,
            )
            valid_for = times[index]+"Z"
            spot = dict(name=site[0],lat=site[1],lon=site[2])
            for api_key,out_key in VARIABLES.items():
                seq=hourly.get(api_key) or []
                value=seq[index] if index<len(seq) else None
                spot[out_key]=finite_or_none(value)
            spots.append(spot)
        frames.append(dict(lead_hours=lead,valid_for=valid_for,points=spots))
    return dict(
        model="Open-Meteo GFS seamless",
        kind="forecast_model_points",
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        frames=frames,
        locations_expected=len(SITES),
        locations_available=len(results),
        failures=failures,
        note="Onvolledige modelpunten mogelijk; geen continue isobaren of exacte jetstreamligging.",
    )


def previous_snapshot(download):
    """Fetch the previous published daily snapshot to compare matching dates."""
    url="https://reneweijer.github.io/winterradar-nederland/data/latest.json"
    try:
        import json
        previous=json.loads(download(url, timeout=8))
        instant=dt.datetime.fromisoformat(previous["collected_at"].replace("Z","+00:00"))
        age=dt.datetime.now(dt.timezone.utc)-instant
        if not (dt.timedelta(hours=6)<age<dt.timedelta(days=7)):
            return None
        daily=((previous.get("forecast") or {}).get("daily") or {})
        return dict(
            collected_at=previous["collected_at"],
            location="De Bilt",
            forecast=dict(daily={
                "time": daily.get("time",[]),
                "temperature_2m_min":daily.get("temperature_2m_min",[]),
                "temperature_2m_max":daily.get("temperature_2m_max",[]),
                "wind_direction_10m_dominant":daily.get("wind_direction_10m_dominant",[]),
            }),
            ensemble=previous.get("ensemble"),
            snow=previous.get("snow"),
            europe=previous.get("europe"),
            outlook=previous.get("outlook"),
            source_status=previous.get("source_status"),
            indices={k:dict(date=v.get("date"),value=v.get("value"))
                     for k,v in (previous.get("indices") or {}).items()
                     if isinstance(v,dict)},
        )
    except Exception as exc:
        print("No prior daily snapshot available:",str(exc)[:130])
        return None
