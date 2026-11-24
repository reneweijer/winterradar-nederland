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
 return '<div class="wr-diag">'+
  '<div style="font-size:clamp(1.15rem,3.8vw,1.55rem);font-weight:750;line-height:1.35;margin-bottom:12px">'+conclusion+'</div>'+
  '<p style="line-height:1.65;margin:0 0 16px">'+intro+'</p>'+
  '<div style="padding:14px 16px;background:rgba(125,190,220,.08);border:1px solid rgba(145,205,235,.16);border-radius:14px;margin-bottom:16px">'+
  '<div style="font-size:.72rem;letter-spacing:.1em;font-weight:750;color:#92cde5;margin-bottom:8px">WAT DE MODELLEN LATEN ZIEN</div>'+
  '<p style="margin:0;line-height:1.6">'+details+coldText+'</p></div>'+
  '<p style="line-height:1.6;margin:0 0 10px"><strong>Het grotere weerpatroon</strong><br>'+flow+'</p>'+
  '<p style="line-height:1.6;margin:0 0 12px"><strong>Waar de modellen verschillen</strong><br>'+modelDiff+'</p>'+
  '<p class="soft" style="font-size:.8rem;line-height:1.5;margin:0">Bijgewerkt '+fmtDate+' · Modelverwachting voor De Bilt · De uitkomst blijft onzeker, vooral op langere termijn.</p>'+
  '</div>';
}

function extra(s){
 const parts=[];
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
   parts.push(name+" · "+label+": "+(complete?frost+" vorstnachten, "+ice+" ijsdagen, "+longest+" dagen aaneengesloten oostenwind":"onvolledige lokale modeldata")+". "+(shares.length===7?"Hoogste dagelijkse sneeuwfractie: "+Math.max(...shares)+"% van ensembleleden (≥0,1 cm).":"Sneeuwensemble onvoldoende beschikbaar."));
  }
 }
 const grid=Array.isArray(s.jet_grid)?s.jet_grid:[];
 if(grid.length){
  const cores=[];
  for(const g of grid){const v=(g.hourly?.wind_speed_250hPa||[]).slice(0,24).filter(valid);if(v.length>=18&&valid(g.latitude)&&valid(g.longitude))cores.push({lat:g.latitude,lon:g.longitude,speed:avg(v)});}
  const west=cores.filter(g=>g.lon<=-15).sort((a,b)=>b.speed-a.speed)[0];
  const europe=cores.filter(g=>g.lon>=0).sort((a,b)=>b.speed-a.speed)[0];
  if(west&&europe)parts.push("Straalstroom: sterkste bemonsterde 250 hPa-wind boven Atlantische sector rond "+fmt(west.lat)+"° N ("+fmt(west.speed)+" km/u), Europese sector "+fmt(europe.lat)+"° N ("+fmt(europe.speed)+" km/u). Indicatieve GFS-gridanalyse; geen bewezen blokkade.");
 }
 if(valid(s.vortex?.zonal_wind_ms))parts.push("Poolwervel: "+fmt(s.vortex.zonal_wind_ms)+" m/s (GEM-steekproef 60° N, 10 hPa). "+(s.vortex.zonal_wind_ms<0?"Oostelijke component: nader onderzoek naar SSW nodig.":"Westelijke component; geen omkering aangetoond.")+" Alleen achtergrondsignaal voor langere termijn.");
 const p=s.outlook?.windows?.near?.scandi_minus_london_hpa,q=s.outlook?.windows?.late?.scandi_minus_london_hpa;
 const a=s.outlook?.windows?.near?.t850_c,b=s.outlook?.windows?.late?.t850_c;
 if(valid(a)&&valid(b))parts.push("Vooruitblik: week 2 is boven Oost-Europa "+fmt(Math.abs(b-a))+" °C "+(b<a?"kouder":"warmer")+" op 850 hPa dan week 1. Geen garantie op aanvoer naar Nederland.");
 if(valid(p)&&valid(q))parts.push("Luchtdrukcontrast Scandinavië–Londen: "+fmt(p)+" → "+fmt(q)+" hPa.");
 return '<div style="margin-top:18px"><strong>Verdiepende winteranalyse</strong>'+parts.map(x=>'<p style="line-height:1.55;margin:8px 0">'+x+'</p>').join("")+'<p class="soft">Ensemblefracties zijn modeluitkomsten, geen gekalibreerde winterkansen. Externe controle: <a href="https://www.cpc.ncep.noaa.gov/products/stratosphere/SSW/">NOAA poolwervel</a> · <a href="https://usicecenter.gov/Products/ImsHome">IMS sneeuwdek</a>.</p></div>';
}

async function refresh(){
 const el=host();if(!el)return;
 try{
  const r=await fetch("./data/latest.json?t="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw Error("bronbestand niet bereikbaar");
  const s=await r.json();el.innerHTML=diagnose(s)+extra(s);
 }catch(err){el.textContent="Eigen diagnose tijdelijk niet beschikbaar: "+err.message}
}
refresh();
})();
