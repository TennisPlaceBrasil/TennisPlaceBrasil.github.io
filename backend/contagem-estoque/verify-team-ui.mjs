import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const file=new URL('../../hub/apps/contagem-estoque/app.js',import.meta.url);
const source=fs.readFileSync(file,'utf8').replace(/initializeDevice\(\)\.then\(async\(\)=>\{.*\}\s*\);/,'');
function device(){
 const els=new Map(),records=new Map(),settings=new Map(),events=[];
 const element=()=>({value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,readOnly:false,dataset:{},className:'',classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){events.push([this,type,fn]);},setCustomValidity(s){this.validationMessage=s;},reportValidity(){return !this.validationMessage;},checkValidity(){return true;},focus(){},select(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},matches(){return false;}});
 const $=s=>{if(!els.has(s))els.set(s,element());return els.get(s);};
 const local={ready:async()=>{},drain:async()=>{},setting:async(k,v)=>settings.set(k,structuredClone(v)),read:async(_,k)=>settings.get(k),list:async()=>[...records.values()],restore:async(_,id)=>structuredClone(records.get(id)||null),remove:async(_,id)=>records.delete(id),save:async(owner,state,info)=>{records.set(state.id,structuredClone({...state,...info,owner}));}};
 const sandbox={console,Map,Set,JSON,Number,String,Array,Error,Date,Intl,Blob,Response,AbortSignal,crypto:globalThis.crypto,structuredClone,CustomEvent:class{},setTimeout(){return 1;},clearTimeout(){},setInterval(){},navigator:{onLine:true,userAgent:'Chrome Windows',locks:{request:async(_,options,callback)=>callback({name:'lock'})}},TPInventoryLocal:local,sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},window:{addEventListener(){},dispatchEvent(){}},document:{hidden:false,addEventListener(){},querySelector:$,querySelectorAll(){return[];},activeElement:null},confirm:()=>true,alert:()=>{},fetch:async()=>Response.json({data:null})};
 const context=vm.createContext(sandbox);vm.runInContext(source,context);
 return {context,els,records,settings,run:code=>vm.runInContext(code,context),$:s=>$(s)};
}
const a=device(),b=device();
for(const d of [a,b]){
 assert.equal(d.run("validResponsible('João')"),true);
 assert.equal(d.run("validResponsible('Ana')"),false);
 assert.equal(d.run("validResponsible('A n a')"),false);
 assert.equal(d.run("validResponsible('Maria 123')"),false);
 d.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;catalog=new Map([['001',{description:'Produto',brand:'MARCA'}]]);current={id:'c',label:'APAR TESTE',store:'APAR',kind:'CONTAGEM',date:'2026-10-23',collaborative:true,participantId:'p',participantVersion:0,responsible:'Maria',status:'EM ANDAMENTO',counts:[],defects:[],peers:{counts:[],defects:[]},participants:[],version:0};");
}
a.run("addScan('001');addScan('001');current.peers.counts=[{ean:'001',quantity:3,description:'Produto',brand:'MARCA',responsible:'João'}];");
assert.equal(a.run('teamExportState().counts[0].quantity'),5);
a.run('inventoryHome=false;renderTeam()');assert.equal(a.$('#team-open').hidden,false,'Open team counts remain available while a session is active');
a.context.fetch=async()=>Response.json({data:[{id:'c',label:'ECOM TESTE',date:'2026-10-23',participants:[{responsible:'Maria',done:false}]}]});
await a.run('loadTeamCounts()');assert.match(a.$('#team-open-list').innerHTML,/Maria/);assert.match(a.$('#team-open-list').innerHTML,/>CONTINUAR<\/button>/);
a.run("teamScope='total';addScan('001')");assert.equal(a.run('current.counts[0].quantity'),2,'Total view must not edit own or combined rows');
a.run("teamScope='own';current.counts[0].quantity=1;current.counts[0].origin='AJUSTE MANUAL';changed();");
assert.equal(a.run('teamExportState().counts[0].quantity'),4,'Own correction preserves other participant');
a.run('current.collabReadOnly=true;addScan("001")');assert.equal(a.run('current.counts[0].quantity'),1,'Locked second tab cannot scan');
a.run('current.collabReadOnly=false');
// Server committed, HTTP response lost: durable request is replayed unchanged.
let seenId,commits=0,fail=true;
a.context.fetch=async(_url,req)=>{
 const input=JSON.parse(req.body);
 if(input.action==='save'){
  if(seenId!==input.requestId){seenId=input.requestId;commits++;}
  if(fail){fail=false;throw Error('connection lost after commit');}
  return Response.json({data:{version:1,participantVersion:1,participantDone:false,status:'EM ANDAMENTO',counts:input.counts,defects:input.defects,peers:{counts:[{ean:'001',quantity:3,description:'Produto',brand:'MARCA',responsible:'João'}],defects:[]},participants:[]}});
 }return Response.json({data:null});
};
await a.run('flush()');
assert.equal(a.run('retry.body.requestId'),seenId);assert.ok(a.records.get('c').retry,'Exact packet persisted before sending');
await a.run('flush()');assert.equal(commits,1);assert.equal(a.run('serial'),a.run('saved'));assert.equal(a.run('teamExportState().counts[0].quantity'),4);
a.run('current.collabReadOnly=true;current.counts[0].quantity=77');await a.run('persistDraft()');assert.equal(a.records.get('c').counts[0].quantity,1,'Read-only second tab cannot overwrite the device backup');a.run('current.collabReadOnly=false;current.counts[0].quantity=1');
const recovered=device();recovered.run("user={id:'u',store:'APAR',allStores:false};");recovered.context.record=a.records.get('c');recovered.run('adoptLocal(record)');
assert.equal(recovered.run('current.responsible'),'Maria');assert.equal(recovered.run('current.counts[0].quantity'),1);assert.equal(recovered.run('teamExportState().counts[0].quantity'),4);
// Late save response must not undo a finish requested while the write was in flight.
a.run("current.localFinished=true;applyTeamResult(current,{participantDone:false,participantVersion:2,status:'EM ANDAMENTO',peers:current.peers,participants:[]})");
assert.equal(a.run('current.localFinished'),true);
// No error allows writes into another participant's arrays.
b.run("current.responsible='João';current.localFinished=true;addScan('001');");assert.equal(b.run('current.counts.length'),0);
// 5,000 own rows + 5,000 peer rows preserve EAN zeros, totals, identity and timestamps after local recovery.
const start=performance.now();
b.run("current.localFinished=false;current.counts=Array.from({length:5000},(_,i)=>({ean:String(i).padStart(13,'0'),quantity:1,description:'Produto '+i,brand:'MARCA',lastScannedAt:'2026-10-23T12:00:00Z'}));current.peers.counts=current.counts.map(r=>({...r,quantity:2,responsible:'Maria'}));changed();");
await b.run('persistDraft()');b.context.record=b.records.get('c');b.run('current=null;adoptLocal(record)');
assert.equal(b.run('current.counts.length'),5000);assert.equal(b.run('teamExportState().counts.reduce((n,r)=>n+r.quantity,0)'),15000);assert.equal(b.run('current.counts[0].ean'),'0000000000000');
assert.equal(b.run('current.counts[4999].lastScannedAt'),'2026-10-23T12:00:00Z');
console.log('PASS: responsible validation, own/combined isolation, tab lock guards, lost-response replay, recovery, late finish, 5,000 + 5,000 rows ('+Math.round(performance.now()-start)+' ms)');
