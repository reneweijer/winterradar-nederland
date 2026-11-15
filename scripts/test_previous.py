"""Regression: previous daily model is loaded from local Actions cache, not only website."""
import datetime as dt
import json
import tempfile
from pathlib import Path
from winter_v2 import previous_snapshot

now=dt.datetime.now(dt.timezone.utc)
yesterday=(now-dt.timedelta(days=1)).date()
prior={
    "collected_at":(now-dt.timedelta(hours=9)).isoformat(),
    "forecast":{"daily":{
        "time":[(yesterday+dt.timedelta(days=i)).isoformat() for i in range(14)],
        "temperature_2m_min":[1]*14,
        "temperature_2m_max":[5]*14,
        "wind_direction_10m_dominant":[90]*14,
    }},
    "ensemble":{"daily":{"time":[(yesterday+dt.timedelta(days=i)).isoformat() for i in range(14)]}},
    "outlook":{"windows":{"near":{"t850_c":-3},"later":{"t850_c":1}}},
    "indices":{"nao":{"date":yesterday.isoformat(),"value":-0.8}},
}
with tempfile.TemporaryDirectory() as temp:
    cache=Path(temp)/"last_good.json"
    cache.write_text(json.dumps(prior),encoding="utf-8")
    def unavailable(*args,**kwargs):
        raise RuntimeError("No network; use local cache")
    previous=previous_snapshot(unavailable,cache)
    assert previous is not None
    assert previous["collected_at"]==prior["collected_at"]
    assert previous["forecast"]["daily"]["time"][0]==yesterday.isoformat()
    assert previous["outlook"]["windows"]["near"]["t850_c"]==-3
    assert previous["indices"]["nao"]["value"]==-0.8
print("PASS: yesterday's run survives lack of website connectivity")
