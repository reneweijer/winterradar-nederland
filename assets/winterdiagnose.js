/* Independent, evidence-labeled model diagnosis. No KNMI narrative is imported. */
(function(){
"use strict";
const host=()=>document.getElementById("wrOwnDiagnosis");
const is=n=>typeof n==="number"&&Number.isFinite(n);
const mean=a=>{const v=a.filter(is);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null};
const fmt=n=>is(n)?n.toFixed(1).replace(".",","):"—";
const east=n=>is(n)&&n>=45&&n<=135;
function diagnose(s){
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
 const clues=[];
 if(frost>0)clues.push(frost+" modeldagen met nachtvorst");
 if(ice>0)clues.push(ice+" mogelijke ijsdagen");
 if(longest>=2)clues.push(longest+" opeenvolgende dagen met oostelijke dominante wind");
 if(is(cold))clues.push("Oost-Europese 850 hPa-steekproef "+fmt(cold)+" °C");
 if(is(pressure))clues.push("Scandinavië–Londen drukverschil "+fmt(pressure)+" hPa");
 const isBlocked=is(pressure)&&pressure>8;
 const conclusion=ice>=2&&longest>=3?"Duidelijk modelmatig koud signaal":
  frost>=2&&longest>=2?"Samenhangende aanwijzingen voor een koudere fase":
  frost>=2?"Koude nachten mogelijk, grootschalige aanvoer nog niet overtuigend":
  "Vooralsnog geen samenhangend sterk wintersignaal";
 const date=s.collected_at?new Date(s.collected_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"onbekend";
 const quality=s.source_status?.forecast?.state||"onbekend";
 return '<strong>'+conclusion+'</strong><p>Eigen interpretatie uit modelgegevens, niet overgenomen van het KNMI. '+(clues.length?clues.join(" · ")+".":"Te weinig aanvullende signalen.")+'</p>'+
  '<p><strong>Blokkade:</strong> '+(isBlocked?"Luchtdrukverschil ondersteunt een hogedruksignaal, maar bewijst geen Scandinavische blokkade.":"Geen overtuigende blokkade vastgesteld met de beschikbare steekproef.")+
  ' <strong>Modelverschil:</strong> '+(disagreements.join("; ")||"niet beschikbaar")+'.</p>'+
  '<p class="soft">Modeluitgifte '+date+' · bronstatus '+quality+' · voorspelling, geen waarneming. Sneeuw op vijf modelpunten is geen satelliet-sneeuwbedekking. De precieze straalstroom en SSW-status zijn hiermee niet vastgesteld.</p>';
}
async function refresh(){
 const el=host();if(!el)return;
 try{
  const r=await fetch("./data/latest.json?t="+Date.now(),{cache:"no-store"});
  if(!r.ok)throw Error("bronbestand niet bereikbaar");
  const s=await r.json();el.innerHTML=diagnose(s);
 }catch(err){el.textContent="Eigen diagnose tijdelijk niet beschikbaar: "+err.message}
}
refresh();
})();
