import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const element=()=>({parentElement:null,append(child){child.parentElement=this;},value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,className:'',dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(key,value){this[key]=value;},focus(){},select(){},setCustomValidity(value){this.validationMessage=value;},reportValidity(){return !this.validationMessage;},checkValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;}});
const elements=new Map();
const context=vm.createContext({console,Map,Set,JSON,Number,String,Array,Error,crypto:globalThis.crypto,structuredClone,CustomEvent:globalThis.CustomEvent,localStorage:{setItem(){},getItem(){return null;},removeItem(){}},sessionStorage:{getItem(){return null;}},navigator:{onLine:true},document:{hidden:false,activeElement:null,addEventListener(){},querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll(){return[];}},fetch:async()=>Response.json({data:null}),window:{addEventListener(){},dispatchEvent(){}},setTimeout(){return 1;},setInterval(){return 1;},clearTimeout(){}});
vm.runInContext(fs.readFileSync(new URL('../../hub/apps/contagem-estoque/dashboard.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../../hub/apps/contagem-estoque/app.js',import.meta.url),'utf8').replace(/initializeDevice\(\)\.then\(async\(\)=>\{.*\}\s*\);/,''),context);
vm.runInContext("catalog=new Map([['1',{description:'Produto A',brand:'MARCA'}]]);",context);
context.fixture=[
 {store:'APAR',date:'2026-10-20',status:'FINALIZADA',kind:'CONTAGEM',createdAt:'2026-10-20T12:00:00Z',counts:[{ean:'1',quantity:2,description:'A',brand:'MARCA'}],defects:[{ean:'1',quantity:1,description:'A',brand:'MARCA'}]},
 {store:'APAR',date:'2026-10-21',status:'FINALIZADA',kind:'CONTAGEM',createdAt:'2026-10-21T12:00:00Z',counts:[{ean:'2',quantity:4,description:'B',brand:'OUTRA'}],defects:[]},
 {store:'JOIN',date:'2026-10-21',status:'FINALIZADA',kind:'CONTAGEM',createdAt:'2026-10-21T12:00:00Z',counts:[{ean:'1',quantity:8,description:'A',brand:'MARCA'}],defects:[]}
];
const pivot=JSON.parse(JSON.stringify(vm.runInContext('pivotAnalysis(fixture)',context)));
assert.equal(pivot.rows.length,3);
assert.equal(pivot.rows.find(r=>r.store==='APAR'&&r.ean==='1').values['2026-10-20'],3);
assert.equal(pivot.rows.find(r=>r.store==='APAR'&&r.ean==='1').values['2026-10-21']||0,0);
assert.equal(pivot.rows.find(r=>r.store==='JOIN').values['2026-10-21'],8);
vm.runInContext("current={id:'s',kind:'CONTAGEM',status:'EM ANDAMENTO',version:0,counts:[],defects:[]};user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;",context);context.document.querySelector('#count-responsible').value='Maria';
context.document.querySelector('#ean-input').value='999';
await vm.runInContext('scan()',context);
assert.equal(elements.get('#unknown-dialog').open,true,'A confirmed unknown EAN opens the identification form');
assert.equal(vm.runInContext('current.counts.length',context),0,'Unknown EAN must wait for confirmation');
vm.runInContext("addScan('999',true,'TESTE',{description:'Produto 999',brand:'MARCA',gender:'MASCULINO',color:'AZUL',size:'38'},1)",context);
assert.equal(vm.runInContext('current.counts[0].unknown',context),true);
vm.runInContext("catalog.set('2',{description:'Produto B',brand:'MARCA'});addScan('2');addScan('1');",context);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("current.counts.map(r=>r.ean)",context))),['999','2','1'],'Scanned products must keep first-scan order');
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("parseRecountTxt('EAN\\n001\\n001\\n002,500')",context))),['001','002']);
assert.throws(()=>vm.runInContext("parseRecountTxt('1.23E+12')",context),/linhas/);
vm.runInContext("current={id:'recount',kind:'RECONTAGEM',status:'EM ANDAMENTO',version:0,targets:[{ean:'1',description:'Produto A'}],counts:[],defects:[],zeroEans:[]};addScan('2');",context);
assert.equal(vm.runInContext('current.counts.length',context),0);
vm.runInContext("addScan('1');",context);
assert.match(elements.get('#recount-target-list').innerHTML,/class="recount-target included"/);
assert.doesNotMatch(elements.get('#recount-target-list').innerHTML,/green|correto|certo/);
const gas=vm.createContext({console,Map,Set,JSON,Number,String,Array,Error});
vm.runInContext(fs.readFileSync(new URL('Code.gs',import.meta.url),'utf8'),gas);
assert.throws(()=>vm.runInContext("normalizeRows_([{ean:'999',quantity:1}],new Map())",gas),/inexistente/);
const normalized=vm.runInContext("normalizeRows_([{ean:'1',quantity:2},{ean:'1',quantity:3}],new Map([['1',['1','A','MARCA']]]))",gas);
assert.equal(normalized[0].quantity,5);
vm.runInContext("metadata_=()=>[{id:'s',store:'APAR',status:'EM ANDAMENTO',version:2,requestId:'last',sheet:'APAR-20-10-2026',row:2},{id:'j',store:'JOIN',status:'FINALIZADA',version:3,requestId:'done',sheet:'JOIN-21-10-2026',row:3}];state_=(m)=>({id:m.id,store:m.store});",gas);
assert.equal(vm.runInContext("route_({action:'list',allowedStores:['APAR','JOIN']}).length",gas),2,'Authorized multi-store history loads without an explicit store filter');
assert.equal(vm.runInContext("route_({action:'list',allowedStores:['APAR','JOIN'],filterStore:'JOIN'})[0].id",gas),'j','History filter selects an authorized store');
assert.equal(vm.runInContext("route_({action:'list',allowedStores:['APAR'],filterStore:'JOIN'}).length",gas),0,'Bridge-side filtering must not return an unassigned store');
assert.equal(vm.runInContext("route_({action:'read',id:'j',allowedStores:['APAR','JOIN']}).store",gas),'JOIN','Authorized finalized counts can be opened');
assert.throws(()=>vm.runInContext("route_({action:'read',id:'j',allowedStores:['APAR']})",gas),/permissão/,'Unassigned counts stay private');
assert.throws(()=>vm.runInContext("route_({action:'save',id:'s',store:'APAR',version:1})",gas),/CONFLICT/);
vm.runInContext("deletedRow=0;removedTab=false;db_=()=>({getSheetByName:n=>n==='_Contagens'?{deleteRow:r=>deletedRow=r}:n==='APAR-20-10-2026'?{}:null,deleteSheet:()=>removedTab=true});SpreadsheetApp={flush(){}};",gas);
const deleted=vm.runInContext("route_({action:'delete',id:'s',allStores:true})",gas);
assert.equal(deleted.deleted,true);assert.equal(vm.runInContext('deletedRow',gas),2);assert.equal(vm.runInContext('removedTab',gas),true);
assert.throws(()=>vm.runInContext("route_({action:'delete',id:'s',allStores:false})",gas),/Exclusão restrita/);
let handler,outbound,bridgeCalls=0,authLookups=0,actor='store',active=true;
globalThis.Deno={env:{get:k=>k==='SUPABASE_URL'?'https://test.supabase.co':'server-only'},serve:fn=>handler=fn};
globalThis.fetch=async(url,options={})=>{
 const s=String(url);
 if(s.includes('/auth/v1/user')){authLookups++;return Response.json({id:actor==='admin'?'adb6a08e-1a28-4b41-8dde-addd9c06f915':'store-user'});}
 if(s.includes('manual_portal_members'))return Response.json([{active,profiles:actor==='admin'?['adm']:['loja']}]);
 if(s.includes('manual_portal_store_logins'))return Response.json([{sigla:'APAR'},{sigla:'JOIN'}]);
 if(s.includes('stockcount_user_store_access'))return Response.json([]);
 if(s.includes('stockcount_team_counts'))return Response.json([]);
 if(s.includes('/rpc/stockcount_team'))return Response.json([]);
 if(s.includes('stockcount_bridge_config'))return Response.json([{endpoint:'https://bridge.test',secret:'server-secret'}]);
 if(s==='https://bridge.test'){bridgeCalls++;outbound=JSON.parse(options.body);return Response.json({ok:true,data:[]});}
 throw Error('Unexpected URL '+s);
};
await import('./index.ts');
const request=body=>new Request('https://api.test',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify(body)});
const jwtRequest=body=>{
 const id=actor==='admin'?'adb6a08e-1a28-4b41-8dde-addd9c06f915':'store-user';
 const payload=btoa(JSON.stringify({sub:id,email:actor==='admin'?'admin@example.test':null})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 return new Request('https://api.test',{method:'POST',headers:{Authorization:'Bearer e30.'+payload+'.sig','Content-Type':'application/json'},body:JSON.stringify(body)});
};
let response=await handler(jwtRequest({action:'bootstrap'}));
assert.equal(response.status,200);const boot=await response.json();assert.deepEqual(boot.sessions,[]);assert.equal(boot.user.multiStore,true);assert.deepEqual(boot.stores,['APAR','JOIN']);assert.equal(bridgeCalls,0,'Login bootstrap must not contact Google Drive for history');assert.equal(authLookups,0,'Verified JWT claims avoid a second Auth user lookup');
response=await handler(jwtRequest({action:'create',store:'JOIN',allStores:true,secret:'spoof'}));
assert.equal(response.status,200);assert.equal(outbound.store,'JOIN');assert.equal(outbound.allStores,false);assert.equal(outbound.secret,'server-secret');assert.deepEqual(outbound.allowedStores,['APAR','JOIN']);
response=await handler(jwtRequest({action:'create',store:'ARAS'}));assert.equal(response.status,403,'Multi-store account cannot create in an unassigned store');
response=await handler(jwtRequest({action:'list'}));assert.equal(response.status,200,'Multi-store account can load the assigned-store history');
response=await handler(jwtRequest({action:'requestRecount',id:'known-count',eans:['1']}));assert.equal(response.status,403);
response=await handler(jwtRequest({action:'read',id:'known-count'}));assert.equal(response.status,200);
response=await handler(jwtRequest({action:'delete',id:'known-count'}));assert.equal(response.status,403);
response=await handler(jwtRequest({action:'analysis',allStores:true}));assert.equal(response.status,403);
response=await handler(jwtRequest({action:'importRows',id:'known-count',version:0,kind:'counts',rows:[{ean:'1',quantity:2}]}));assert.equal(response.status,200,'Stores can import TXT rows through the authenticated bridge');assert.equal(outbound.action,'importRows');
response=await handler(jwtRequest({action:'discardEmpty',id:'known-count'}));assert.equal(response.status,200,'Stores can discard their empty current count');assert.equal(outbound.action,'discardEmpty');
active=false;response=await handler(jwtRequest({action:'list'}));assert.equal(response.status,403);
active=true;actor='admin';response=await handler(jwtRequest({action:'analysis'}));assert.equal(response.status,200);assert.equal(outbound.allStores,true);
console.log('Verified: unknown-EAN confirmation; quantity consolidation; stock pivot; version conflicts; store history/read/delete restrictions; admin deletion of spreadsheet tab and history row.');

