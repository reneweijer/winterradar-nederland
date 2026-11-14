/* Winterradar data health and browser-side recovery, no invented observations. */
(function() {
"use strict";
const id = key => document.getElementById(key);
const models = [
  ["forecast","Temperatuur, wind en sneeuw — Nederland"],
  ["ensemble","Ensembleberekeningen nachtvorst"],
  ["snow","Sneeuwmodelpunten Oost-Europa"],
  ["europe","Europese atmosfeerkaart"],
  ["upper_air","Straalstroomindicatie op 250 hPa"],
  ["vortex","Poolwervelindicatie op 10 hPa"]
];
const names = [["nao","NAO-index"],["ao","AO-index"],["scand","SCAND-maandindex"]];
const browserSources = new Map();
let currentToken = 0;
const todayStr = () => new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Amsterdam"}).format(new Date());
const validNum = n => typeof n==="number" && Number.isFinite(n);
const isoDate = d => {try {return new Date(d).toLocaleString("nl-NL",{dateStyle:"short",timeStyle:"short"});}catch(_){return "onbekend";}};
function ageH(t) {const stamp=Date.parse(t);return Number.isFinite(stamp)?Math.max(0,(Date.now()-stamp)/3600000):Infinity;}
function prettyAge(t) {const a=ageH(t);return a<1?"minder dan een uur oud":a<48?Math.round(a)+" uur oud":Math.round(a/24)+" dagen oud";}
function forecastValid(obj) {
  const d=obj?.daily;
  return Array.isArray(d?.time) && d.time.includes(todayStr()) &&
         (d.temperature_2m_min||[]).filter(validNum).length >= 5;
}
function statusFor(key,ctx) {
  const value=key==="forecast"?ctx.forecast:key==="ensemble"?ctx.ensemble:key==="snow"?ctx.snow:ctx.snapshot?.[key];
  if(!value || (key==="forecast" && !forecastValid(value)))return {state:"missing",text:"Niet beschikbaar"};
  if(browserSources.has(key))return {state:"browser",text:"Live opgehaald in browser · "+isoDate(browserSources.get(key))};
  const s=ctx.snapshot?.source_status?.[key];
  const snapshotKey=ctx.snapshot?.[key];
  if(s && value===snapshotKey) {
    if(s.state==="cached")return {state:"cached",text:"Vorige modelrun · "+prettyAge(s.retrieved_at)};
    if(s.state==="fresh")return {state:"fresh",text:"Nieuwe modelrun · "+isoDate(s.retrieved_at)};
  }
  if(value!==snapshotKey) return {state:"browser",text:"Live opgevraagd bij openen"};
  return {state:"unknown",text:"Beschikbaar · brondatum onbekend"};
}
function official(key,ctx) {
 const item=ctx.indices?.[key];
 if(!validNum(item?.value)||!item?.date)return {state:"missing",text:"Niet beschikbaar"};
 const age=ageH(item.date+"T12:00:00Z");
 const limit=key==="scand"?65*24:6*24;
 return {state:age<=limit?"official":"stale",
         text:(key==="scand"?"Officiële maandindex · ":"Officiële dagindex · ")+item.date+(age>limit?" (verouderd)":"")};
}
function render(ctx) {
 const tbody=id("healthRows"),headline=id("healthHeadline");
 if(!tbody || !headline)return;
 const all=models.map(([key,label])=>({key,label,...statusFor(key,ctx)}))
  .concat(names.map(([key,label])=>({key,label,...official(key,ctx)})));
 const working=all.filter(x=>!["missing","stale"].includes(x.state)).length;
 const cached=all.filter(x=>x.state==="cached").length;
 const missing=all.filter(x=>["missing","stale"].includes(x.state)).length;
 const server=ctx.snapshot?.collected_at?"Laatste serverpoging "+isoDate(ctx.snapshot.collected_at):"Serverupdate niet bereikbaar";
 headline.textContent=working+" van "+all.length+" databronnen beschikbaar · "+cached+" uit vorige modelrun · "+missing+" ontbreken/verouderd";
 headline.className=working===all.length && cached===0?"health-ok":"health-warn";
 tbody.innerHTML=all.map(x=>'<tr><td>'+x.label+'</td><td><span class="health-mark '+x.state+'"></span>'+x.text+'</td></tr>').join("");
 if(id("healthStamp"))id("healthStamp").textContent=server+". Een succesvol gepubliceerde pagina betekent niet dat alle bronnen zijn vernieuwd.";
 if(id("updateStatus")) {
   id("updateStatus").textContent=(missing?"⚠ Ontbrekende bronnen":cached?"⚠ "+cached+" modelbronnen uit reserve":"✓ Alle bronnen beschikbaar")+" · "+working+"/"+all.length;
   id("updateStatus").className="status "+((missing||cached)?"health-partial":"");
 }
}
async function json(base,parameters,timeout=10500) {
 const url=base+"?"+new URLSearchParams(parameters).toString();
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
 try {
  const r=await fetch(url,{signal:ctl.signal,cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const data=await r.json();
  if(data?.error)throw Error(data.reason||"API-fout");
  return data;
 }finally{clearTimeout(timer);}
}
const pointLocations=[
 ["Azoren",37.75,-25.67],["IJsland",64.14,-21.94],["Londen",51.51,-0.13],["Parijs",48.86,2.35],["De Bilt",52.10,5.18],
 ["Berlijn",52.52,13.4],["Kopenhagen",55.68,12.57],["Oslo",59.91,10.75],["Stockholm",59.33,18.07],
 ["Helsinki",60.17,24.94],["Warschau",52.23,21.01],["Minsk",53.90,27.57],["Moskou",55.75,37.62]
];
const modelVars=["pressure_msl","wind_speed_10m","wind_direction_10m","temperature_850hPa","wind_speed_250hPa","wind_direction_250hPa"];
const resultKeys={pressure_msl:"pressure_hpa",wind_speed_10m:"wind10_kmh",wind_direction_10m:"wind10_from",temperature_850hPa:"t850_c",wind_speed_250hPa:"jet250_kmh",wind_direction_250hPa:"jet250_from"};
function parseRegional(raw,locations) {
 const arr=Array.isArray(raw)?raw:[raw];
 if(arr.length!==locations.length)throw Error("Incomplete locations");
 return arr.map((obj,i)=>({place:locations[i],hourly:obj?.hourly||{}}));
}
async function fetchRegional(group) {
 const p={latitude:group.map(x=>x[1]).join(","),longitude:group.map(x=>x[2]).join(","),
    hourly:modelVars.join(","),forecast_days:3,models:"gfs_seamless",timezone:"UTC"};
 try {
   return parseRegional(await json("https://api.open-meteo.com/v1/forecast",p),group);
 } catch(_) {
   p.hourly=modelVars.slice(0,4).join(",");
   return parseRegional(await json("https://api.open-meteo.com/v1/forecast",p),group);
 }
}
function chooseTime(hourly,target) {
 const ts=hourly?.time||[];
 let index=ts.findIndex(x=>Date.parse(x+"Z")>=target);
 if(index<0)index=ts.length-1;
 return index;
}
async function fetchEurope() {
 const groups=[pointLocations.slice(0,5),pointLocations.slice(5,9),pointLocations.slice(9)];
 const results=await Promise.allSettled(groups.map(fetchRegional));
 const raw=results.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
 if(raw.length<3)throw Error("Geen bruikbare Europese modelpunten");
 const generatedAt=new Date().toISOString(),frames=[];
 for(const lead of [6,24,48]){
   const target=Date.now()+lead*3600000,pts=[];
   let validFor=null;
   for(const {place,hourly} of raw){
     const i=chooseTime(hourly,target);
     if(i<0)continue;
     const spot={name:place[0],lat:place[1],lon:place[2]};
     for(const [key,out] of Object.entries(resultKeys))
       spot[out]=validNum(hourly[key]?.[i])?Math.round(hourly[key][i]*10)/10:null;
     validFor=hourly.time?.[i]?hourly.time[i]+"Z":validFor;
     pts.push(spot);
   }
   frames.push({lead_hours:lead,valid_for:validFor,points:pts});
 }
 return {model:"Open-Meteo GFS seamless",kind:"forecast_model_points",
    generated_at:generatedAt,frames,locations_available:raw.length,locations_expected:pointLocations.length,
    note:"Browserupdate met modelpunten; geen echte isobarenkaart."};
}
async function fetchUpper() {
 return json("https://api.open-meteo.com/v1/forecast",
    {latitude:"52.101",longitude:"5.18",hourly:"wind_speed_250hPa,wind_direction_250hPa",models:"gfs_seamless",forecast_days:2,timezone:"UTC"});
}
async function fetchVortex() {
 const loc=[0,60,120,180,-120,-60];
 const d=await json("https://api.open-meteo.com/v1/gem",
   {latitude:loc.map(()=>"60").join(","),longitude:loc.join(","),
    hourly:"wind_speed_10hPa,wind_direction_10hPa",models:"gem_global",forecast_days:2,timezone:"UTC"});
 const grids=Array.isArray(d)?d:[d],speeds=[];
 for(const grid of grids){
   const h=grid.hourly||{},values=h.wind_speed_10hPa||[],angles=h.wind_direction_10hPa||[];
   const i=values.findIndex((v,j)=>validNum(v)&&validNum(angles[j]));
   if(i>=0)speeds.push(-values[i]*Math.sin(angles[i]*Math.PI/180)/3.6);
 }
 if(speeds.length<4)throw Error("Te weinig 10 hPa-modelpunten");
 return {kind:"model_approximation",date:todayStr(),zonal_wind_ms:Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length*10)/10,n_points:speeds.length,source:"Open-Meteo GEM model, browseropvraag"};
}
function annotateFreshness(ctx,key,value) {
 if(!ctx.snapshot)ctx.snapshot={collected_at:new Date().toISOString()};
 ctx.snapshot[key]=value;
 if(!ctx.snapshot.source_status)ctx.snapshot.source_status={};
 const stamp=new Date().toISOString();
 browserSources.set(key,stamp);
 ctx.snapshot.source_status[key]={state:"fresh",retrieved_at:stamp,age_hours:0};
}
async function recover(ctx) {
 const token=++currentToken;
 const pending=[];
 if(!ctx.snapshot?.europe)pending.push(["europe",fetchEurope]);
 if(!ctx.snapshot?.upper_air)pending.push(["upper_air",fetchUpper]);
 if(!ctx.snapshot?.vortex)pending.push(["vortex",fetchVortex]);
 if(!pending.length)return;
 const all=await Promise.allSettled(pending.map(([_,f])=>f()));
 if(token!==currentToken)return;
 let changed=false;
 for(let i=0;i<pending.length;i++){
   if(all[i].status==="fulfilled"){
     const key=pending[i][0];
     annotateFreshness(ctx,key,all[i].value);
     if(key==="upper_air" && typeof renderUpperAir==="function")renderUpperAir(all[i].value);
     if(key==="vortex" && typeof renderVortex==="function")renderVortex(all[i].value);
     changed=true;
   }
 }
 if(changed && window.WinterV2)window.WinterV2.refresh(ctx);
 render(ctx);
}
function update(ctx) {
 if(!ctx)return;
 if(ctx.forecast && ctx.snapshot?.forecast!==ctx.forecast)browserSources.set("forecast",new Date().toISOString());
 if(ctx.ensemble && ctx.snapshot?.ensemble!==ctx.ensemble)browserSources.set("ensemble",new Date().toISOString());
 if(ctx.snow && ctx.snapshot?.snow!==ctx.snow)browserSources.set("snow",new Date().toISOString());
 render(ctx);
 recover(ctx).catch(()=>{render(ctx);});
}
window.WinterDataHealth={update};
})();
