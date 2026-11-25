/* Independent, evidence-labeled model diagnosis. No KNMI narrative is imported. */
(function(){
"use strict";
const host=()=>document.getElementById("wrOwnDiagnosis");
const is=n=>typeof n==="number"&&Number.isFinite(n);
const mean=a=>{const v=a.filter(is);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null};
const fmt=n=>is(n)?n.toFixed(1).replace(".",","):"—";
const east=n=>is(n)&&n>=45&&n<=135;
function diagnose(s){
 const age=Date.now()-Date.parse(s.collected_at||"");
 if(!Number.isFinite(age)||age>30*3600000)return "Geen actuele eigen conclusie: de laatste modelopname is ouder dan 30 uur of mist een geldig tijdstip.";
 const d=s.forecast?.daily||{},days=d.time||[];
 if(days.length<7)return "Geen verantwoorde eigen conclusie: de actuele 7-daagse modelreeks ontbreekt.";
 const min=d.temperature_2m_min||[],max=d.temperature_2m_max||[],dir=d.wind_direction_10m_dominant||[];
 const frost=min.slice(0,7).filter(x=>is(x)&&x<0).length,ice=max.slice(0,7).filter(x=>is(x)&&x<0).length;
 let run=0,longest=0;
 for(const x of dir.slice(0,7)){run=east(x)?run+1:0;longest=Math.max(longest,run)}
 const outlook=s.outlook?.windows?.near;
 const pressure=outlook?.scandi_minus_london_hpa;
 const cold=outlook?.t850_c;
 const minValid=min.slice(0,7).filter(is).length;
 const g=s.forecast_gfs?.daily||{};
 const disagreements=[];
 if(g.temperature_2m_min?.length>=7&&minValid>=5){
  const a=mean(min.slice(0,7)),b=mean(g.temperature_2m_min.slice(0,7));
  if(is(a)&&is(b))disagreements.push("GFS versus standaardmodel: "+fmt(Math.abs(a-b))+" °C verschil in gemiddelde minimumtemperatuur");
 }
 const signals=[];
 if(frost>0)signals.push(frost+" van de eerste 7 nachten met berekende vorst");
 if(ice>0)signals.push(ice+" mogelijke ijsdagen");
 if(longest>=2)signals.push(longest+" dagen aaneengesloten oostelijke wind");
 const isBlocked=is(pressure)&&pressure>8;
 const conclusion=ice>=2&&longest>=3?"Een stevige winterprikkel in de verwachting":
  frost>=2&&longest>=2?"De kou krijgt voorzichtig voet aan de grond":
  frost>=2?"Koude nachten in zicht, winterse doorbraak nog onzeker":
  "Nog geen overtuigende winterse omslag";
 const intro=frost>=2&&longest>=2?
  "De komende week laten de modellen een samenhangend kouder patroon zien. Vooral de combinatie van nachtvorst en aanhoudende oostelijke wind valt op.":
  frost>=2?"Er zijn signalen voor koudere nachten, maar de grootschalige stroming ondersteunt nog geen overtuigende winterse omslag.":
  "De beschikbare modelgegevens wijzen voorlopig niet op een duidelijk doorzettende koudeperiode.";
 const fmtDate=s.collected_at?new Date(s.collected_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"onbekend";
 const modelDiff=disagreements.length?disagreements.join("; ")+".":"Nog geen bruikbare tweede modelreeks.";
 const flow=isBlocked?"De luchtdrukverdeling ondersteunt een hogedruksignaal boven Scandinavië, maar een blokkade is nog niet bevestigd.":
  "Een uitgesproken Scandinavische blokkade is met deze gegevens nog niet vastgesteld.";
 const coldText=is(cold)?" De berekende temperatuur op 850 hPa boven Oost-Europa ligt rond "+fmt(cold)+" °C.":"";
 const details=signals.length?signals.join(" · ")+".":"Nog onvoldoende samenhangende wintersignalen.";
 const metric=(label,value)=>'<div style="padding:12px;border-radius:12px;background:rgba(130,190,225,.09)"><div style="font-size:.75rem;color:#a5c6da">'+label+'</div><div style="font-size:1.65rem;font-weight:750;color:#b9e7ff">'+value+'</div></div>';
 const complete=a=>a.slice(0,7).length===7&&a.slice(0,7).every(is);
 return '<div class="wr-diag"><div style="font-size:1.2rem;font-weight:750;margin:8px 0 14px">'+(complete(min)&&complete(max)&&complete(dir)?conclusion:"Onvolledige modelgegevens")+'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+metric("❄ Vorstnachten",complete(min)?frost+" / 7":"—")+metric("↶ Oostenwind",complete(dir)?longest+" d":"—")+metric("850 hPa · Oost-Europa",fmt(cold)+" °C")+metric("Scandinavië – Londen",fmt(pressure)+" hPa")+'</div><p class="soft" style="font-size:.75rem">De Bilt · Modelverwachting · '+fmtDate+'</p></div>';
}

function extra(s){
 const parts=[], cards=[];
 const tile=(label,value,icon)=>`<div style="background:rgba(130,190,225,.07);border:1px solid rgba(130,190,225,.15);border-radius:12px;padding:12px;min-width:0"><div style="font-size:.75rem;color:#a5c6da">${icon} ${label}</div><div style="font-size:1.55rem;font-weight:750;margin-top:5px;color:#e3f4ff">${value}</div></div>`;
 const valid=n=>typeof n==="number"&&Number.isFinite(n);
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 for(const [name,model,ens] of [["De Bilt",s.forecast,s.ensemble],["Maarssen",s.forecast_maarssen,s.ensemble_snow_maarssen]]){
  const d=model?.daily||{},e=ens?.daily||{};
  const keys=Object.keys(e).filter(k=>/^snowfall_sum_member\d+$/.test(k));
  for(const [start,end,label] of [[0,7,"week 1"],[7,14,"week 2"]]){
   const mins=(d.temperature_2m_min||[]).slice(start,end),maxs=(d.temperature_2m_max||[]).slice(start,end);
   const frost=mins.filter(x=>valid(x)&&x<0).length,ice=maxs.filter(x=>valid(x)&&x<0).length;
   const wind=(d.wind_direction_10m_dominant||[]).slice(start,end);
   let run=0,longest=0;for(const x of wind){run=east(x)?run+1:0;longest=Math.max(run,longest)}
   const shares=(d.time||[]).slice(start,end).map(date=>{const i=(e.time||[]).indexOf(date);const v=keys.map(k=>e[k]?.[i]).filter(valid);return v.length>=5?Math.round(100*v.filter(x=>x>=0.1).length/v.length):null}).filter(valid);
   const complete=mins.length===7&&maxs.length===7&&mins.every(valid)&&maxs.every(valid)&&wind.length===7&&wind.every(valid);
   cards.push(`<div style="padding:14px;border:1px solid rgba(130,190,225,.2);border-radius:16px;margin:10px 0"><strong>${name} · ${label}</strong><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px">${tile("Vorstnachten",complete?frost:"—","❄")}${tile("IJsdagen",complete?ice:"—","🧊")}${tile("Oostenwind",complete?longest+" d":"—","↶")}${tile("Sneeuwfractie",shares.length===7?Math.max(...shares)+"%":"—","❅")}</div><div class="soft" style="font-size:.72rem;margin-top:8px">Langste reeks oostenwind · hoogste dagelijkse ensemblefractie ≥0,1 cm sneeuw</div></div>`);
  }
 }
 const grid=Array.isArray(s.jet_grid)?s.jet_grid:[];
 if(grid.length){
  const cores=[];
  for(const g of grid){const v=(g.hourly?.wind_speed_250hPa||[]).slice(0,24).filter(valid);if(v.length>=18&&valid(g.latitude)&&valid(g.longitude))cores.push({lat:g.latitude,lon:g.longitude,speed:avg(v)});}
  const west=cores.filter(g=>g.lon<=-15).sort((a,b)=>b.speed-a.speed)[0];
  const europe=cores.filter(g=>g.lon>=0).sort((a,b)=>b.speed-a.speed)[0];
  if(west&&europe)parts.push("<strong>Straalstroom · 250 hPa</strong><br>Atlantisch: "+fmt(west.lat)+"° N · "+fmt(west.speed)+" km/u<br>Europa: "+fmt(europe.lat)+"° N · "+fmt(europe.speed)+" km/u<br><small>GFS-steekproef</small>");
 }
 if(valid(s.vortex?.zonal_wind_ms))parts.push("<strong>Poolwervel · 10 hPa</strong><br>"+fmt(s.vortex.zonal_wind_ms)+" m/s · "+(s.vortex.zonal_wind_ms<0?"Oostelijke":"Westelijke")+" component<br><small>GEM-steekproef · geen SSW-diagnose</small>");
 const p=s.outlook?.windows?.near?.scandi_minus_london_hpa,q=s.outlook?.windows?.late?.scandi_minus_london_hpa;
 const a=s.outlook?.windows?.near?.t850_c,b=s.outlook?.windows?.late?.t850_c;
 if(valid(a)&&valid(b))parts.push("Vooruitblik: week 2 is boven Oost-Europa "+fmt(Math.abs(b-a))+" °C "+(b<a?"kouder":"warmer")+" op 850 hPa dan week 1. Geen garantie op aanvoer naar Nederland.");
 if(valid(p)&&valid(q))parts.push("Luchtdrukcontrast Scandinavië–Londen: "+fmt(p)+" → "+fmt(q)+" hPa.");
 return '<div style="margin-top:18px">'+cards.join("")+'<h3 style="margin-top:22px">Atmosferische indicatoren</h3>'+[['NAO',s.indices?.nao],['AO',s.indices?.ao],['SCAND',s.indices?.scand]].map(([n,v])=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(130,190,225,.15)"><span style="color:${valid(v?.value)?(v.value<0?'#80bfff':'#e8b67c'):'#8996a3'}">●</span><div style="flex:1"><strong>${n}</strong><div class="soft" style="font-size:.78rem">${valid(v?.value)?(v.value<0?'Negatieve fase':'Niet-negatieve fase'):'Geen gegevens'}</div></div><strong>${fmt(v?.value)}</strong></div>`).join('')+parts.map(x=>'<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(130,190,225,.15)"><span style="color:#80bfff">●</span><div style="font-size:.88rem;line-height:1.5">'+x+'</div></div>').join("")+'<p class="soft">Modeluitkomsten, geen gekalibreerde kansen. Bronnen: <a href="https://www.cpc.ncep.noaa.gov/products/stratosphere/SSW/">NOAA poolwervel</a> · <a href="https://usicecenter.gov/Products/ImsHome">IMS sneeuwdek</a>.</p></div>';
}

async function refresh(){
 const el=host();if(!el)return;
 try{
  const r=await fetch("./data/latest.json?t="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw Error("bronbestand niet bereikbaar");
  const s=await r.json();el.innerHTML=diagnose(s)+(Date.now()-Date.parse(s.collected_at)<30*3600000?extra(s):"");
 }catch(err){el.textContent="Eigen diagnose tijdelijk niet beschikbaar: "+err.message}
}
refresh();
})();
