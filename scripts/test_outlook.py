"""Mocked-data regression tests; never depend on outside weather services."""
import datetime as dt
from outlook import LOCATIONS, regional_outlook

today=dt.date(2026,11,14)
start=today
times=[(dt.datetime.combine(start,dt.time())+dt.timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M")
       for i in range(14*24)]
def mock_api(url,p):
    names=list(zip(p["latitude"].split(","),p["longitude"].split(",")))
    data=[]
    for lat,lon in names:
        point = next(x for x in LOCATIONS if str(x[1])==lat and str(x[2])==lon)
        name=point[0]
        low=name in ("Berlijn","Warschau","Minsk")
        north=name in ("Oslo","Stockholm","Helsinki")
        t850=[-3 if i<7*24 else -8 for i in range(14*24)] if low else [0]*len(times)
        pressure=[1030 if north else 1010 for _ in times]
        data.append(dict(hourly={"time":times,"temperature_850hPa":t850,"pressure_msl":pressure}))
    return data
res=regional_outlook(mock_api,today)
assert res["locations_available"]==7
assert res["windows"]["near"]["t850_c"]==-3
assert res["windows"]["later"]["t850_c"]==-8
assert res["windows"]["near"]["scandi_minus_london_hpa"]==20
assert res["windows"]["later"]["start"]=="2026-11-21"
assert res["windows"]["later"]["end"]=="2026-11-27"
print("PASS: 14-day GFS outlook uses correct near/later date ranges and regional aggregates")
