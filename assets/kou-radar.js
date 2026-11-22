/* KouRadar: two model-based cold-signal windows. A score is NOT a calibrated probability. */
(function(){
"use strict";
const $=k=>document.getElementById(k);
const isnum=x=>typeof x==="number"&&Number.isFinite(x);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const avg=values=>{const v=values.filter(isnum);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
const localDate=t=>new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Amsterdam"}).format(t||new Date());
const ago=date=>{const t=Date.parse(date);return Number.isFinite(t)?(Date.now()-t)/3600000:Infinity;};
const fromEast=d=>isnum(d)&&d>=45&&d<=135;
const scoreName=n=>!isnum(n)?"Onvoldoende modelgegevens":n<23?"Weinig wintersignalen":n<43?"Voorzichtige aanwijzingen":n<63?"Kou mogelijk in opbouw":n<80?"Duidelijke wintersignalen":"Sterke wintersignalen";
const fn=(n)=>isnum(n)?Math.round(n):"—";
const fmt=(n)=>isnum(n)?n.toFixed(1).replace(".",","):"—";
let mostRecent=null, pendingOutlook=null, browserAttempts=0;
const factor=(label,weight,value,detail)=>({label,weight,value:isnum(value)?clamp(value,0,weight):null,detail:detail||""});
function aggregateSnow(data){
 const items=Array.isArray(data)?data:(data?[data]:[]),valid=[];
 for(const item of items.slice(0,5)){
  const h=item.hourly||{},time=h.time||[],depth=h.snow_depth||[];
  let i=time.findIndex(x=>Date.parse(x+"Z")>=Date.now());
  if(i<0)i=depth.length-1;
  if(isnum(depth[i]))valid.push(depth[i]);
 }
 return valid.length>=3?valid.filter(x=>x>=.01).length/valid.length:null;
}
function regionalNearFromMap(snapshot){
 const pts=snapshot?.europe?.frames?.[0]?.points||[];
 const find=k=>pts.find(x=>x.name===k)||{};
 const cold=["Berlijn","Warschau","Minsk"].map(x=>find(x).t850_c).filter(isnum);
 const north=["Oslo","Stockholm","Helsinki"].map(x=>find(x).pressure_hpa).filter(isnum);
 const london=find("Londen").pressure_hpa;
 return {t850_c:cold.length>=2?avg(cold):null,
         scandi_minus_london_hpa:north.length>=2&&isnum(london)?avg(north)-london:null,
         from_map:true};
}
function indicesValues(indices){
 const today=Date.now();
 const nao=indices?.nao,ao=indices?.ao,scand=indices?.scand;
 const validDaily=x=>isnum(x?.value)&&x?.date&&(today-Date.parse(x.date+"T12:00:00Z"))>=-2*86400000&&(today-Date.parse(x.date+"T12:00:00Z"))<=7*86400000;
 const vals=[nao,ao].filter(validDaily).map(x=>clamp(-x.value/2));
 const m=avg(vals);
 const sc=isnum(scand?.value)&&scand.date&&ago(scand.date+"T12:00:00Z")<=90*24?clamp(scand.value/2):null;
 return {daily:m,scand:sc};
}
function frostMemberFraction(ensemble,idx,dates){
 const d=ensemble?.daily||{};
 const memberKeys=Object.keys(d).filter(k=>/^temperature_2m_min_member/.test(k));
 if(memberKeys.length<5)return null;
 const day=dates[idx],eidx=(d.time||[]).indexOf(day);
 if(eidx<0)return null;
 const values=memberKeys.map(k=>d[k]?.[eidx]).filter(isnum);
 return values.length>=5?values.filter(v=>v<0).length/values.length:null;
}
function compute(ctx,windowKey,referenceStart=null){
 const forecast=ctx?.forecast?.daily||{},dates=forecast.time||[],
 start=windowKey==="near"?0:7,end=start+7;
 const firstDate=referenceStart||localDate(),todayForecast=dates[0]===firstDate;
 if(dates.length<14||!todayForecast)return {score:null,coverage:0,ready:false,factors:[],reason:"14-daagse voorspelling ontbreekt of begint niet vandaag."};
 const mins=(forecast.temperature_2m_min||[]).slice(start,end).filter(isnum);
 const maxs=(forecast.temperature_2m_max||[]).slice(start,end).filter(isnum);
 const dir=(forecast.wind_direction_10m_dominant||[]).slice(start,end);
 const dirs=dir.filter(isnum);
 const ensembleDays=dates.slice(start,end).map((_,i)=>frostMemberFraction(ctx.ensemble,start+i,dates));
 const shares=ensembleDays.filter(isnum);
 let east=0,sequence=0,longest=0;
 dir.forEach(d=>{sequence=fromEast(d)?sequence+1:0;longest=Math.max(sequence,longest);if(fromEast(d))east++;});
 const outlook=ctx?.snapshot?.outlook?.windows?.[windowKey];
 const mapBackup=windowKey==="near"?regionalNearFromMap(ctx?.snapshot):null;
 const cold=isnum(outlook?.t850_c)?outlook.t850_c:mapBackup?.t850_c;
 const pressure=isnum(outlook?.scandi_minus_london_hpa)?outlook.scandi_minus_london_hpa:mapBackup?.scandi_minus_london_hpa;
 const snapshotOnly=!isnum(outlook?.t850_c)&&isnum(cold);
 const cir=indicesValues(ctx?.indices);
 const snow=aggregateSnow(ctx?.snow);
 const arr=[
  factor("Lokale nachtvorst en ijsdagen",17,mins.length>=5&&maxs.length>=5?
      17*(.65*clamp((mins.filter(v=>v<0).length/mins.length)/.85)+.35*clamp((maxs.filter(v=>v<0).length/maxs.length)/.35)):null,
      "Tmin < 0 °C en Tmax < 0 °C, per voorspeldag"),
  factor("Overeenstemming ensemble",18,shares.length>=5?18*avg(shares):null,
      shares.length+" van 7 dagen met ten minste vijf ensembleleden"),
  factor("Duur oostelijke wind",15,dirs.length>=5?15*(.65*(east/dirs.length)+.35*clamp(longest/4)):null,
      east+" oostelijke dagen, langste reeks "+longest+" dagen"),
  factor("Scandinavisch luchtdrukpatroon",10,isnum(pressure)?10*clamp((pressure+2)/18):null,
      isnum(pressure)?fmt(pressure)+" hPa t.o.v. Londen"+(snapshotOnly?" (steekproef)": ""):"Geen regionaal luchtdrukmodel"),
  factor("Koude lucht boven Oost-Europa (850 hPa)",20,isnum(cold)?20*clamp((1-cold)/11):null,
      isnum(cold)?fmt(cold)+" °C op 850 hPa"+(snapshotOnly?" (steekproef)": ""):"Geen 850 hPa-model"),
  factor("NAO en AO als één signaal",6,windowKey==="near"&&isnum(cir.daily)?6*cir.daily:null,
      windowKey==="near"?"Actuele fase, geen voorspelde index":"Niet vooruitberekend voor dag 8–14"),
  factor("SCAND-maandindex",4,windowKey==="near"&&isnum(cir.scand)?4*cir.scand:null,
      windowKey==="near"?"Maandindex; trage achtergrondindicatie":"Niet vooruitberekend voor dag 8–14"),
  factor("Sneeuwdek in brongebied",10,windowKey==="near"&&isnum(snow)?10*snow:null,
      windowKey==="near"?"Actuele modelmatige sneeuwvoorraad":"Sneeuwdek op dag 8–14 onbekend"),
 ];
 const coverage=arr.filter(f=>isnum(f.value)).reduce((sum,f)=>sum+f.weight,0);
 const subtotal=arr.filter(f=>isnum(f.value)).reduce((sum,f)=>sum+f.value,0);
 const ready=mins.length>=5 && shares.length>=5 && coverage>=78 && isnum(cold)&&isnum(pressure);
 const score=ready?Math.round(clamp(subtotal/coverage)*100):null;
 const spread=shares.length>=5?avg(shares.map(p=>4*p*(1-p))):null;
 const hasCached=Object.entries(ctx?.snapshot?.source_status||{}).some(([k,v])=>
      ["forecast","ensemble","outlook","europe","snow"].includes(k)&&v?.state==="cached");
 const confidence=!ready?"Laag":windowKey==="later"?"Matig":hasCached||coverage<95||spread>.65||snapshotOnly?"Matig":"Redelijk";
 const quality=coverage<80?"Beperkt":coverage<95?"Gedeeltelijk":"Goed";
 return {window:windowKey,score,coverage,ready,factors:arr,confidence,quality,spread,
         snapshotOnly,validDays:mins.length,east,longest,meanShare:avg(shares),reason:!ready?"Onvoldoende kerngegevens voor een verantwoorde score":null};
}
function trend(ctx,windowKey,current){
 const old=ctx?.snapshot?.previous;
 if(!old||!old.collected_at||ago(old.collected_at)<0||ago(old.collected_at)>72||!isnum(current.score))
  return {label:"Geen vergelijking",details:"Er is nog geen recente eerdere modelrun beschikbaar."};
 if(ctx.location==="maarssen" && old.location!=="Maarssen")
  return {label:"Geen vergelijking",details:"De vorige serverrun is voor De Bilt, terwijl de gekozen locatie Maarssen is."};
 const previousStart=old.forecast?.daily?.time?.[0];
 if(!previousStart || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(previousStart))
  return {label:"Geen vergelijking",details:"De vorige modelrun heeft geen geldige begindatum."};
 const past=compute({forecast:old.forecast,ensemble:old.ensemble,snow:old.snow,indices:old.indices,
   snapshot:{outlook:old.outlook,europe:old.europe,source_status:old.source_status}},windowKey,previousStart);
 if(!isnum(past.score))return {label:"Geen vergelijking",details:"Vorige modelrun bevat onvoldoende overeenkomende gegevens."};
 const delta=current.score-past.score;
 const time=new Date(old.collected_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
 return {label:Math.abs(delta)<4?"Stabiel":delta>0?"Stijgend":"Dalend",
   details:(delta>0?"+":"")+delta+" scorepunten sinds "+time+
    (previousStart!==localDate()?" (de 7-daagse vensters zijn sinds die modelrun verschoven; een trend is geen kanspercentage).":" (dezelfde startdatum)."),delta};
}
function details(head,record){
 const rows=record.factors.map(f=>'<div class="kr-factor"><span>'+f.label+'</span><strong>'+
   (isnum(f.value)?fmt(f.value)+' / '+f.weight:'— / '+f.weight)+'</strong></div>').join("");
 return '<div class="kr-subgroup"><h3>'+head+' · '+record.coverage+'% datadekking</h3>'+rows+'</div>';
}
function render(ctx){
 const card=$("krPanel");if(!card)return;
 const near=compute(ctx,"near"),later=compute(ctx,"later");
 const usable=[near,later].filter(x=>isnum(x.score));
 // The primary dial always prioritizes the near-term window, not the highest of two periods.
 const active=isnum(near.score)?near:(isnum(later.score)?later:null);
 const value=active?.score;
 const bothMissing=usable.length===0;
 const label=scoreName(value);
 const period=active?.window==="later"?"8–14 dagen":"0–7 dagen";
 const t=active?trend(ctx,active.window,active):{label:"Geen trend",details:"Nog geen vergelijkbare modelgegevens."};
 $("krValue").textContent=fn(value);
 $("krArcFill").setAttribute("stroke-dasharray",(isnum(value)?value:0)+" 100");
 $("krResult").textContent=label;
 $("krInterpret").textContent=bothMissing?
   "De noodzakelijke modelgegevens zijn niet volledig. Er wordt geen fictieve winterscore getoond.":
   (value>=63?"Meerdere berekeningen wijzen in dezelfde richting. Controleer nog de spreiding en termijn.":
    value>=43?"Er zijn aanwijzingen voor een mogelijke ontwikkeling richting kou, nog zonder zekerheid.":
    "Er is vooralsnog geen samenhangend sterk signaal voor een koudeperiode.")+
    " Hoofdvenster: "+period+"; vergelijk beide afzonderlijke perioden hieronder.";
 $("krWhen").textContent=active?period:"—";
 $("krTrend").textContent=t.label+(isnum(t.delta)?" ("+(t.delta>0?"+":"")+t.delta+")":"");
 $("krConfidence").textContent=active?.confidence||"Onbekend";
 $("krBandNear").textContent=fn(near.score);
 $("krBandLater").textContent=fn(later.score);
 $("krFillNear").style.width=(isnum(near.score)?near.score:0)+"%";
 $("krFillLater").style.width=(isnum(later.score)?later.score:0)+"%";
 $("krBandNearCoverage").textContent=near.coverage+"% data";
 $("krBandLaterCoverage").textContent=later.coverage+"% data";
 $("krTrendDetail").textContent=t.details;
 $("krDetails").innerHTML=details("0–7 dagen",near)+details("8–14 dagen",later);
 const qualities=["0–7 dagen "+near.quality+" ("+near.coverage+"%)","8–14 dagen "+later.quality+" ("+later.coverage+"%)"];
 const jet=ctx?.snapshot?.upper_air?"250 hPa-wind: model aanwezig":"250 hPa-wind: ontbreekt";
 const polar=ctx?.snapshot?.vortex?"Poolwervel: modelaanwijzing aanwezig":"Poolwervel: ontbreekt";
 $("krMethod").textContent="Datadekking: "+qualities.join(" · ")+". Jetstroom en poolwervel zijn contextsignalen en tellen niet mee als losse windsnelheid: "+jet+"; "+polar+". De score is een experimentele aanwijzing, geen % vorstkans en geen seizoensvoorspelling.";
 $("krMode").textContent=active?active.snapshotOnly?"Korte regionale steekproef":"Modelberekeningen":"Onvoldoende brondata";
}
const locations=[
 ["Londen",51.51,-.13],["Oslo",59.91,10.75],["Stockholm",59.33,18.07],["Helsinki",60.17,24.94],
 ["Berlijn",52.52,13.4],["Warschau",52.23,21.01],["Minsk",53.9,27.57]
];
async function getGroup(group){
 const p={latitude:group.map(x=>x[1]).join(","),longitude:group.map(x=>x[2]).join(","),
  hourly:"temperature_850hPa,pressure_msl",forecast_days:"14",models:"gfs_seamless",timezone:"UTC"};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),13000);
 try{
  const r=await fetch("https://api.open-meteo.com/v1/forecast?"+new URLSearchParams(p),{signal:ctl.signal,cache:"no-store"});
  if(!r.ok)throw new Error("Outlook HTTP "+r.status);
  const d=await r.json(),arr=Array.isArray(d)?d:[d];
  if(arr.length!==group.length||d.error)throw new Error("Outlook missing locations");
  return arr.map((point,i)=>({name:group[i][0],hourly:point.hourly||{}}));
 }finally{clearTimeout(timer);}
}
function shiftDate(d,days){
 const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+days);
 return x.toISOString().slice(0,10);
}
async function fetchOutlook(){
 const groups=[locations.slice(0,4),locations.slice(4)];
 const sets=await Promise.allSettled(groups.map(getGroup));
 const points=sets.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
 if(points.length<4)throw new Error("Too few GFS locations");
 const today=localDate(),windows={};
 for(const [key,start] of [["near",0],["later",7]]){
  const wanted=new Set(Array.from({length:7},(_,i)=>shiftDate(today,start+i)));
  const sites={};
  for(const point of points){
   const h=point.hourly,indices=(h.time||[]).map((x,i)=>x.slice(11,16)==="12:00"&&wanted.has(x.slice(0,10))?i:-1).filter(x=>x>=0);
   if(indices.length<4)continue;
   sites[point.name]={t850_c:avg(indices.map(i=>h.temperature_850hPa?.[i])),
    pressure_hpa:avg(indices.map(i=>h.pressure_msl?.[i])),n_days:indices.length};
  }
  const source=["Berlijn","Warschau","Minsk"].map(x=>sites[x]?.t850_c).filter(isnum);
  const scand=["Oslo","Stockholm","Helsinki"].map(x=>sites[x]?.pressure_hpa).filter(isnum);
  const london=sites.Londen?.pressure_hpa;
  windows[key]={start:shiftDate(today,start),end:shiftDate(today,start+6),sites,
   t850_c:source.length>=2?avg(source):null,
   scandi_minus_london_hpa:scand.length>=2&&isnum(london)?avg(scand)-london:null,source_sites:Object.keys(sites).length};
 }
 return {kind:"forecast_model_samples",model:"Open-Meteo GFS seamless (browser)",
  generated_at:new Date().toISOString(),locations_available:points.length,
  locations_expected:locations.length,windows};
}
function update(ctx){
 mostRecent=ctx;
 render(ctx);
 if(!ctx?.snapshot?.outlook && !pendingOutlook && browserAttempts<2){
  browserAttempts++;
  pendingOutlook=fetchOutlook().then(data=>{
    if(mostRecent!==ctx)return;
    if(!ctx.snapshot)ctx.snapshot={};
    ctx.snapshot.outlook=data;
    ctx.snapshot.source_status=ctx.snapshot.source_status||{};
    ctx.snapshot.source_status.outlook={state:"fresh",retrieved_at:new Date().toISOString(),age_hours:0};
    render(ctx);
    if(window.WinterDataHealth)window.WinterDataHealth.update(ctx);
  }).catch(()=>{}).finally(()=>{pendingOutlook=null;});
 }
}
window.KouRadar={update,compute,trend};
if(window.__winterCurrent)update(window.__winterCurrent);
})();
