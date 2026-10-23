import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
class Sheet{
 constructor(name){this.name=name;this.cells=[];this.columns=26;this.rows=1000;}
 getName(){return this.name;}getSheetId(){return this.id??(this.id=++seq);}setName(name){sheets.delete(this.name);this.name=name;sheets.set(name,this);return this;}getMaxRows(){return this.rows;}getMaxColumns(){return this.columns;}
 insertRowsAfter(_,n){this.rows+=n;}insertColumnsAfter(c,n){this.cells.forEach(row=>{while(row.length<c)row.push('');row.splice(c,0,...Array(n).fill(''));});this.columns+=n;}
 getFrozenRows(){return this.frozenRows||0;}getFrozenColumns(){return this.frozenColumns||0;}
 deleteRows(start,n){assert.ok(this.rows-n>this.getFrozenRows(),'Cannot delete all unfrozen rows');this.cells.splice(start-1,n);this.rows-=n;}
 deleteColumns(start,n){assert.ok(this.columns-n>this.getFrozenColumns(),'Cannot delete all unfrozen columns');this.cells.forEach(row=>row.splice(start-1,n));this.columns-=n;}
 getLastRow(){let n=this.cells.length;while(n&&!this.cells[n-1]?.some(v=>v!==''&&v!=null))n--;return n;}
 getRange(r,c,n,m){
  if(typeof r==='string'){const parts=r.split(':').map(x=>x.match(/^([A-Z]+)(\d+)$/));const a=parts[0],b=parts[1]||a;r=+a[2];c=col(a[1])+1;n=+b[2]-r+1;m=col(b[1])-c+2;}
  n=n||1;m=m||1;assert.ok(r+n-1<=this.rows,'Range exceeds sheet rows');assert.ok(c+m-1<=this.columns,'Range exceeds sheet columns');const sheet=this;
  const range={setValue(v){sheet.cells[r-1]??=[];sheet.cells[r-1][c-1]=v;return range;},getDisplayValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(sheet.cells[r-1+i]?.[c-1+j]??'')));},setValues(values){assert.equal(values.length,n);values.forEach((row,i)=>{assert.equal(row.length,m);sheet.cells[r-1+i]??=[];row.forEach((v,j)=>sheet.cells[r-1+i][c-1+j]=v);});return range;},clearContent(){return range.setValues(Array.from({length:n},()=>Array(m).fill('')));}};
  for(const name of ['setNumberFormat','setFontWeight','setBackground','merge'])range[name]=()=>range;return range;
 }
 appendRow(row){this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);return this;}
 deleteRow(row){this.deleteRows(row,1);}setFrozenRows(n){assert.ok(n<this.rows,'Cannot freeze all visible rows');this.frozenRows=n;}setColumnWidth(){}setColumnWidths(){}hideSheet(){}
}
const sheets=new Map(),ss={getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const s=new Sheet(n);sheets.set(n,s);return s;},deleteSheet:s=>sheets.delete(s.name),getSheets:()=>[...sheets.values()]};
let seq=0;
const ctx=vm.createContext({console,Map,Set,JSON,Number,String,Array,Error,Date,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{flush(){}},Utilities:{formatDate:()=> '2026-10-22',getUuid:()=>`request-id-test-${++seq}`}});
vm.runInContext(fs.readFileSync(new URL('Code.gs',import.meta.url),'utf8'),ctx);
ctx.fixtureDb=ss;vm.runInContext('db_=()=>fixtureDb;catalog_=()=>[["001","Produto A","MARCA","TENIS"],["002","Produto B","MARCA","MEIA"],["003","Produto C","MARCA","CAMISETA"]];',ctx);
const meta=ss.insertSheet('_Contagens');meta.appendRow(['ID','LOJA','DATA','TITULO','STATUS','REVISAO','ABA','CRIADO_POR','CRIADO_EM','ATUALIZADO_EM','ULTIMA_REQUISICAO','TIPO','CONTAGEM_ORIGEM','REQUISICAO_CRIACAO']);
meta.appendRow(['source','APAR','2026-10-21','APAR-21-10-2026','FINALIZADA',2,'original','admin','2026-10-21T10:00:00Z','2026-10-21T10:00:00Z','','CONTAGEM','','']);ss.insertSheet('original');
const call=input=>{ctx.input=input;return vm.runInContext('route_(input)',ctx);};
const original=vm.runInContext('metadata_()[0]',ctx);ctx.original=original;vm.runInContext('writeState_(original,[{ean:"001",quantity:8,description:"A",brand:"MARCA"},{ean:"002",quantity:5,description:"B",brand:"MARCA"}],[{ean:"001",quantity:1,description:"A",brand:"MARCA"}])',ctx);
vm.runInContext('migrateCountNames()',ctx);assert.equal(call({action:'read',id:'source',allStores:true}).label,'APAR-21-10-2026 #1');
assert.equal(vm.runInContext("nextCountNumber_(metadata_(),'APAR','2026-10-21')",ctx),2);
const request={action:'requestRecount',id:'source',eans:['001','003','001'],requestId:'idempotent-request-123',allStores:true,userId:'admin'};
assert.throws(()=>call({...request,allStores:false}),/administradores/);
const created=call(request);assert.equal(created.kind,'RECONTAGEM');assert.match(created.label,/#1 RECONTAGEM #1$/);assert.equal(created.store,'APAR');assert.equal(call(request).id,created.id);assert.equal(sheets.size,3);
assert.throws(()=>call({...request,requestId:'different-request-123'}),/pendente/);
assert.equal(call({action:'recountInbox',store:'JOIN',allStores:false}).length,0);
assert.equal(call({action:'recountInbox',store:'APAR',allStores:false}).length,1);
assert.throws(()=>call({action:'openRecount',id:created.id,store:'JOIN',allStores:false}),/permissão/);
const pending=call({action:'openRecount',id:created.id,store:'APAR',allStores:false});
assert.equal(pending.counts.length,0);assert.equal(pending.defects.length,0);assert.equal(pending.targets.length,2);assert.ok(pending.targets.every(r=>r.quantity===undefined),'Never show original quantities to a store');
assert.throws(()=>call({action:'importRows',id:created.id,store:'APAR',allStores:false,version:0,kind:'counts',rows:[{ean:'002',quantity:1}],requestId:'recount-import-123456'}),/solicitação/,'TXT imports into a recount must stay within requested EANs');
const save={action:'save',id:created.id,store:'APAR',allStores:false,version:0,requestId:'save-1',counts:[{ean:'001',quantity:3}],defects:[{ean:'001',quantity:2}],zeroEans:[]};
assert.throws(()=>call({...save,counts:[{ean:'002',quantity:1}]}),/solicitação/);
assert.throws(()=>call({...save,zeroEans:['001']}),/bipado/);
assert.throws(()=>call({...save,action:'finish'}),/cada EAN/);
const saved=call({...save,zeroEans:['003']});assert.equal(saved.version,1);assert.equal(saved.zeroEans[0],'003');const recountSheet=sheets.get(created.sheet);assert.equal(recountSheet.getMaxColumns(),22,'Saving a recount must preserve its requested-EAN columns');assert.deepEqual(recountSheet.getRange(5,19,2,1).getDisplayValues().map(r=>r[0]),['001','003'],'Saving a recount must preserve its target list');
assert.throws(()=>call({...save,requestId:'stale-save'}),/CONFLICT/);
const finished=call({...save,action:'finish',version:1,requestId:'finish-1',zeroEans:['003']});assert.equal(finished.status,'FINALIZADA');
const updated=call({action:'read',id:'source',allStores:true});assert.equal(updated.counts.find(r=>r.ean==='001').quantity,3);assert.equal(updated.counts.find(r=>r.ean==='002').quantity,5);assert.equal(updated.defects[0].quantity,2);assert.equal(updated.version,3);
const analysis=call({action:'analysis',allStores:true,startDate:'2026-10-01',endDate:'2026-10-31'});assert.equal(analysis.total,1);assert.equal(analysis.data.length,1,'Recounts must not be treated as a whole new store inventory');
assert.equal(call({action:'recountInbox',store:'APAR'}).length,0);
assert.throws(()=>call({action:'openRecount',id:created.id,store:'APAR'}),/indisponível/);
call({action:'delete',id:'source',allStores:true});assert.equal(sheets.size,1);assert.equal(meta.getLastRow(),1);
const createdCount=call({action:'create',store:'APAR',date:'2026-10-22',userId:'store'});assert.match(createdCount.label,/#1$/);assert.equal(sheets.get(createdCount.sheet).getMaxRows(),5,'Unused blank rows should not consume the spreadsheet cell budget');
const importBase={action:'importRows',id:createdCount.id,store:'APAR',allStores:false,version:0,kind:'counts',rows:[{ean:'001',quantity:4},{ean:'999',quantity:2}],requestId:'import-request-123456'};
const needsConfirmation=call(importBase);assert.equal(needsConfirmation.requiresConfirmation,true);assert.deepEqual(needsConfirmation.unknown,['999']);
const imported=call({...importBase,includeUnknown:true});assert.equal(imported.version,1);assert.equal(imported.counts.length,2);assert.equal(imported.counts[0].quantity,4);assert.equal(imported.counts[1].unknown,true);
const blank=call({action:'create',store:'JOIN',date:'2026-10-22',userId:'store'});const removed=call({action:'finish',id:blank.id,store:'JOIN',allStores:false,version:0,requestId:'finish-empty-123456',counts:[],defects:[],zeroEans:[]});assert.equal(removed.empty,true);assert.equal(sheets.has(blank.sheet),false,'Finishing with no products should delete the tab');
meta.appendRow(['deleted','JOIN','2026-10-21','JOIN-21-10-2026 #1','FINALIZADA',0,'deleted-tab','admin','2026-10-21T10:00:00Z','2026-10-21T10:00:00Z','','CONTAGEM','','']);meta.appendRow(['orphan','JOIN','2026-10-21','JOIN recount','EM ANDAMENTO',0,'orphan-tab','admin','2026-10-21T10:00:00Z','2026-10-21T10:00:00Z','','RECONTAGEM','deleted','']);ss.insertSheet('orphan-tab');
const visible=call({action:'list',allStores:true});assert.equal(visible.some(m=>m.id==='deleted'||m.id==='orphan'),false,'Manually deleted sheets and dependent recounts disappear from the Hub');assert.equal(vm.runInContext('reconcileDeletedCounts()',ctx),2);assert.equal(meta.getLastRow(),2);assert.equal(sheets.has(createdCount.sheet),true);assert.equal(sheets.size,2);
console.log('Verified: store-scoped recount inbox, no original quantities, EAN deduplication, idempotent requests, pending-only access, target validation, explicit zero, version conflicts, targeted merge, independent audit, history deletion cascade.');


assert.equal(vm.runInContext("verifyInventoryRuntime().length",ctx),8);
assert.equal(sheets.size,2,"Runtime test must leave existing counts intact and remove its QA sheets");


// Compatibility migration inserts adjacent columns and preserves every existing quantity/time.
const legacy=ss.insertSheet('legacy-subgroup-test');legacy.columns=15;
legacy.getRange(4,1,1,15).setValues([['EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','EAN,QNTD']]);
legacy.getRange(5,1,1,15).setValues([['001',4,'Produto A','MARCA','NÃO','2026-10-23T12:00:00Z','002',2,'Produto B','MARCA','NÃO','2026-10-23T13:00:00Z','002',2,'002,2']]);
ctx.legacyMeta={id:'legacy',sheet:'legacy-subgroup-test',kind:'CONTAGEM'};
const before=vm.runInContext('state_(legacyMeta)',ctx);assert.equal(before.counts[0].subgroup,'TENIS');assert.equal(before.defects[0].subgroup,'MEIA');
ctx.legacyState=before;vm.runInContext('writeState_(legacyMeta,legacyState.counts,legacyState.defects,legacyState)',ctx);
const after=vm.runInContext('state_(legacyMeta)',ctx);assert.equal(after.counts[0].quantity,4);assert.equal(after.defects[0].quantity,2);assert.equal(after.counts[0].lastScannedAt,before.counts[0].lastScannedAt);assert.equal(legacy.getRange('E5').getDisplayValues()[0][0],'TENIS');assert.equal(legacy.getRange('L5').getDisplayValues()[0][0],'MEIA');assert.equal(legacy.getRange('O5').getDisplayValues()[0][0],'002');ss.deleteSheet(legacy);
console.log('PASS: subgroup enrichment, adjacent spreadsheet columns, legacy migration, timestamps and import schema preserved');
