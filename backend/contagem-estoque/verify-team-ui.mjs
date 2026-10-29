import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const file=new URL('../../hub/apps/contagem-estoque/app.js',import.meta.url);
const source=fs.readFileSync(file,'utf8').replace(/initializeDevice\(\)\.then\(async\(\)=>\{.*\}\s*\);/,'');
const html=fs.readFileSync(new URL('../../hub/apps/contagem-estoque/index.html',import.meta.url),'utf8');
const exporter=fs.readFileSync(new URL('../../hub/apps/contagem-estoque/offline-export.js',import.meta.url),'utf8');
const sheetBackend=fs.readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
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
assert.ok(html.includes('id="unknown-subgroup"'));
assert.match(html,/id="unknown-subgroup"[^>]*required/);
assert.match(html,/id="ean-input"[^>]*maxlength="15"/);
assert.match(html,/id="unknown-gender"[^>]*><option value="">Selecione<\/option><option value="MASCULINO">/);
assert.match(html,/id="unknown-size"[^>]*maxlength="4"/);
assert.match(html,/id="unknown-brand"[^>]*required/);
assert.match(html,/id="unknown-quantity"[^>]*max="1000"[^>]*required/);
assert.match(source,/findUnknownProduct\(ean\)/);
assert.match(source,/validUnknownText\(subgroup,80\)/);
assert.match(source,/MAX_PRODUCT_QUANTITY=1000,MAX_STORE_QUANTITY=10000/);
assert.match(exporter,/\['EAN','QNTD','PRODUTO','MARCA','GÊNERO','COR','TAMANHO','SUBGRUPO'/);
assert.ok(html.includes('GÊNERO')&&html.includes('TAMANHO'));
assert.match(html, /id="view-session"[^>]*>VISUALIZAR<\/button>/);
assert.match(html, /id="reopen-session"[^>]*>REABRIR CONTAGEM<\/button>/);
assert.match(source, /#session-picker'\)\.addEventListener\('change',event=>\{selectedSessionId=event\.target\.value;picker\(\);\}\)/);
assert.doesNotMatch(source, /#session-picker'\)\.addEventListener\('change',event=>openCount/);
assert.match(source, /data-person-action="finish"/);
assert.match(source, /data-person-action="clear"/);
assert.match(source,/const MAX_EAN_LENGTH=15/);
assert.match(source,/Não foi possível consultar o cadastro agora[\s\S]*scanSound\(false\)/);
assert.match(source,/subgroup:existingUnknown\.subgroup\|\|''/);
assert.match(exporter,/r\.unknown\?\[r\.description,r\.gender,r\.color,r\.size\]\.filter\(Boolean\)\.join\(' '\)/);
assert.match(sheetBackend,/description:product\?product\[1\]:model/);
const exportVm=vm.createContext({window:{},TextEncoder,Blob});vm.runInContext(exporter,exportVm);
const sampleWorkbook=await exportVm.window.TPInventoryExport.workbook({counts:[{ean:'001',quantity:1,description:'MODELO',unknown:true,gender:'MASCULINO',color:'AZUL',size:'38'}],defects:[]});
assert.ok(Buffer.from(await sampleWorkbook.arrayBuffer()).includes(Buffer.from('MODELO MASCULINO AZUL 38')),'downloaded workbook PRODUCT cell must contain the four-field concatenation');
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
a.run("addScan('999',true,'LEITOR',{description:'Modelo X',brand:'Marca X',gender:'FEMININO',color:'Azul',size:'38'},1);");
for(const field of ['description','gender','color','size'])assert.ok(a.run(`current.counts.find(r=>r.ean==='999').${field}`),`unknown product ${field} is saved on the count row`);
a.run('render()');assert.match(a.$('#count-body').innerHTML,/GÊNERO FEMININO · COR Azul · TAMANHO 38/,'unknown product attributes are visible in the count list');
assert.equal(a.run("current.counts.find(r=>r.ean==='999').brand"),'Marca X','unknown product brand is retained');
a.run("current.counts=current.counts.filter(r=>r.ean!=='999');");
// Unknown-product cells are uppercase, punctuation-free, and concatenated in required order for Sheets.
const normalizer=sheetBackend.slice(sheetBackend.indexOf('function normalizeRows_'),sheetBackend.indexOf('\nfunction mergeRows_',sheetBackend.indexOf('function normalizeRows_')));
const sheetVm=vm.createContext({responsibleText_:r=>r.responsible||''});vm.runInContext(normalizer,sheetVm);
const normalized=sheetVm.normalizeRows_([{ean:'000000000000001',quantity:2,unknown:true,description:'modelo-x',brand:'Marca-X',gender:'feminino',color:'azul/vermelho',size:'2xl'}],new Map());
assert.equal(normalized[0].description,'MODELOX');assert.equal(normalized[0].brand,'MARCAX');assert.equal(normalized[0].gender,'FEMININO');assert.equal(normalized[0].color,'AZULVERMELHO');assert.equal(normalized[0].size,'2XL');
assert.throws(()=>sheetVm.normalizeRows_([{ean:'123',quantity:1,unknown:true,description:'MODELO',brand:'!!!',gender:'MASCULINO',color:'AZUL',size:'38'}],new Map()),/MODELO, MARCA, GÊNERO, COR e TAMANHO/);
assert.throws(()=>sheetVm.normalizeRows_([{ean:'1234567890123456',quantity:1,unknown:true,description:'MODELO',brand:'MARCA',gender:'MASCULINO',color:'AZUL',size:'38'}],new Map()),/EAN ou quantidade inválida/);
assert.throws(()=>sheetVm.normalizeRows_([{ean:'123',quantity:501,unknown:true,description:'MODELO',brand:'MARCA',gender:'MASCULINO',color:'AZUL',size:'38'},{ean:'123',quantity:500,unknown:true,description:'MODELO',brand:'MARCA',gender:'MASCULINO',color:'AZUL',size:'38'}],new Map()),/1.000 unidades/);
assert.throws(()=>sheetVm.validateCountLimits_([{ean:'1',quantity:1000}],[{ean:'1',quantity:1}]),/1.000 unidades/);
assert.throws(()=>sheetVm.validateCountLimits_(Array.from({length:11},(_,i)=>({ean:String(i),quantity:1000})),[]),/10.000 unidades/);
assert.throws(()=>sheetVm.normalizeRows_([{ean:'123',quantity:1,unknown:true,description:'MODELO',gender:'MASCULINO',color:'AZUL',size:'38/2'}],new Map()),/MODELO, MARCA, GÊNERO, COR e TAMANHO/);
// Existing unknown EAN from another participant is reused, including across count and defect modes.
const shared=device();shared.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;catalog=new Map();current={id:'shared',kind:'CONTAGEM',status:'EM ANDAMENTO',responsible:'Maria',counts:[],defects:[],peers:{counts:[{ean:'12345',quantity:3,unknown:true,description:'MODELO',brand:'MARCA X',gender:'FEMININO',color:'AZUL',size:'38'}],defects:[]}};$('#ean-input').value='12345';");
await shared.run('scan()');assert.equal(shared.run("current.counts[0].quantity"),1);assert.equal(shared.$('#unknown-dialog').open,undefined,'known shared unknown EAN should bypass the identification dialog');assert.equal(shared.run("current.counts[0].description"),'MODELO');
shared.run("mode='defects';$('#ean-input').value='12345';");await shared.run('scan()');assert.equal(shared.run("current.defects[0].brand"),'MARCA X');assert.equal(shared.run("current.defects[0].gender"),'FEMININO');assert.equal(shared.$('#unknown-dialog').open,undefined,'defect mode reuses the previously identified product');
const caps=device();caps.run("user={id:'u',store:'APAR',allStores:false};catalogComplete=true;catalog=new Map([['001',{description:'Produto',brand:'MARCA'}]]);current={id:'caps',kind:'CONTAGEM',status:'EM ANDAMENTO',responsible:'Maria',counts:[{ean:'001',quantity:999,description:'Produto',brand:'MARCA'}],defects:[],peers:{counts:[],defects:[]}};");caps.run("addScan('001');addScan('001');");assert.equal(caps.run("current.counts[0].quantity"),1000,'single EAN cap blocks its 1,001st unit');caps.run("mode='defects';addScan('001');");assert.equal(caps.run('current.defects.length'),0,'counts and defects share the per-product limit');caps.run("current.counts=[{ean:'001',quantity:1000,description:'Produto',brand:'MARCA'}];current.defects=[];");caps.run("for(let i=0;i<8;i++)current.defects.push({ean:String(i+2),quantity:1000,description:'P',brand:'M'});current.defects.push({ean:'20',quantity:999,description:'P',brand:'M'});catalog.set('30',{description:'Produto 30',brand:'MARCA'});addScan('30');addScan('30');");assert.equal(caps.run('countTotals().total'),10000,'store tally is not incremented beyond 10,000');
// A definitive online miss opens identification; a transport failure only shows an inline message.
const classification=device();classification.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};current={id:'lookup',kind:'CONTAGEM',status:'EM ANDAMENTO',responsible:'Maria',counts:[],defects:[]};catalogComplete=false;catalog=new Map();$('#ean-input').value='123456789012345';");
classification.context.fetch=async()=>Response.json({data:null});await classification.run('scan()');assert.equal(classification.$('#unknown-dialog').open,true,'confirmed absence opens the unknown-product form');
classification.$('#unknown-dialog').close();classification.$('#ean-input').value='123456789012346';classification.context.fetch=async()=>({ok:false,status:503,text:async()=>JSON.stringify({error:'offline'})});await classification.run('scan()');assert.equal(classification.$('#unknown-dialog').open,false,'query failure must not open a product form');assert.match(classification.$('#scan-message').textContent,/Não foi possível consultar/);
// An offline cache miss stays provisional and remains usable.
classification.context.navigator.onLine=false;classification.$('#ean-input').value='111111111111111';await classification.run('scan()');assert.equal(classification.$('#unknown-dialog').open,true,'offline unknown EAN permits provisional identification');
// Camera-detected unknown EAN routes to the same four-field form.
const camera=device();camera.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};current={id:'cam',kind:'CONTAGEM',status:'EM ANDAMENTO',responsible:'Maria',counts:[],defects:[]};catalogComplete=true;catalog=new Map();cameraActive=true;cameraGeneration=1;");
await camera.run("cameraDetected('123456789012345')");assert.equal(camera.$('#unknown-dialog').open,true);assert.equal(camera.run('unknown'),'123456789012345');assert.equal(camera.run('unknownOrigin'),'CÂMERA');
const bulk=device();bulk.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;catalog=new Map([['001',{description:'Produto',brand:'MARCA'}]]);current={id:'bulk',label:'APAR TESTE',store:'APAR',kind:'CONTAGEM',date:'2026-10-23',responsible:'Maria',status:'EM ANDAMENTO',counts:[],defects:[],version:0};largeQuantityEnabled=true;$('#large-quantity-input').value='7';addScan('001',false,'LEITOR',null,7);assert.equal($('#large-quantity-input').value,'','Successful product launch clears the large quantity field');$('#large-quantity-input').value='4';addScan('001',false,'LEITOR',null,4);");
assert.equal(bulk.run("current.counts.find(r=>r.ean==='001').quantity"),11,'Large quantity adds to an existing EAN');
bulk.run("addScan('999',true,'LEITOR',{description:'MEIA TESTE',brand:'MARCA',gender:'UNISSEX',color:'PRETO',size:'U',subgroup:'MEIA'},2);");
assert.equal(bulk.run("current.counts.find(r=>r.ean==='999').subgroup"),'MEIA','Unknown EAN retains its required subgroup for count/export');
bulk.run("current.counts.push({ean:'998',quantity:2,description:'PRODUTO INEXISTENTE',brand:'',gender:'',color:'',size:'',subgroup:'PENDENTE DE CLASSIFICAÇÃO',unknown:true});$('#ean-input').value='998';scan('LEITOR');");
assert.equal(bulk.run("current.counts.find(r=>r.ean==='998').quantity"),3,'Repeated unknown EAN adds quantity using the existing row');
assert.equal(bulk.$('#unknown-dialog').open,false,'Repeated unknown EAN does not ask for product details again');
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

const unknown=device();unknown.run("user={id:'u',store:'APAR',allStores:false};auth={access_token:'test'};catalogComplete=true;catalog=new Map();current={id:'unknown',label:'APAR TESTE',store:'APAR',kind:'CONTAGEM',date:'2026-10-23',collaborative:false,participantId:'p',participantVersion:0,responsible:'Maria',status:'EM ANDAMENTO',counts:[],defects:[],peers:{counts:[],defects:[]},version:0};$('#ean-input').value='1234567890123';");
await unknown.run("scan('LEITOR')");assert.equal(unknown.$('#unknown-dialog').open,true,'First unknown EAN scan opens the identification form');
assert.match(html,/<label for="unknown-subgroup">SUBGRUPO<\/label><input id="unknown-subgroup" required/,'Unknown EAN form requires subgroup');
unknown.run("addScan(unknown,true,'LEITOR',{description:'MODELO TESTE',brand:'MARCA TESTE',gender:'UNISSEX',color:'PRETO',size:'M',subgroup:'MEIA'},1);$('#unknown-dialog').close();unknown=null;$('#ean-input').value='1234567890123';");
await unknown.run("scan('LEITOR')");assert.equal(unknown.$('#unknown-dialog').open,false,'Repeat scan does not reopen the identification form');
assert.equal(unknown.run("current.counts[0].quantity"),2,'Repeat unknown EAN scan adds one unit to the existing EAN');
assert.equal(unknown.run("current.counts[0].subgroup"),'MEIA','The required subgroup stays on the row');
unknown.run("mode='defects';$('#ean-input').value='1234567890123';");await unknown.run("scan('LEITOR')");
assert.equal(unknown.run("current.defects[0].subgroup"),'MEIA','Defect launch reuses the registered unknown EAN subgroup');
console.log('PASS: unknown EAN requires subgroup once, repeats sum by EAN, and defect rows preserve subgroup');

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
