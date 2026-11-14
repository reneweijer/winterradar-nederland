/* Winterradar 2.0 - model-based daily interpretation and sampled European forecast map.
 * This code does not issue a scientifically calibrated winter probability.
 */
(function(){
"use strict";
const e=id=>document.getElementById(id);
const val=n=>Number.isFinite(n)?n:null;
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d).replace(".",","):"—";
const labelDate=stamp=>{try{return new Date(stamp+"T12:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"short"});}catch(_){return stamp||"—"}};
const mean=a=>{const b=a.filter(Number.isFinite);return b.length?b.reduce((x,y)=>x+y,0)/b.length:null};
const isEast=d=>Number.isFinite(d)&&d>=45&&d<=135;
const daysSince=iso=>{const d=Date.parse(iso);return Number.isFinite(d)?(Date.now()-d)/86400000:Infinity};
let lastSnapshot=null,lastForecast=null,lastEns=null,lastEast=null,lastIndices=null,lastLoc="debilt";

function getEnsemble(data) {
 const daily=data?.daily;
 if(!daily)return null;
 const keys=Object.keys(daily).filter(x=>/^temperature_2m_min_member/.test(x));
 if(keys.length<5)return null;
 const days=(daily.time||[]).map((day,i)=>{
  const members=keys.map(k=>daily[k]?.[i]).filter(Number.isFinite);
  if(members.length<5)return null;
  const frost=members.filter(x=>x<0).length;
  return {day, members:members.length, frost, fraction:frost/members.length};
 });
 return days.length?days:null;
}
function getSnow(data){
 const arr=Array.isArray(data)?data:(data?[data]:[]);
 const depths=[];
 for(const item of arr.slice(0,5)){
  const h=item.hourly||{},time=h.time||[],snow=h.snow_depth||[];
  const idx=Math.max(0,time.findIndex(t=>Date.parse(t+"Z")>=Date.now()));
  const depth=snow[idx];
  if(Number.isFinite(depth))depths.push(depth);
 }
 return depths.length>=3?depths:null;
}
function getRegion(frame){
 if(!frame?.points)return null;
 return frame.points;
}
function getRegionalPoint(pts,name) {return pts?.find(p=>p.name===name);}
function analysisInputs(forecast,ens,east,indices,snapshot){
 const d=forecast?.daily||{},days=d.time||[],mins=d.temperature_2m_min||[],
 maxs=d.temperature_2m_max||[],dirs=d.wind_direction_10m_dominant||[];
 const eligible=days.length>=7&&mins.slice(0,7).filter(Number.isFinite).length>=5&&maxs.slice(0,7).filter(Number.isFinite).length>=5;
 if(!eligible)return {ok:false};
 const frost=mins.slice(0,7).filter(x=>Number.isFinite(x)&&x<0).length;
 const ice=maxs.slice(0,7).filter(x=>Number.isFinite(x)&&x<0).length;
 const easterlies=dirs.slice(0,7).filter(isEast).length;
 let longest=0,run=0;
 dirs.slice(0,7).forEach(dir=>{run=isEast(dir)?run+1:0;longest=Math.max(longest,run);});
 const ensDays=getEnsemble(ens),snow=getSnow(east);
 const region=snapshot?.europe?.frames?.[0]?.points;
 const sourcePoints=["Berlijn","Warschau","Minsk"].map(name=>getRegionalPoint(region,name)).filter(Boolean);
 const t850=mean(sourcePoints.map(p=>p?.t850_c));
 const snowCoverage=snow?snow.filter(n=>n>=0.01).length:null;
 const pressureScand=mean(["Oslo","Stockholm","Helsinki"].map(x=>getRegionalPoint(region,x)?.pressure_hpa));
 const pressureLondon=getRegionalPoint(region,"Londen")?.pressure_hpa;
 const pressureDiff=Number.isFinite(pressureScand)&&Number.isFinite(pressureLondon)?pressureScand-pressureLondon:null;
 const nao=indices?.nao,ao=indices?.ao;
 const naoval=nao&&daysSince(nao.date)>=0&&daysSince(nao.date)<=6&&Number.isFinite(nao.value)?nao.value:null;
 const aoval=ao&&daysSince(ao.date)>=0&&daysSince(ao.date)<=6&&Number.isFinite(ao.value)?ao.value:null;
 const circ=naoval===null&&aoval===null?null:Math.min(...[naoval,aoval].filter(Number.isFinite));
 return {ok:true,days,mins,maxs,dirs,frost,ice,easterlies,longest,ensDays,snow,snowCoverage,t850,pressureDiff,naoval,aoval,circ,site:snapshot?.europe?.model||null};
}
function computeSignal(a){
 if(!a.ok)return {value:null,coverage:0,note:"Onvoldoende 7-daagse temperatuurinformatie"};
 const components=[
  {name:"Lokale minimumtemperatuur",w:25,v:Math.min(25,18*a.frost/7+7*a.ice/7)},
  {name:"Ensemblemodel",w:15,v:a.ensDays?Math.min(15,15*mean(a.ensDays.slice(0,7).filter(Boolean).map(x=>x.fraction))):null},
  {name:"Aanhoudende oostenwind",w:20,v:Math.min(20,12*a.longest/5+8*a.easterlies/7)},
  {name:"Koude lucht boven brongebied",w:20,v:Number.isFinite(a.t850)?(a.t850<=-7?20:a.t850<=-4?15:a.t850<=-1?9:a.t850<=2?4:0):null},
  {name:"Sneeuw in brongebied",w:5,v:a.snowCoverage!==null?5*a.snowCoverage/a.snow.length:null},
  {name:"Luchtdruk in Scandinavië",w:10,v:a.pressureDiff!==null?(a.pressureDiff>=12?10:a.pressureDiff>=5?7:a.pressureDiff>=0?3:0):null},
  {name:"NAO/AO gezamenlijk",w:5,v:a.circ!==null?(a.circ<=-1.5?5:a.circ<=-.5?3:a.circ<=0?1:0):null}
 ];
 const available=components.filter(x=>Number.isFinite(x.v));
 const coverage=available.reduce((n,c)=>n+c.w,0);
 const points=available.reduce((n,c)=>n+c.v,0);
 const sufficient=coverage>=85&&available.some(x=>x.name==="Ensemblemodel");
 const value=sufficient?Math.round(points):null;
 const category=value===null?"Onvoldoende gegevens":value>=68?"Sterke wintersignalen":value>=45?"Verhoogde signalen":value>=23?"Enkele wintersignalen":"Weinig wintersignalen";
 return {value,category,coverage,components,points:Math.round(points)};
}
function stageCard(h,label,main,detail) {
 if(!e(h+"Main"))return;
 e(h+"Main").textContent=main;
 e(h+"Desc").textContent=detail;
}
function diffSincePrevious(previous,forecast,loc,indices) {
 if(!previous?.collected_at||daysSince(previous.collected_at)>7)return "Geen eerdere dagopname om mee te vergelijken.";
 let parts=[];
 const oldNa=previous.indices?.nao?.value,curNa=indices?.nao?.value;
 if(Number.isFinite(oldNa)&&Number.isFinite(curNa)&&Math.abs(oldNa-curNa)>=.15)
  parts.push("NAO "+(curNa<oldNa?"verder negatief":"positiever")+" ("+fmt(curNa-oldNa)+")");
 if(loc==="debilt"){
  const old=previous.forecast?.daily||{},now=forecast?.daily||{};
  const prior=new Map((old.time||[]).map((day,i)=>[day,old.temperature_2m_min?.[i]]));
  const deltas=(now.time||[]).slice(0,7).map((day,i)=>{
    const curr=now.temperature_2m_min?.[i],before=prior.get(day);
    return Number.isFinite(curr)&&Number.isFinite(before)?curr-before:null;
  }).filter(Number.isFinite);
  if(deltas.length>=4){
   const d=mean(deltas);
   if(Math.abs(d)>=.4)parts.push("verwachte nachtminima "+(d<0?"kouder":"zachter")+" met gemiddeld "+fmt(Math.abs(d))+" °C over dezelfde kalenderdagen");
   else parts.push("verwachte nachtminima vrijwel onveranderd");
  }
 }
 if(!parts.length)parts.push("geen grote vergelijkbare verschuiving in de beschikbare indicatoren");
 const priorDate=new Date(previous.collected_at).toLocaleDateString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
 return "Vergeleken met "+priorDate+": "+parts.join("; ")+".";
}
function showAnalysis(forecast,ens,east,indices,snapshot,loc) {
 const a=analysisInputs(forecast,ens,east,indices,snapshot);
 const dateEl=e("v2UpdateDate");
 if(dateEl){dateEl.textContent=snapshot?.collected_at?"Dataverzameling: "+new Date(snapshot.collected_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"Rechtstreekse voorspelling bij openen";}
 if(!a.ok){
  e("v2Summary").textContent="De 7-daagse gegevens zijn onvolledig; een winteranalyse kan nu niet worden vastgesteld.";
  stageCard("v2Week","0–7 dagen","Nog geen beoordeling","Temperatuurprognose ontbreekt of is onvolledig.");
  stageCard("v2Fortnight","8–14 dagen","Nog geen beoordeling","Nieuwe verwachting wordt opgehaald.");
  stageCard("v2Month","15–30 dagen","Alleen signalen","Geen betrouwbare lokale dagelijkse vorstverwachting.");
  e("v2Reasons").innerHTML="<li>Weergave toont geen ingevulde kansen wanneer bronnen ontbreken.</li>";
  e("v2Delta").textContent="Geen vergelijkbare update beschikbaar.";
  e("v2Coverage").textContent="Modelbron onvoldoende volledig.";
  return;
 }
 const signal=computeSignal(a);
 const minsNext=a.mins.slice(7,14),maxNext=a.maxs.slice(7,14);
 const futureFrost=minsNext.filter(x=>Number.isFinite(x)&&x<0).length;
 const laterProb=a.ensDays?mean(a.ensDays.slice(7,14).filter(Boolean).map(x=>x.fraction)):null;
 const firstProb=a.ensDays?mean(a.ensDays.slice(0,7).filter(Boolean).map(x=>x.fraction)):null;
 stageCard("v2Week","0–7 dagen",a.frost+" vorstdag"+(a.frost===1?"":"en")+" · "+a.ice+" ijsdag"+(a.ice===1?"":"en"),
    a.longest+" dagen aaneengesloten oostelijke wind in het model; geen garantie op natuurijs.");
 stageCard("v2Fortnight","8–14 dagen",futureFrost+" voorspelde vorstdag"+(futureFrost===1?"":"en"),
    Number.isFinite(laterProb)?"Gemiddeld "+Math.round(laterProb*100)+"% van de beschikbare ensembleleden voorspelt nachtvorst.":"Onzekerheid neemt toe; geen volledig ensemble beschikbaar.");
 stageCard("v2Month","15–30 dagen","Geen dagvoorspelling",
    "Alleen grootschalige signalen; geen gekalibreerde vorst- of sneeuwkansen.");
 const location=loc==="maarssen"?"Maarssen":"De Bilt";
 let intro="Voor "+location+" laat het weermodel in de komende zeven dagen "+a.frost+" vorstdagen en "+a.ice+" ijsdagen zien.";
 if(a.longest>=3)intro+=" De voorspelde reeks met oostenwind duurt maximaal "+a.longest+" dagen.";
 else intro+=" Een langdurige oostelijke stroming is in de zevendaagse berekening nog niet zichtbaar.";
 if(Number.isFinite(a.t850))intro+=" Boven Berlijn, Warschau en Minsk ligt het gemiddelde op 850 hPa in de eerstvolgende modelkaart rond "+fmt(a.t850)+" °C.";
 else intro+=" Er is momenteel onvoldoende informatie over de koudevoorraad op 850 hPa in het brongebied.";
 intro+=" De signaalmeter is geen wetenschappelijk gevalideerde kans op een strenge winter.";
 e("v2Summary").textContent=intro;
 const evidence=[];
 if(a.ensDays&&Number.isFinite(firstProb))
  evidence.push("Nachtvorst volgens gemiddeld "+Math.round(firstProb*100)+"% van de beschikbare modelleden in de eerste zeven dagen.");
 else evidence.push("Ensemble: onvoldoende volledige modeldata voor een beoordeling.");
 if(a.snow)evidence.push("Sneeuwdiepte bij "+a.snowCoverage+" van "+a.snow.length+" Oost-Europese modelpunten minimaal 1 cm.");
 if(Number.isFinite(a.pressureDiff))evidence.push("Luchtdruk boven Oslo/Stockholm/Helsinki gemiddeld "+fmt(a.pressureDiff)+" hPa ten opzichte van Londen; dit is geen bevestigde blokkade.");
 if(a.circ!==null)evidence.push("NAO en AO als één samenhangend circulatiesignaal beoordeeld, niet dubbel meegeteld.");
 if(!a.snow&&!Number.isFinite(a.pressureDiff))evidence.push("Regionale atmosfeerbronnen zijn onvolledig, daarom voorzichtig interpreteren.");
 e("v2Reasons").innerHTML=evidence.map(x=>"<li>"+escapeHtml(x)+"</li>").join("");
 e("v2Delta").textContent=diffSincePrevious(snapshot?.previous,forecast,loc,indices);
 e("v2Coverage").textContent="Gegevensdekking voor de experimentele winterpotentieel-indicator: "+signal.coverage+"% van de gewichten beschikbaar. Geen statistisch gevalideerde voorspelling.";
 const score=e("winterScore"),name=e("winterLabel");
 if(score)score.textContent=signal.value===null?"—":signal.value+"/100";
 if(name)name.textContent=signal.category;
 if(e("winterExplain"))e("winterExplain").textContent="Experimentele signaalmeter uit lokale vorst, ensemble, oostenwind, koudeaanvoer, sneeuw, luchtdruk en NAO/AO. "+signal.coverage+"% datadekking. Geen berekende winterkans.";
 const gauge=e("homeGauge");
 if(gauge)gauge.style.setProperty("--score",signal.value===null?0:signal.value);
 if(e("scorebar"))e("scorebar").style.width=(signal.value===null?0:signal.value)+"%";
}
function escapeHtml(input) {return String(input).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function mapColor(key,value) {
 if(!Number.isFinite(value))return "#476073";
 if(key==="pressure_hpa")return value>=1025?"#f4c06f":value>=1015?"#82d6c4":value>=1005?"#72b6ea":"#8f9cee";
 if(key==="t850_c")return value<=-7?"#488bd6":value<=-3?"#75c4fa":value<=1?"#a4e5df":"#edb16e";
 if(key==="wind10_kmh")return value>=50?"#f5bd78":value>=25?"#d7e07d":"#71c9e6";
 return value>=160?"#efb57c":value>=100?"#dce38e":"#76c3e7";
}
function renderMap() {
 const dest=e("v2Map");if(!dest)return;
 const snap=lastSnapshot?.europe,frameNum=Number(e("v2MapTime")?.value||0);
 const frame=snap?.frames?.[frameNum],kind=e("v2MapLayer")?.value||"pressure_hpa";
 const units={pressure_hpa:"hPa",wind10_kmh:"km/u",t850_c:"°C",jet250_kmh:"km/u"};
 const layerLabel={pressure_hpa:"luchtdruk op zeeniveau",wind10_kmh:"wind op 10 meter",t850_c:"temperatuur op 850 hPa",jet250_kmh:"wind op 250 hPa"};
 if(!frame?.points?.length){dest.innerHTML='<div style="padding:28px;color:#afc9d8">Nog geen Europese modelkaart beschikbaar. Deze wordt met de dagelijkse gegevensverzameling opgehaald.</div>';if(e("v2MapDetails"))e("v2MapDetails").textContent="Geen modelpunten ontvangen; geen kaartwaarden ingevuld.";return;}
 const pts=frame.points;
 const W=940,H=470,x=lon=>65+(lon+28)/68*800,y=lat=>43+(69-lat)/34*370;
 const bg='<rect x="0" y="0" width="'+W+'" height="'+H+'" rx="14" fill="#10283d"/>';
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Geografisch geprojecteerde Europese modelpunten met '+layerLabel[kind]+'">'+bg;
 for(const lon of [-20,-10,0,10,20,30,40]){const xx=x(lon);svg+='<line x1="'+xx+'" y1="40" x2="'+xx+'" y2="427" stroke="#35546c" opacity=".42" stroke-dasharray="3 7"/><text x="'+xx+'" y="453" text-anchor="middle" fill="#86a6b8" font-size="11">'+lon+'°</text>';}
 for(const lat of [40,45,50,55,60,65]){const yy=y(lat);svg+='<line x1="50" y1="'+yy+'" x2="887" y2="'+yy+'" stroke="#35546c" opacity=".42" stroke-dasharray="3 7"/><text x="37" y="'+(yy+4)+'" text-anchor="middle" fill="#86a6b8" font-size="11">'+lat+'°</text>';}
 svg+='<text x="73" y="26" fill="#91c6e3" font-size="15" font-weight="700">NOORDELIJKE ATLANTISCHE OCEAAN</text>';
 let available=0;
 pts.forEach((p,i)=>{
  const v=p[kind]; if(!Number.isFinite(v))return;
  available++;
  const xx=x(p.lon), yy=y(p.lat),fill=mapColor(kind,v);
  const value=Math.round(v)+(kind==="t850_c"?"°":kind==="pressure_hpa"?"":"/u");
  const name=p.name;
  const offset= i%2===0?-24:31;
  svg+='<g class="v2-map-pin" role="button" tabindex="0" data-index="'+i+'" aria-label="'+escapeHtml(name)+' '+Math.round(v)+units[kind]+'"><circle cx="'+xx+'" cy="'+yy+'" r="18" fill="'+fill+'" stroke="#d6efff" stroke-width="1.2"/><text x="'+xx+'" y="'+(yy+5)+'" class="v2-map-value" text-anchor="middle" fill="#10283d">'+Math.round(v)+'</text><text x="'+(xx+offset*0.25)+'" y="'+(yy+offset)+'" class="v2-map-tag" text-anchor="middle">'+escapeHtml(name)+'</text><title>'+escapeHtml(name)+': '+Math.round(v)+' '+units[kind]+'</title></g>';
 });
 svg+='<text x="70" y="428" fill="#abcbd8" font-size="13">Geografische ligging van modelpunten · klik een cirkel voor details</text></svg>';
 dest.innerHTML=svg;
 const when=new Date(frame.valid_for).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"});
 if(e("v2MapCaption"))e("v2MapCaption").textContent=available+" van "+pts.length+" beschikbare modelpunten · modeltijd "+when+" · "+layerLabel[kind];
 const info=e("v2MapDetails");
 function selectSpot(i){
  const p=pts[i];if(!p)return;
  const date=when;
  info.textContent=p.name+" · "+date+" — luchtdruk "+fmt(p.pressure_hpa)+" hPa; wind 10m "+fmt(p.wind10_kmh)+" km/u (uit "+fmt(p.wind10_from,0)+"°); T850 "+fmt(p.t850_c)+" °C; wind 250hPa "+fmt(p.jet250_kmh)+" km/u. Alle waarden uit één model, niet gemeten.";
 }
 dest.querySelectorAll(".v2-map-pin").forEach(g=>{
  g.addEventListener("click",()=>selectSpot(Number(g.dataset.index)));
  g.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();selectSpot(Number(g.dataset.index));}});
 });
 const first=pts.findIndex(p=>Number.isFinite(p[kind]));
 if(first>=0)selectSpot(first);
}
function refresh(ctx){
 lastForecast=ctx.forecast;lastEns=ctx.ensemble;lastEast=ctx.snow;lastIndices=ctx.indices;lastSnapshot=ctx.snapshot;lastLoc=ctx.location;
 showAnalysis(lastForecast,lastEns,lastEast,lastIndices,lastSnapshot,lastLoc);
 renderMap();
}
function init(){
 if(e("v2MapLayer"))e("v2MapLayer").addEventListener("change",renderMap);
 if(e("v2MapTime"))e("v2MapTime").addEventListener("change",renderMap);
 if(window.__winterCurrent)refresh(window.__winterCurrent);
}
window.WinterV2={refresh,init};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
