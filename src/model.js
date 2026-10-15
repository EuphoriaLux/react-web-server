export const services = [
 {name:'Virtual Machines',category:'Compute',cost:10642,color:'#4263eb'},
 {name:'Azure SQL Database',category:'Database',cost:4820,color:'#748ffc'},
 {name:'Storage Accounts',category:'Storage',cost:3240,color:'#27b99a'},
 {name:'Azure Kubernetes Service',category:'Compute',cost:2180,color:'#9a7aee'},
 {name:'Bandwidth',category:'Networking',cost:1260,color:'#f1b44c'},
 {name:'Azure App Service',category:'Compute',cost:940,color:'#84a6bb'}
];
export const subscriptions=['Production','Development','Shared services'];
export const costs = services.flatMap((s,i)=>subscriptions.map((sub,j)=>({...s,id:`${i}-${j}`,subscription:sub,cost:Math.round(s.cost*[.65,.23,.12][j]*100)/100}))) ;
export const opportunities=[
 {id:'vm',title:'Rightsize underutilized virtual machines',description:'8 demo VMs have average CPU below 15%. Review memory and peak demand before resizing.',service:'Virtual Machines',subscription:'Production',saving:1240,impact:'High',effort:'Medium',resources:8,category:'Rightsizing'},
 {id:'sql',title:'Match SQL capacity to actual demand',description:'Two demo databases show low sustained utilization. Validate peak usage and service requirements.',service:'Azure SQL Database',subscription:'Production',saving:860,impact:'High',effort:'Medium',resources:2,category:'Rightsizing'},
 {id:'disk',title:'Review unattached managed disks',description:'14 synthetic disks have no attached VM. Confirm ownership and retention before removal.',service:'Storage Accounts',subscription:'Development',saving:420,impact:'Medium',effort:'Low',resources:14,category:'Idle resources'},
 {id:'schedule',title:'Schedule non-production workloads',description:'Demo development instances run outside working hours. Review availability requirements.',service:'Virtual Machines',subscription:'Development',saving:380,impact:'Medium',effort:'Low',resources:6,category:'Scheduling'},
 {id:'storage',title:'Move infrequently accessed blobs to cool storage',description:'Review access patterns, minimum retention, and retrieval costs for demo storage.',service:'Storage Accounts',subscription:'Shared services',saving:260,impact:'Low',effort:'Low',resources:3,category:'Storage'}
];
export function selectCosts(subscription='All subscriptions',search='',period='30') {
 return costs.filter(r=>(subscription==='All subscriptions'||r.subscription===subscription)&&r.name.toLowerCase().includes(search.toLowerCase())).map(r=>({...r,cost:Math.round(r.cost*(Number(period)/30)*100)/100}));
}
export const sum = rows => Math.round(rows.reduce((n,r)=>n+r.cost,0)*100)/100;
export function groupCosts(rows,key) { const m=new Map();for(const r of rows){const prev=m.get(r[key]);m.set(r[key],{name:r[key],cost:(prev?.cost||0)+r.cost,color:r.color});}return [...m.values()].sort((a,b)=>b.cost-a.cost); }
export function dailyCosts(total,days) {const weights=Array.from({length:days},(_,i)=>1+Math.sin(i*1.3)*.16+(i%7<2?-.12:.08)+i*.003);const all=weights.reduce((a,b)=>a+b,0);return weights.map((w,i)=>({day:i+1,cost:total*w/all}));}
export function csv(rows){const quote=v=>'"'+String(v).replaceAll('"','""')+'"';return ['Service,Subscription,Category,Cost EUR',...rows.map(r=>[r.name,r.subscription,r.category,r.cost.toFixed(2)].map(quote).join(','))].join('\n');}
