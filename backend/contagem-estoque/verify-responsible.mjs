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

const meta=ss.insertSheet('_Contagens');meta.appendRow(['ID','LOJA','DATA','TITULO','STATUS','REVISAO','ABA','CRIADO_POR','CRIADO_EM','ATUALIZADO_EM','ULTIMA_REQUISICAO','TIPO']);
meta.appendRow(['source','APAR','2026-10-21','APAR #1','FINALIZADA',2,'original','admin','','','','CONTAGEM']);
const tab=ss.insertSheet('original');tab.columns=17;tab.getRange(4,1,1,17).setValues([['EAN','QNTD','PRODUTO','MARCA','SUBGRUPO','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','PRODUTO','MARCA','SUBGRUPO','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','EAN,QNTD']]);
tab.getRange(5,1,1,17).setValues([['001',5,'Produto','Marca','TENIS','NÃO','2026-10-21','002',2,'Meia','Marca','MEIA','NÃO','2026-10-21','002',2,'002,2']]);
const call=input=>{ctx.input=input;return vm.runInContext('route_(input)',ctx);};
assert.equal(call({action:'read',id:'source',allStores:true}).responsibleColumns,false);
const update={action:'syncAttribution',id:'source',allStores:true,version:2,counts:[{ean:'001',quantity:999,responsibleBreakdown:[{responsible:'Maria',quantity:3},{responsible:'João',quantity:2}]},{ean:'003',quantity:10,responsible:'Intruso'}],defects:[{ean:'002',responsible:'Maria (2)'}]};
assert.throws(()=>call({...update,allStores:false,store:'APAR'}),/administradores/);
assert.throws(()=>call({...update,version:1}),/CONFLICT/);
const result=call(update);assert.equal(result.version,2);assert.equal(result.status,'FINALIZADA');assert.equal(result.counts.length,1);assert.equal(result.counts[0].quantity,5);assert.equal(result.counts[0].ean,'001');assert.equal(result.counts[0].responsible,'Maria (3); João (2)');assert.equal(result.defects[0].quantity,2);assert.equal(tab.columns,19);assert.equal(tab.getRange('H4').getDisplayValues()[0][0],'RESPONSAVEL');assert.equal(tab.getRange('P4').getDisplayValues()[0][0],'RESPONSAVEL');assert.equal(tab.getRange('S5').getDisplayValues()[0][0],'002,2');
call(update);assert.equal(tab.columns,19,'Migration must be idempotent');
const normalized=ctx.normalizeRows_([{ean:'001',quantity:5,responsibleBreakdown:update.counts[0].responsibleBreakdown}],new Map([['001',['001','Produto','Marca','TENIS']]]));assert.equal(normalized[0].responsible,'Maria (3); João (2)');
const rec=ss.insertSheet('recount');rec.columns=22;rec.getRange(4,1,1,17).setValues([['EAN','QNTD','PRODUTO','MARCA','SUBGRUPO','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','PRODUTO','MARCA','SUBGRUPO','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','EAN,QNTD']]);rec.getRange('S4:V5').setValues([['EAN SOLICITADO','PRODUTO','MARCA','NÃO LOCALIZADO'],['003','Camiseta','Marca','SIM']]);ctx.recount={id:'rec',sheet:'recount',kind:'RECONTAGEM'};
vm.runInContext('writeState_(recount,[],[])',ctx);assert.equal(rec.columns,24);assert.equal(rec.getRange('U5').getDisplayValues()[0][0],'003');assert.equal(rec.getRange('X5').getDisplayValues()[0][0],'SIM');vm.runInContext('writeRecountZeros_(recount,[])',ctx);assert.equal(rec.getRange('X5').getDisplayValues()[0][0],'NÃO');
const created=call({action:'create',allStores:true,store:'APAR',date:'2026-10-26',userId:'admin'});const empty=call({action:'finish',id:created.id,allStores:true,version:0,counts:[],defects:[],requestId:'empty-finish-test'});assert.equal(empty.status,'FINALIZADA');assert.ok(sheets.has(created.sheet),'Empty finish must keep the sheet');
console.log('PASS: responsibility columns, same-EAN attribution, finalized CAS, permission guard, quantities preserved, recount targets, idempotent migration and empty finish');
