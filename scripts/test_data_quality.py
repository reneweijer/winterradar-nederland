"""Offline regression checks for cache ages, forecast dates and missing values."""
import datetime as dt
import json
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo
from data_quality import valid, merge_sources

now = dt.datetime(2026,11,14,17,0,tzinfo=dt.timezone.utc)
today = now.astimezone(ZoneInfo("Europe/Amsterdam")).date()
dates = [(today + dt.timedelta(days=i)).isoformat() for i in range(14)]
sample = {"daily":{"time":dates,"temperature_2m_min":[-1]*14}}
assert valid("forecast",sample,now)
assert not valid("forecast",{"daily":{"time":dates[:-8],"temperature_2m_min":[0]*6}},now)
assert not valid("forecast",{"daily":{"time":dates[1:],"temperature_2m_min":[-1]*13}},now)
assert not valid("upper_air",{},now)
assert valid("europe",{"frames":[{"points":[{}, {}, {}]}]},now)

with tempfile.TemporaryDirectory() as t:
    cache=Path(t)/"last_good.json"
    prev=now-dt.timedelta(hours=10)
    cache.write_text(json.dumps({
        "collected_at":prev.isoformat(),
        "forecast":sample,
        "source_status":{"forecast":{"state":"fresh","retrieved_at":prev.isoformat()}},
    }))
    result={"forecast":None,"errors":{"forecast":"timeout"}}
    updated=merge_sources(result,cache,now)
    assert updated["forecast"]==sample
    assert updated["source_status"]["forecast"]["state"]=="cached"
    assert updated["source_status"]["forecast"]["age_hours"]==10
    assert updated["data_quality"]["missing_count"]==5
    # Do not keep data indefinitely
    after=now+dt.timedelta(days=2)
    stale=merge_sources({"forecast":None,"errors":{}},cache,after)
    assert stale["forecast"] is None
    assert stale["source_status"]["forecast"]["state"]=="missing"
print("PASS: source cache freshness, expiry and date checks")
