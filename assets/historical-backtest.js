/* Historical analogous winter-pattern audit, NOT validation of operational 7-day score. */
(function(){
"use strict";
const el=x=>document.getElementById(x);
const fmt=n=>Number.isFinite(n)?n.toFixed(1).replace(".",","):"—";
const factors=[
  {key:"nao",weight:38.0,label:"NAO negatief"},
  {key:"ao",weight:19.9,label:"AO negatief"},
  {key:"ssw_djf",weight:7.6,label:"SSW binnen de winter"},
  {key:"east_wind_vector",weight:34.5,label:"Oostelijke wintergemiddelde windvector"}
];
const bins=[{a:0,b:20},{a:20,b:40},{a:40,b:60},{a:60,b:80},{a:80,b:101}];
function render(){
  const host=el("btAudit");
  if(!host)return;
  let winters=[];
  try{winters=JSON.parse(el("historicData").textContent).winter_series||[]}catch(e){host.textContent="Historische data konden niet worden ingelezen.";return;}
  const rows=winters.filter(w=>Number.isFinite(w.temperature_c)&&Number.isFinite(w.nao)&&Number.isFinite(w.ao)).map(w=>{
     let total=0;
     for(const f of factors){
       let yes=false;
       if(f.key==="nao")yes=w.nao<0;
       else if(f.key==="ao")yes=w.ao<0;
       else yes=!!w[f.key];
       if(yes)total+=f.weight;
     }
     const score=Math.min(100,Math.round(total*100)/100);
     return {...w,score,cold:w.temperature_c<=1.0,veryCold:w.temperature_c<=0};
  });
  if(rows.length<60){host.textContent="Historische gegevens zijn onvolledig.";return;}
  const cold=rows.filter(r=>r.cold).length;
  const bands=bins.map(b=>{
    const set=rows.filter(x=>x.score>=b.a&&x.score<b.b);
    const success=set.filter(x=>x.cold).length;
    return {...b,n:set.length,success,hit:set.length?success/set.length:null,
           mean:set.length?set.reduce((v,x)=>v+x.temperature_c,0)/set.length:null};
  });
  const top=bands[bands.length-1];
  host.innerHTML=`
    <div class="bt-intro">
      <strong>Historische circulatie-indicatoren vergeleken met koude winters (1951–2025)</strong>
      <p>Dit is een <em>analoge patroonanalyse</em>, niet een terugrekening van de dagelijkse winterpotentieelscore. De gebruikte seizoensgemiddelden zijn achteraf bekend.</p>
    </div>
    <div class="bt-stats">
      <div><span>Winters onderzocht</span><strong>${rows.length}</strong></div>
      <div><span>Koude winters ≤ 1,0 °C</span><strong>${cold}</strong></div>
      <div><span>Hoogste patroonband</span><strong>${top.success} van ${top.n}</strong></div>
      <div><span>Onafhankelijke voorspelprestatie</span><strong>Niet vastgesteld</strong></div>
    </div>
    <div class="bt-table-wrap"><table class="bt-table">
    <thead><tr><th>Patroonscore</th><th>Winters</th><th>≤ 1,0 °C</th><th>Aandeel</th><th>Gem. wintertemp.</th></tr></thead>
    <tbody>${bands.map(b=>`<tr><td><strong>${b.a}–${Math.min(b.b,100)}</strong></td><td>${b.n}</td><td>${b.success}</td><td>${b.hit===null?"—":Math.round(100*b.hit)+"%"}</td><td>${fmt(b.mean)} °C</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="bt-note">Dit is een beschrijvende historische vergelijking met achteraf bekende indicatoren. Een onafhankelijke AUC en voorspellende waarde zijn niet reproduceerbaar gevalideerd in deze app. De scorebanden zijn geen gekalibreerde kansen.</p>\n    <details class="bt-details"><summary>Waarom dit geen bewijs is voor een betrouwbare seizoensvoorspelling</summary><p>De historische indicatoren omvatten seizoensgemiddelden en verstoringen die pas achteraf volledig bekend zijn. Ook is het aantal echt koude winters klein (slechts ${cold}). Een betrouwbare validatie vraagt dagelijkse historische modelruns, dezelfde winterpotentieel-formule voor iedere datum en een strikt onafhankelijke testperiode.</p><p>Historische bron: de eerder onderzochte reeks <strong>Winterpatronen 1951–2025</strong>, met wintertemperaturen De Bilt, CRU-NAO, NOAA/PSL AO en SCAND, SSW-catalogus en wintergemiddelde windvector.</p></details>`;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render);else render();
})();
