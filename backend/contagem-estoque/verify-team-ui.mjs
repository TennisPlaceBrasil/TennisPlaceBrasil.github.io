import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const file=new URL('../../hub/apps/contagem-estoque/app.js',import.meta.url);
const source=fs.readFileSync(file,'utf8').replace(/initializeDevice\(\)\.then\(async\(\)=>\{.*\}\s*\);/,'');
const html=fs.readFileSync(new URL('../../hub/apps/contagem-estoque/index.html',import.meta.url),'utf8');
assert.ok(html.includes('FINALIZAR CONTAGEM'));
assert.ok(html.includes('EXCLUIR CONTAGEM'));
assert.ok(html.includes('EXPORTAR ARQUIVO'));
assert.ok(html.indexOf('id="offline-panel-count"')>html.indexOf('id="export-panel"'));
assert.ok(html.indexOf('id="share-link-panel"')>html.indexOf('id="offline-panel-count"'));
assert.ok(!/IMPORTAR (?:CONTAGEM|DEFEITOS) TXT/.test(html));
assert.ok(html.includes('id="delete-confirm-dialog"'));
assert.ok(html.includes('id="large-quantity-toggle"'));
assert.ok(html.includes('id="large-quantity-input"'));
assert.ok(html.includes('id="recent-scans-list"'));
assert.ok(html.includes('id="unknown-description"'));
assert.ok(html.includes('id="unknown-gender"'));
assert.ok(html.includes('id="unknown-color"'));
assert.ok(html.includes('id="unknown-size"'));
assert.ok(!html.includes('id="unknown-brand"'));
assert.ok(html.includes('GÊNERO')&&html.includes('TAMANHO'));
assert.match(html, /id="view-session"[^>]*>VISUALIZAR<\/button>/);
assert.match(html, /id="reopen-session"[^>]*>REABRIR CONTAGEM<\/button>/);
assert.match(source, /#session-picker'\)\.addEventListener\('change',event=>\{selectedSessionId=event\.target\.value;picker\(\);\}\)/);
assert.doesNotMatch(source, /#session-picker'\)\.addEventListener\('change',event=>openCount/);
assert.match(source, /data-person-action="finish"/);
assert.match(source, /data-person-action="clear"/);
function device(){
 const els=new Map(),records=new Map(),settings=new Map(),events=[];
 const element=()=>({parentElement:null,append(child){child.parentElement=this;},value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,readOnly:false,dataset:{},className:'',classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){events.push([this,type,fn]);},setAttribute(k,v){this[k]=v;},setCustomValidity(s){this.validationMessage=s;},reportValidity(){return !this.validationMessage;},checkValidity(){return true;},focus(){},select(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},matches(){return false;}});
 const $=s=>{if(!els.has(s))els.set(s,element());return els.get(s);};
 const local={ready:async()=>{},drain:async()=>{},setting:async(k,v)=>settings.set(k,structuredClone(v)),read:async(_,k)=>settings.get(k),list:async()=>[...records.values()],restore:async(_,id)=>structuredClone(records.get(id)||null),remove:async(_,id)=>records.delete(id),save:async(owner,state,info)=>{records.set(state.id,structuredClone({...state,...info,owner}));}};
 const sandbox={console,Map,Set,JSON,Number,String,Array,Error,Date,Intl,Blob,Response,AbortSignal,crypto:globalThis.crypto,structuredClone,CustomEvent:class{},setTimeout(){return 1;},clearTimeout(){},setInterval(){},navigator:{onLine:true,userAgent:'Chrome Windows',locks:{request:async(_,options,callback)=>callback({name:'lock'})}},TPInventoryLocal:local,sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},window:{addEventListener(){},dispatchEvent(){}},document:{hidden:false,addEventListener(){},querySelector:$,querySelectorAll(){return[];},activeElement:null},confirm:()=>true,alert:()=>{},fetch:async()=>Response.json({data:null})};
 const context=vm.createContext(sandbox);vm.runInContext(source,context);
 return {context,els,records,settings,events,run:code=>vm.runInContext(code,context),$:s=>$(s)};
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
a.run("addScan('999',true,'LEITOR',{description:'Modelo X',gender:'FEMININO',color:'Azul',size:'38'},1);");
for(const field of ['description','gender','color','size'])assert.ok(a.run(`current.counts.find(r=>r.ean==='999').${field}`),`unknown product ${field} is saved on the count row`);
assert.equal(a.run("current.counts.find(r=>r.ean==='999').brand"),'','unknown product no longer requires a brand');
a.run("current.counts=current.counts.filter(r=>r.ean!=='999');");
const bulk=device();bulk.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;catalog=new Map([['001',{description:'Produto',brand:'MARCA'}]]);current={id:'bulk',label:'APAR TESTE',store:'APAR',kind:'CONTAGEM',date:'2026-10-23',responsible:'Maria',status:'EM ANDAMENTO',counts:[],defects:[],version:0};largeQuantityEnabled=true;$('#large-quantity-input').value='7';addScan('001',false,'LEITOR',null,7);addScan('001',false,'LEITOR',null,4);");
assert.equal(bulk.run("current.counts.find(r=>r.ean==='001').quantity"),11,'Large quantity adds to an existing EAN');
bulk.run("mode='defects';addScan('001',false,'LEITOR',null,3);");
assert.equal(bulk.run("current.defects.find(r=>r.ean==='001').quantity"),3,'Large quantity works in defect mode');
bulk.run("renderRecentScans({counts:[{ean:'old',description:'ANTIGO',quantity:1,lastScannedAt:'2026-10-23T10:00:00Z'},{ean:'new',description:'NOVO',quantity:9,lastScannedAt:'2026-10-23T12:00:00Z'}],defects:[{ean:'def',description:'DEFEITO',quantity:2,lastScannedAt:'2026-10-23T11:00:00Z'},{ean:'newer',description:'NOVO MAIS RECENTE',quantity:1,lastScannedAt:'2026-10-23T13:00:00Z'}]});");
assert.equal((bulk.$('#recent-scans-list').innerHTML.match(/<li>/g)||[]).length,3,'Recent list combines both modes and caps at three products');
assert.match(bulk.$('#recent-scans-list').innerHTML,/NOVO MAIS RECENTE/);
assert.match(bulk.$('#recent-scans-list').innerHTML,/DEFEITO/);
assert.doesNotMatch(bulk.$('#recent-scans-list').innerHTML,/ANTIGO/);
bulk.run("largeQuantityEnabled=false;$('#large-quantity-input').value='';");
assert.equal(bulk.run('readScanQuantity()'),1,'Normal scan keeps a quantity of one');
bulk.run("largeQuantityEnabled=true;$('#large-quantity-input').value='';");
assert.equal(bulk.run('readScanQuantity()'),null,'Large quantity requires a value');
bulk.run("$('#large-quantity-input').value='1.5';");
assert.equal(bulk.run('readScanQuantity()'),null,'Large quantity must be a whole number');
console.log('PASS: large-quantity accumulation and validation; recent list combines count and defect modes');
a.run('inventoryHome=false;renderTeam()');assert.equal(a.$('#team-open').hidden,false,'Open team counts remain available while a session is active');
a.context.fetch=async()=>Response.json({data:[{id:'c',label:'ECOM TESTE',date:'2026-10-23',participants:[{responsible:'Maria',done:false}]}]});
await a.run('loadTeamCounts()');assert.match(a.$('#team-open-list').innerHTML,/ECOM TESTE/);assert.match(a.$('#team-open-list').innerHTML,/>CONTINUAR<\/button>/);
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

// Classification is present in both the visible grid and exports, including legacy local rows.
a.run("catalog.set('001',{description:'Produto',brand:'MARCA',subgroup:'TENIS'});current.localFinished=false;current.collabReadOnly=false;teamScope='own';render()");
assert.equal((a.$('#count-body').innerHTML.match(/<td>/g)||[]).length,6);assert.match(a.$('#count-body').innerHTML,/TENIS/);assert.equal(a.run('teamExportState().counts[0].subgroup'),'TENIS');
// Non-administrators cannot start an analysis request.
let unauthorizedFetches=0;b.context.fetch=async()=>{unauthorizedFetches++;return Response.json({});};await b.run('analyze()');assert.equal(unauthorizedFetches,0);
console.log('PASS: subgroup visible in table/mobile/export and analysis remains administrative');

// A multi-store account sees all authorized history by default and can filter down to one store.
const history=device();let listPayloads=[];
history.run("user={id:'multi',store:null,allStores:false,multiStore:true};stores=['APAR','JOIN'];auth={access_token:'test'};current=null;displayAccount();picker();");
assert.equal(history.$('#session-picker-wrap').hidden,false);
assert.equal(history.$('#history-store-filter').hidden,false);
history.context.fetch=async(_url,req)=>{const body=JSON.parse(req.body);listPayloads.push(body);return Response.json({data:body.filterStore?[{id:'join',store:'JOIN',label:'JOIN FINAL',status:'FINALIZADA'}]:[{id:'apar',store:'APAR',label:'APAR FINAL',status:'FINALIZADA'},{id:'join',store:'JOIN',label:'JOIN FINAL',status:'FINALIZADA'}]});};
await history.run('loadSessions()');
assert.equal(listPayloads[0].action,'list');assert.equal('filterStore' in listPayloads[0],false,'Default history request means all assigned stores');
assert.match(history.$('#session-picker').innerHTML,/APAR FINAL/);assert.match(history.$('#session-picker').innerHTML,/JOIN FINAL/);
history.run("historyStoreFilter='JOIN';sessions=[];sessionsLoaded=false;");await history.run('loadSessions()');
assert.equal(listPayloads[1].filterStore,'JOIN');assert.equal(history.run('sessions.length'),1);assert.equal(history.run('sessions[0].id'),'join');
console.log('PASS: multi-store history defaults to all authorized stores and filters by store');
const selection=device();selection.run("user={id:'admin',allStores:true};sessions=[{id:'selected',label:'APAR FINAL',status:'FINALIZADA',kind:'CONTAGEM'}];current=null;picker();");
const onChange=selection.events.find(([element,type])=>element===selection.$('#session-picker')&&type==='change')[2];selection.$('#session-picker').value='selected';onChange({target:selection.$('#session-picker')});
assert.equal(selection.$('#view-session').hidden,false,'selected count should be opened only by VISUALIZAR');
assert.equal(selection.$('#reopen-session').hidden,false,'ADM should see REABRIR CONTAGEM for a finalized standard count');
assert.equal(selection.run('current'),null,'choosing an option must not open the count');
assert.equal(selection.run('selectedSessionId'),'selected');
const adm=device();adm.run("user={id:'admin',allStores:true};current={id:'c',label:'APAR TESTE',store:'APAR',collaborative:true,collabViewOnly:true,status:'EM ANDAMENTO',participants:[{id:'p1',responsible:'Maria',done:false,units:3,defects:1,updatedAt:'2026-10-27T12:00:00Z'}],counts:[],defects:[],version:1,mirroredVersion:1};renderTeam();");
assert.match(adm.$('#team-people').innerHTML,/data-person-action="finish" data-person-id="p1"/);
assert.match(adm.$('#team-people').innerHTML,/data-person-action="clear" data-person-id="p1"/);
console.log('PASS: explicit VISUALIZAR, ADM reopen selection, and per-person finish/clear controls');
