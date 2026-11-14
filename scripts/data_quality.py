"""Source-by-source freshness and last-known-good fallback for Winterradar.

Only forecasts whose *calendar day* still covers today may be reused.
Reuse is time-limited, visibly marked as cached, and never called live.
"""
import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

SOURCE_NAMES = ("forecast", "ensemble", "snow", "europe", "upper_air", "vortex")
TTL_HOURS = {"forecast": 18, "ensemble": 18, "snow": 18,
             "europe": 18, "upper_air": 18, "vortex": 18}
LOCAL_ZONE = ZoneInfo("Europe/Amsterdam")


def utc_time(instant):
    if not instant:
        return None
    try:
        value = dt.datetime.fromisoformat(str(instant).replace("Z", "+00:00"))
        return value.astimezone(dt.timezone.utc)
    except (ValueError, TypeError):
        return None


def valid(source, value, now):
    if not value:
        return False
    if source in ("forecast", "ensemble"):
        daily = value.get("daily") if isinstance(value, dict) else None
        dates = (daily or {}).get("time", [])
        today = now.astimezone(LOCAL_ZONE).date().isoformat()
        required = "temperature_2m_min" if source == "forecast" else None
        if not dates or dates[0] != today:
            return False
        if source == "forecast":
            return len(dates) >= 7 and len((daily or {}).get(required, [])) >= 7
        return len(dates) >= 7 and any(k.startswith("temperature_2m_min_member")
                                         for k in (daily or {}))
    if source == "europe":
        return (isinstance(value, dict)
                and any(len(f.get("points", [])) >= 3 for f in value.get("frames", [])))
    if source == "snow":
        return (isinstance(value, list) and len(value) >= 3)
    if source == "upper_air":
        return (isinstance(value, dict)
                and any(isinstance(x, (float, int))
                        for x in (value.get("hourly") or {}).get("wind_speed_250hPa", [])))
    if source == "vortex":
        return isinstance(value, dict) and isinstance(value.get("zonal_wind_ms"), (float, int))
    return False


def merge_sources(result, cache_path, now):
    previous = {}
    path = Path(cache_path)
    try:
        if path.exists():
            previous = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        previous = {}
    statuses = {}
    saved = {"source_status": {}}
    for source in SOURCE_NAMES:
        candidate = result.get(source)
        if valid(source, candidate, now):
            statuses[source] = {"state": "fresh",
                                "retrieved_at": now.isoformat(),
                                "age_hours": 0}
            saved[source] = candidate
            saved["source_status"][source] = statuses[source]
            continue
        old = previous.get(source)
        older_status = (previous.get("source_status") or {}).get(source, {})
        old_time = utc_time(older_status.get("retrieved_at") or previous.get("collected_at"))
        age = (now-old_time).total_seconds()/3600 if old_time else float("inf")
        if old_time and -0.5 <= age <= TTL_HOURS[source] and valid(source, old, now):
            statuses[source] = {"state": "cached",
                                "retrieved_at": old_time.isoformat(),
                                "age_hours": round(age, 1)}
            result[source] = old
            saved[source] = old
            saved["source_status"][source] = statuses[source]
            result.setdefault("errors", {})[source] = (
                "Bron tijdelijk onbereikbaar; vorige geldige modelrun gebruikt "
                f"({age:.1f} uur oud)"
            )
        else:
            result[source] = None
            statuses[source] = {"state": "missing",
                                "retrieved_at": None, "age_hours": None}
    result["source_status"] = statuses
    result["data_quality"] = {
        "state": ("complete" if all(s["state"] == "fresh" for s in statuses.values())
                  else "partial" if any(s["state"] != "missing" for s in statuses.values())
                  else "unavailable"),
        "fresh_count": sum(s["state"] == "fresh" for s in statuses.values()),
        "cached_count": sum(s["state"] == "cached" for s in statuses.values()),
        "missing_count": sum(s["state"] == "missing" for s in statuses.values()),
        "source_total": len(statuses),
        "note": "Ophaaltijd per databron. Gecachte modellen zijn geen nieuwe voorspellingen.",
    }
    saved["collected_at"] = now.isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return result
