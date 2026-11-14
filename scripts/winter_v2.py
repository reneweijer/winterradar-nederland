"""Winterradar v2: multi-site pressure and upper-level forecast samples.

Every value is a forecast model output, not an observation.
A handful of samples are not a meteorological weather chart and do not
locate a blocking high or jet stream with scientific precision.
"""
import datetime as dt
import math

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
    p = dict(
        latitude=",".join(str(x[1]) for x in SITES),
        longitude=",".join(str(x[2]) for x in SITES),
        hourly=",".join(VARIABLES.keys()),
        models="gfs_seamless",
        forecast_days=4,
        timezone="UTC",
    )
    raw = api("https://api.open-meteo.com/v1/forecast", p)
    datasets = raw if isinstance(raw, list) else [raw]
    if len(datasets) != len(SITES):
        raise RuntimeError(f"Expected {len(SITES)} regional locations, got {len(datasets)}")

    times = (datasets[0].get("hourly") or {}).get("time") or []
    if len(times) < 25:
        raise RuntimeError("Regional hourly forecast times are unavailable")
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    frame_hours = (6, 24, 48)
    frames = []
    for lead in frame_hours:
        target = now + dt.timedelta(hours=lead)
        index = next(
            (i for i, stamp in enumerate(times)
             if dt.datetime.fromisoformat(stamp.replace("Z", "+00:00")).replace(tzinfo=None) >= target),
            len(times) - 1,
        )
        spots = []
        for site, data in zip(SITES, datasets):
            hourly = data.get("hourly") or {}
            spot = dict(name=site[0], lat=site[1], lon=site[2])
            for api_key, out_key in VARIABLES.items():
                seq = hourly.get(api_key) or []
                val = seq[index] if index < len(seq) else None
                spot[out_key] = finite_or_none(val)
            spots.append(spot)
        frames.append(dict(
            lead_hours=lead,
            valid_for=times[index] + "Z",
            points=spots,
        ))
    return dict(
        model="Open-Meteo GFS seamless",
        kind="forecast_model_points",
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        frames=frames,
        note="Slechts 13 modelpunten. Geen doorlopende isobaren, geen exacte jetstreamligging.",
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
            indices={k:dict(date=v.get("date"),value=v.get("value"))
                     for k,v in (previous.get("indices") or {}).items()
                     if isinstance(v,dict)},
        )
    except Exception as exc:
        print("No prior daily snapshot available:",str(exc)[:130])
        return None
