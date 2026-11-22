"""Offline regression checks for WinterLab archive and source separation."""
import json
import pathlib
import tempfile
import winterlab

with tempfile.TemporaryDirectory() as folder:
    root=pathlib.Path(folder)
    winterlab.LATEST=root/"latest.json"
    winterlab.ARCHIVE=root/"history.json"
    daily={"time":["2026-11-22","2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-27","2026-11-28"],
           "temperature_2m_min":[1,0,-1,-2,-1,1,2],
           "temperature_2m_max":[5,4,3,2,3,5,6]}
    snapshot={"collected_at":"2026-11-22T07:00:00+00:00",
       "forecast":{"daily":daily},
       "forecast_maarssen":{"daily":daily},
       "forecast_gfs":{"daily":daily},
       "reference_reanalysis":{"daily":{"time":["2026-11-21"],"temperature_2m_min":[-2],"temperature_2m_max":[4]}},
       "source_status":{"forecast":{"state":"fresh"}}}
    winterlab.LATEST.write_text(json.dumps(snapshot))
    winterlab.run()
    archive=json.loads(winterlab.ARCHIVE.read_text())
    assert len(archive["runs"])==3,archive
    assert {r["location"] for r in archive["runs"]}=={"De Bilt","Maarssen"}
    assert len({r["model"] for r in archive["runs"]})==2
    assert archive["reference_kind"].startswith("Open-Meteo")
    winterlab.run()
    assert len(json.loads(winterlab.ARCHIVE.read_text())["runs"])==3
    snapshot["source_status"]["forecast"]["state"]="cached"
    snapshot["collected_at"]="2026-11-22T11:00:00+00:00"
    winterlab.LATEST.write_text(json.dumps(snapshot))
    winterlab.run()
    assert not any(r["issued_at"]==snapshot["collected_at"] and r["source_key"]=="forecast"
                   for r in json.loads(winterlab.ARCHIVE.read_text())["runs"])
print("PASS WinterLab separate model archive and cached-source guard")
