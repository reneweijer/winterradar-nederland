(function(){
"use strict";
const el=id=>document.getElementById(id);
const fmt=x=>Number.isFinite(x)?x.toFixed(1).replace(".",",")+" °C":"—";
const formatDate=s=>{try{return new Date(s).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}catch(_){return s||"—"}};
async function load(){
 const status=el("labStatus"),stats=el("labStats"),table=el("labRows");
 if(!status||!stats||!table)return;
 try{
  const response=await fetch("./data/winterlab-history.json?x="+Date.now(),{cache:"no-store"});
  if(!response.ok)throw Error("archief nog niet gepubliceerd");
  const data=await response.json(),runs=(data.runs||[]).filter(r=>r.days?.length);
  if(!runs.length){status.textContent="Het archief wordt opgebouwd. Er zijn nog geen geldige dagopnamen.";return}
  const newest=runs[runs.length-1];
  const byDate=new Map();
  for(const run of runs)for(const day of run.days||[]){
   if(!byDate.has(day.date))byDate.set(day.date,[]);
   byDate.get(day.date).push({issued:run.issued_at,min:day.temperature_2m_min,max:day.temperature_2m_max});
  }
  const revisions=[...byDate.entries()].filter(([_,v])=>v.length>1).map(([date,v])=>({date,first:v[0],last:v[v.length-1]})).sort((a,b)=>b.date.localeCompare(a.date));
  const diffs=revisions.map(x=>Number.isFinite(x.first.min)&&Number.isFinite(x.last.min)?Math.abs(x.first.min-x.last.min):null).filter(Number.isFinite);
  const avg=diffs.length?diffs.reduce((a,b)=>a+b,0)/diffs.length:null;
  stats.innerHTML='<div class="card"><div class="cardtitle">BEWAARDE MODELVERWACHTINGEN</div><div class="big">'+runs.length+'</div><div class="soft">Datering per uitgifte, De Bilt</div></div>'+
   '<div class="card"><div class="cardtitle">VERGELIJKBARE DOELDATUMS</div><div class="big">'+revisions.length+'</div><div class="soft">Meerdere modelruns voor dezelfde datum</div></div>'+
   '<div class="card"><div class="cardtitle">GEM. BIJSTELLING MINIMUM</div><div class="big">'+fmt(avg)+'</div><div class="soft">Eerste versus laatste verwachting; geen voorspelfout</div></div>';
  status.textContent="Laatste archiefopname: "+formatDate(newest.issued_at)+". Bron: Open-Meteo-modelverwachtingen.";
  if(!revisions.length){table.innerHTML='<tr><td colspan="4">Nog geen vergelijkbare modelruns. Na nieuwe updates verschijnt hier hoe voorspellingen veranderen.</td></tr>';return}
  table.innerHTML=revisions.slice(0,12).map(x=>'<tr><td>'+x.date+'</td><td>'+fmt(x.first.min)+'</td><td>'+fmt(x.last.min)+'</td><td>'+fmt(Number.isFinite(x.first.min)&&Number.isFinite(x.last.min)?x.last.min-x.first.min:null)+'</td></tr>').join("");
 }catch(err){status.textContent="Archief nog niet beschikbaar: "+err.message}
}
load();
})();