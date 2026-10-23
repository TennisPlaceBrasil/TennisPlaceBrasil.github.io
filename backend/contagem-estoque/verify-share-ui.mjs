import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const nodes=new Map();const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',hidden:false});return nodes.get(selector);};
const payload={data:{store:'ECOM',label:'ECOM-2026-10-23',date:'2026-10-23',status:'EM ANDAMENTO',updatedAt:'2026-10-23T16:00:00Z',counts:[{ean:'1',quantity:5}],defects:[],products:[{ean:'1',quantity:5}],participants:[
 {responsible:'Maria',done:false,updatedAt:'2026-10-23T15:59:00Z',device:'Chrome',counts:[{ean:'1',quantity:2,description:'Raquete A',brand:'Marca A'}],defects:[]},
 {responsible:'João',done:true,updatedAt:'2026-10-23T15:58:00Z',device:'Celular',counts:[{ean:'1',quantity:3,description:'Raquete A',brand:'Marca A'}],defects:[{ean:'2',quantity:1,description:'Produto B',brand:'Marca B'}]}
]}};
const context=vm.createContext({URLSearchParams,location:{search:'?token=test'},document:{querySelector:$},setInterval(){},fetch:async()=>Response.json(payload)});
const source=fs.readFileSync(new URL('../../hub/apps/contagem-estoque/acompanhamento/app.js',import.meta.url),'utf8');
vm.runInContext(source,context);
await new Promise(resolve=>setTimeout(resolve,0));
const html=$('#participant-cards').innerHTML;
assert.match(html,/Maria/);assert.match(html,/João/);assert.equal((html.match(/class="person-card"/g)||[]).length,2,'Each responsible gets an independent stacked card');
assert.match(html,/Raquete A/);assert.match(html,/Produto B/);assert.equal($('#dashboard').hidden,false);
console.log('PASS: one shared dashboard renders separate, vertically stacked responsible cards with each person’s counts and defects');
