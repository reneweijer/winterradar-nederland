(function(){
"use strict";
const el=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(n)?n.toFixed(1).replace(".",",")+" °C":"—";
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const date=s=>{try{return new Date(s).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}catch(_){return s||"—"}};
function metric(title,value,desc){return '<div class="card"><div class="cardtitle">'+title+'</div><div class="big">'+value+'</div><div class="soft">'+desc+'</div></div>'}
async function load(){
 const status=el("labStatus"),stats=el("labStats"),table=el("labRows"),model=el("labModelDuel");
 if(!status||!stats||!table)return;
 try{
  const res=await fetch("./data/winterlab-history.json?t="+Date.now(),{cache:"no-store"});
  if(!res.ok)throw Error("archief nog niet gepubliceerd");
  const archive=await res.json(),runs=(archive.runs||[]).filter(x=>x.days?.length),refs=archive.references||{};
  if(!runs.length){status.textContent="Nog geen opgeslagen modelverwachtingen. Wacht op een geslaagde GitHub-update.";return}
  const unique=[...new Set(runs.map(x=>x.issued_at))].length;
  const byKey=new Map();
  for(const run of runs)for(const day of run.days){
   const key=(run.location||"De Bilt")+"|"+(run.model||"historisch")+"|"+day.date;
   if(!byKey.has(key))byKey.set(key,[]);
   byKey.get(key).push({run,day});
  }
  const revisions=[...byKey].filter(([_,v])=>v.length>1).map(([key,v])=>({key,first:v[0],last:v[v.length-1]}));
  const changes=revisions.map(x=>Number.isFinite(x.first.day.temperature_2m_min)&&Number.isFinite(x.last.day.temperature_2m_min)?
    Math.abs(x.first.day.temperature_2m_min-x.last.day.temperature_2m_min):null).filter(Number.isFinite);
  const verified=[];
  for(const run of runs){
   if(run.location!=="De Bilt")continue;
   const issued=run.issued_at.slice(0,10);
   for(const d of run.days){
    const lead=Math.round((Date.parse(d.date+"T12:00:00Z")-Date.parse(issued+"T12:00:00Z"))/86400000);
    const reference=refs[d.date];
    if(lead<1||lead>14||!reference||!Number.isFinite(d.temperature_2m_min))continue;
    verified.push({model:run.model||"Historisch",lead,error:d.temperature_2m_min-reference.min,issued:run.issued_at,target:d.date});
   }
  }
  const daily7=verified.filter(x=>x.lead>=6&&x.lead<=8);
  stats.innerHTML=metric("MODEL-UITGIFTES",unique.toString(),runs.length+" locatie/model-opnamen")+
   metric("GEM. BIJSTELLING MINIMUM",fmt(avg(changes)),"Modelverschuiving; geen voorspellingsfout")+
   metric("MAE DAG 6–8",fmt(avg(daily7.map(x=>Math.abs(x.error)))),"De Bilt t.o.v. heranalyse; "+daily7.length+" vergelijkingen");
  status.textContent="Laatste archiefopname: "+date(runs[runs.length-1].issued_at)+
   ". De verificatie gebruikt Open-Meteo historische heranalyse, NIET officiële KNMI-stationsmetingen. Modeluitgiftes en referentiedata zijn verschillende gegevenssoorten.";
  const rows=revisions.sort((a,b)=>b.key.localeCompare(a.key)).slice(0,12);
  table.innerHTML=rows.length?rows.map(x=>{
   const a=x.first.day.temperature_2m_min,b=x.last.day.temperature_2m_min;
   return '<tr><td>'+x.key.replaceAll("|"," · ")+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td><td>'+fmt(Number.isFinite(a)&&Number.isFinite(b)?b-a:null)+'</td></tr>'
  }).join(""):'<tr><td colspan="4">Nog geen herhaalde modelverwachtingen voor dezelfde datum.</td></tr>';
  if(model){
   const groups=new Map();
   for(const x of verified){
    if(!groups.has(x.model))groups.set(x.model,[]);
    groups.get(x.model).push(x);
   }
   model.innerHTML=groups.size?[...groups].map(([name,v])=>{
    const near=v.filter(x=>x.lead<=3),mid=v.filter(x=>x.lead>=6&&x.lead<=8);
    return '<div class="card"><strong>'+name+'</strong><p>1–3 dagen: '+fmt(avg(near.map(x=>Math.abs(x.error))))+
     ' ('+near.length+' vergelijkingen)</p><p>6–8 dagen: '+fmt(avg(mid.map(x=>Math.abs(x.error))))+
     ' ('+mid.length+' vergelijkingen)</p></div>'
   }).join(""):'<p>Er zijn nog geen afgeronde voorspellingen met een vergelijkbare heranalyse beschikbaar.</p>';
  }
 }catch(err){status.textContent="WinterLab kon het archief niet laden: "+err.message}
}
load();
})();