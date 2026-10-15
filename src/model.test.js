import {test} from 'node:test';import assert from 'node:assert/strict';import {selectCosts,sum,groupCosts,dailyCosts,csv} from './model.js';
test('subscription totals reconcile with the full Azure dataset',()=>assert.equal(Math.round(['Production','Development','Shared services'].reduce((a,s)=>a+sum(selectCosts(s)),0)*100),Math.round(sum(selectCosts())*100)));
test('period and service filters change amounts and match rows',()=>{const r=selectCosts('Development','sql','7');assert.equal(r.length,1);assert.equal(r[0].cost,258.67);});
test('grouped costs and daily chart reconcile with displayed total',()=>{const r=selectCosts();const total=sum(r);assert.equal(sum(groupCosts(r,'name')),total);assert.ok(Math.abs(sum(dailyCosts(total,30))-total)<.01);});
test('CSV escapes strings and uses numeric costs',()=>{assert.equal(csv([{name:'A "B"',subscription:'Prod',category:'Compute',cost:12}]).split('\n')[1],'"A ""B""","Prod","Compute","12.00"');});
