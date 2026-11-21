#!/usr/bin/env python3
"""Archive dated model forecasts for later verification; no inferred observations."""
import datetime as dt
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/"data"/"winterlab-history.json"
LATEST=ROOT/"data"/"latest.json"
MAX_RUNS=365

def run():
    try: latest=json.loads(LATEST.read_text())
    except (OSError,ValueError) as exc:
        raise SystemExit(f"WinterLab: latest snapshot unavailable: {exc}")
    try: history=json.loads(ARCHIVE.read_text()) if ARCHIVE.exists() else {"schema":1,"runs":[]}
    except (OSError,ValueError): history={"schema":1,"runs":[]}
    runs=history.get("runs",[])
    stamp=latest.get("collected_at")
    daily=(latest.get("forecast") or {}).get("daily") or {}
    times=daily.get("time") or []
    if not stamp or not times:
        print("WinterLab: no dated forecast, preserving archive")
        ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
        ARCHIVE.write_text(json.dumps({"schema":1,"runs":runs[-MAX_RUNS:]},ensure_ascii=False))
        return
    fields=("temperature_2m_min","temperature_2m_max","wind_direction_10m_dominant","snowfall_sum")
    days=[]
    for i,date in enumerate(times[:14]):
        record={"date":date}
        for field in fields:
            values=daily.get(field) or []
            record[field]=values[i] if i<len(values) and isinstance(values[i],(int,float)) else None
        days.append(record)
    indices=latest.get("indices") or {}
    entry={"issued_at":stamp,"location":"De Bilt","kind":"modelverwachting",
           "source":"Open-Meteo forecast via Winterradar snapshot","days":days,
           "nao":{k:indices.get("nao",{}).get(k) for k in ("date","value")},
           "ao":{k:indices.get("ao",{}).get(k) for k in ("date","value")}}
    runs=[r for r in runs if r.get("issued_at")!=stamp]
    runs.append(entry)
    runs.sort(key=lambda r:r.get("issued_at",""))
    ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
    ARCHIVE.write_text(json.dumps({"schema":1,"updated_at":dt.datetime.now(dt.timezone.utc).isoformat(),
        "runs":runs[-MAX_RUNS:]},ensure_ascii=False,separators=(",",":")))
    print(f"WinterLab: {len(runs[-MAX_RUNS:])} dated forecasts stored")

if __name__=="__main__":run()
