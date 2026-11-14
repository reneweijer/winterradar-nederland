/* Synthetic non-network KouRadar regression tests executed by node in Actions. */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const day=new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Amsterdam"}).format(new Date());
function next(i){const t=new Date(day+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+i);return t.toISOString().slice(0,10);}
const dates=Array.from({length:14},(_,i)=>next(i));
const forecast={daily:{
 time:dates,
 temperature_2m_min:[-3,-2,-1,-1,-4,0,-1, 2,3,2,2,1,2,1],
 temperature_2m_max:[2,1,2,-1,0,3,1, 5,6,5,4,5,5,5],
 wind_direction_10m_dominant:[90,85,80,100,100,120,90, 210,240,230,200,220,210,180]
}};
const ens={daily:{time:dates}};
for(let i=1;i<=7;i++)ens.daily["temperature_2m_min_member"+String(i).padStart(2,"0")]=
 [ -1,-2,-1,1,-3,-1,0, 4,2,3,1,2,1,3];
const outlook={windows:{
 near:{t850_c:-5,scandi_minus_london_hpa:12},
 later:{t850_c:2,scandi_minus_london_hpa:-5}
}};
const snow=Array.from({length:5},(_,i)=>({hourly:{time:[new Date(Date.now()+3600000).toISOString().slice(0,16)],snow_depth:[i<3?.12:0]}}));
const indices={nao:{date:day,value:-1.4},ao:{date:day,value:-.8},scand:{date:next(-20),value:.6}};
const ctx={forecast,ensemble:ens,snow,indices,snapshot:{outlook,source_status:{}}};
const sandbox={
 window:{},document:{getElementById:()=>null,readyState:"loading",addEventListener:()=>{}},
 Intl,Date,Number,Math,console,Set,Map,Array,Object,Promise,fetch:()=>{throw Error("unexpected fetch")},URLSearchParams
};
vm.runInNewContext(fs.readFileSync("assets/kou-radar.js","utf8"),sandbox);
const near=sandbox.window.KouRadar.compute(ctx,"near");
const later=sandbox.window.KouRadar.compute(ctx,"later");
assert.equal(near.coverage,100);
assert.equal(later.coverage,80);
assert.equal(near.ready,true);
assert.equal(later.ready,true);
assert.ok(near.score>later.score,"cold near signal must exceed warm week 2");
assert.ok(near.score>=0&&near.score<=100);
assert.ok(later.score>=0&&later.score<=100);
const none=sandbox.window.KouRadar.compute({...ctx,snapshot:{}}, "later");
assert.equal(none.score,null,"no regional outlook must not invent late signal");
const old={...ctx,forecast:{daily:{...forecast.daily,time:dates.map((_,i)=>next(i+1))}}};
assert.equal(sandbox.window.KouRadar.compute(old,"near").score,null,"outdated forecast day cannot be scored");
console.log("PASS KouRadar synthetic two horizons, missing models and stale timestamps",near.score,later.score);
