#!/usr/bin/env python3
"""Archive model issues and explicitly labeled reanalysis reference; never fabricate observations."""
import datetime as dt
import json
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/"data"/"winterlab-history.json"
LATEST=ROOT/"data"/"latest.json"
MAX_RUNS=1500
FIELDS=("temperature_2m_min","temperature_2m_max","wind_direction_10m_dominant","snowfall_sum")

def days_from(data,fields=FIELDS):
    daily=(data or {}).get("daily") or {}
    times=daily.get("time") or []
    return [{**{"date":date},**{k:(daily.get(k) or [])[i] if i<len(daily.get(k) or []) and isinstance((daily.get(k) or [])[i],(int,float)) else None for k in fields}} for i,date in enumerate(times[:14])]

def run():
    latest=json.loads(LATEST.read_text(encoding="utf-8"))
    try: history=json.loads(ARCHIVE.read_text(encoding="utf-8"))
    except (OSError,ValueError): history={"schema":2,"runs":[],"references":{}}
    runs=history.get("runs",[])
    stamp=latest.get("collected_at")
    for key,place,model in (("forecast","De Bilt","Open-Meteo standaardmodel"),
                            ("forecast_maarssen","Maarssen","Open-Meteo standaardmodel"),
                            ("forecast_gfs","De Bilt","GFS seamless")):
        source=latest.get(key)
        if not isinstance(source,dict) or not stamp: continue
        days=days_from(source)
        if len(days)<7:continue
        # Only genuine newly fetched data may be archived as a new issue.
        status=(latest.get("source_status") or {}).get(key,{})
        if key=="forecast" and status.get("state")!="fresh":continue
        entry={"issued_at":stamp,"location":place,"model":model,"kind":"modelverwachting",
               "days":days,"source_key":key}
        runs=[r for r in runs if not (r.get("issued_at")==stamp and r.get("location")==place and r.get("model",r.get("source",""))==model)]
        runs.append(entry)
    runs.sort(key=lambda x:x.get("issued_at",""))
    references=history.get("references",{})
    ref=latest.get("reference_reanalysis")
    if isinstance(ref,dict):
        for d in days_from(ref,("temperature_2m_min","temperature_2m_max")):
            if d["temperature_2m_min"] is not None and d["temperature_2m_max"] is not None:
                references[d["date"]]={"min":d["temperature_2m_min"],"max":d["temperature_2m_max"]}
    # Keep enough references to verify the oldest archived forecast.
    oldest=(runs[-MAX_RUNS:][0].get("issued_at","")[:10] if runs else "")
    references={k:v for k,v in sorted(references.items()) if k>=oldest}
    ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
    ARCHIVE.write_text(json.dumps({"schema":2,"updated_at":dt.datetime.now(dt.timezone.utc).isoformat(),
      "reference_kind":"Open-Meteo historical reanalysis (NOT KNMI station observation)",
      "runs":runs[-MAX_RUNS:],"references":references},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"WinterLab: {len(runs[-MAX_RUNS:])} issues; {len(references)} reference days")

if __name__=="__main__":run()
