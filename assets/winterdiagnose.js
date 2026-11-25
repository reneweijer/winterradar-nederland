/* Independent, evidence-labeled model diagnosis. No KNMI narrative is imported. */
(function(){
"use strict";
const host=()=>document.getElementById("wrOwnDiagnosis");
const is=n=>typeof n==="number"&&Number.isFinite(n);
const mean=a=>{const v=a.filter(is);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null};
const fmt=n=>is(n)?n.toFixed(1).replace(".",","):"—";
const east=n=>is(n)&&n>=45&&n<=135;
function extra(s){
 const parts=[];
 const valid=is;
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
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
 return '<div style="margin-top:18px">'+'<h3 style="margin-top:22px">Atmosferische indicatoren</h3>'+[['NAO',s.indices?.nao],['AO',s.indices?.ao],['SCAND',s.indices?.scand]].map(([n,v])=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(130,190,225,.15)"><span style="color:${valid(v?.value)?((n==='SCAND'?v.value>0:v.value<0)?'#80bfff':'#e8b67c'):'#8996a3'}">●</span><div style="flex:1"><strong>${n}</strong><div class="soft" style="font-size:.78rem">${valid(v?.value)?(v.value<0?'Negatieve fase':v.value>0?'Positieve fase':'Neutraal'):'Geen gegevens'}</div></div><strong>${fmt(v?.value)}</strong></div>`).join('')+parts.map(x=>'<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(130,190,225,.15)"><span style="color:#80bfff">●</span><div style="font-size:.88rem;line-height:1.5">'+x+'</div></div>').join("")+'<p class="soft">Modeluitkomsten, geen gekalibreerde kansen. Bronnen: <a href="https://www.cpc.ncep.noaa.gov/products/stratosphere/SSW/">NOAA poolwervel</a> · <a href="https://usicecenter.gov/Products/ImsHome">IMS sneeuwdek</a>.</p></div>';
}

async function refresh(){
 const el=host();if(!el)return;
 try{
  const r=await fetch("./data/latest.json?t="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw Error("bronbestand niet bereikbaar");
  const s=await r.json();el.innerHTML=Number.isFinite(Date.parse(s.collected_at))&&Date.now()-Date.parse(s.collected_at)<30*3600000?extra(s):"Geen actuele atmosferische modelopname.";
 }catch(err){el.textContent="Eigen diagnose tijdelijk niet beschikbaar: "+err.message}
}
refresh();
})();
