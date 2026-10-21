/* Execute setup() once, then deploy as a Web App running as the owner.
   Set BRIDGE_SECRET in Script Properties; never put it in the public website. */
function config_(name) {
  const value=PropertiesService.getScriptProperties().getProperty(name);
  if(!value)throw new Error('Configuração ausente: '+name);
  return value;
}
const META_HEADERS = ['ID','LOJA','DATA','TITULO','STATUS','REVISAO','ABA','CRIADO_POR','CRIADO_EM','ATUALIZADO_EM','ULTIMA_REQUISICAO'];

function doPost(e) {
  try {
    const input = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if (!expected || !input.secret || input.secret !== expected) throw new Error('Acesso negado.');
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { return json_({ok:true,data:route_(input)}); }
    finally { lock.releaseLock(); }
  } catch (error) { return json_({ok:false,error:String(error.message || error)}); }
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function db_() { return SpreadsheetApp.openById(config_('COUNT_FILE_ID')); }
function setup() {
  const ss=db_();
  let meta=ss.getSheetByName('_Contagens');
  if(!meta){meta=ss.insertSheet('_Contagens');meta.getRange(1,1,1,META_HEADERS.length).setValues([META_HEADERS]);meta.setFrozenRows(1);meta.hideSheet();}
  let home=ss.getSheetByName('INÍCIO');
  if(!home){home=ss.getSheets().find(s=>s.getName()==='Página1')||ss.insertSheet('INÍCIO');home.setName('INÍCIO');}
  home.getRange('A1:B5').setValues([
    ['CONTAGEM DE ESTOQUE','TENNIS PLACE'],
    ['Uso','As lojas fazem a bipagem pelo Hub.'],
    ['Abas','Cada contagem cria uma aba LOJA-data.'],
    ['Tabelas','Contagem, Defeitos e Importação ficam na mesma aba.'],
    ['Análise','Acesso pelo Hub para os responsáveis autorizados.']
  ]);
  home.getRange('A1:B1').setFontWeight('bold').setBackground('#ffda28');
  home.setColumnWidth(1,180);home.setColumnWidth(2,540);home.getRange('A1:B5').setWrap(true);
  ss.setSpreadsheetTimeZone('America/Sao_Paulo');
}
function metadata_() {
  const sheet=db_().getSheetByName('_Contagens');
  if(!sheet)throw new Error('Execute a configuração inicial.');
  if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,META_HEADERS.length).getDisplayValues().map((r,i)=>({
    row:i+2,id:r[0],store:r[1],date:r[2],label:r[3],status:r[4],version:Number(r[5]),sheet:r[6],
    createdBy:r[7],createdAt:r[8],updatedAt:r[9],requestId:r[10]
  }));
}
function permitted_(meta,p){if(!meta || (!p.allStores&&meta.store!==p.store))throw new Error('Contagem sem permissão.');return meta;}
function publicMeta_(m){const result=Object.assign({},m,{lastRequestId:m.requestId});delete result.row;delete result.requestId;delete result.createdBy;return result;}
function catalog_(){
  const cache=CacheService.getScriptCache(),key='tp-stock-catalog-v1';
  const info=cache.get(key);
  if(info){
    try{const keys=JSON.parse(info),parts=cache.getAll(keys);if(keys.every(k=>parts[k]))return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(keys.map(k=>parts[k]).join('')))).getDataAsString('UTF-8'));}catch(_){}
  }
  const sheet=SpreadsheetApp.openById(config_('PRODUCT_FILE_ID')).getSheetByName('Sheet0');
  if(!sheet)throw new Error('A aba Sheet0 do cadastro não foi encontrada.');
  const rows=sheet.getLastRow()>1?sheet.getRange(2,4,sheet.getLastRow()-1,3).getDisplayValues():[];
  const products=rows.filter(r=>/^\d+$/.test(String(r[0]).trim())).map(r=>[String(r[0]).trim(),r[1],r[2]]);
  const packed=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(products),'application/json')).getBytes());
  const generation=String(Date.now()),keys=[],parts={};
  for(let i=0;i<packed.length;i+=70000){const k=key+'-'+generation+'-'+i;keys.push(k);parts[k]=packed.slice(i,i+70000);}
  cache.putAll(parts,300);cache.put(key,JSON.stringify(keys),300);
  return products;
}
function state_(meta){
  const sheet=db_().getSheetByName(meta.sheet);
  if(!sheet)throw new Error('A aba desta contagem não foi encontrada.');
  const last=sheet.getLastRow();
  const values=last>=5?sheet.getRange(5,1,last-4,11).getDisplayValues():[];
  const parse=(offset)=>values.filter(r=>r[offset]&&Number(r[offset+1])>0).map(r=>({
    ean:String(r[offset]),quantity:Number(r[offset+1]),description:r[offset+2],brand:r[offset+3],unknown:r[offset+4]==='SIM'
  }));
  return Object.assign(publicMeta_(meta),{counts:parse(0),defects:parse(6)});
}
function normalizeRows_(rows,products){
  if(!Array.isArray(rows)||rows.length>40000)throw new Error('Quantidade de linhas inválida.');
  const result=new Map();
  rows.forEach(r=>{
    const ean=String(r.ean||'').trim(),quantity=Number(r.quantity);
    if(!/^\d{1,30}$/.test(ean)||!Number.isInteger(quantity)||quantity<1||quantity>1000000)throw new Error('EAN ou quantidade inválida.');
    const product=products.get(ean);
    if(!product&&!r.unknown)throw new Error('Produto inexistente: '+ean);
    const item=result.get(ean)||{ean,quantity:0,description:product?product[1]:'PRODUTO INEXISTENTE',brand:product?product[2]:'NÃO CADASTRADA',unknown:!product};
    item.quantity+=quantity;result.set(ean,item);
  });
  return Array.from(result.values());
}
function writeState_(meta,counts,defects){
  const sheet=db_().getSheetByName(meta.sheet);
  const combined=defects.concat(counts);
  const size=Math.max(counts.length,defects.length,combined.length,1);
  if(sheet.getMaxRows()<size+4)sheet.insertRowsAfter(sheet.getMaxRows(),size+4-sheet.getMaxRows());
  const last=sheet.getLastRow();
  if(last>=5)sheet.getRange(5,1,last-4,15).clearContent();
  const matrix=Array.from({length:size},()=>Array(15).fill(''));
  const fill=(list,col)=>list.forEach((r,i)=>{matrix[i][col]=r.ean;matrix[i][col+1]=r.quantity;matrix[i][col+2]=r.description;matrix[i][col+3]=r.brand;matrix[i][col+4]=r.unknown?'SIM':'NÃO';});
  fill(counts,0);fill(defects,6);
  combined.forEach((r,i)=>{matrix[i][12]=r.ean;matrix[i][13]=r.quantity;matrix[i][14]=r.ean+','+r.quantity;});
  sheet.getRange(5,1,size,15).setNumberFormat('@').setValues(matrix);
  sheet.getRange(5,2,size,1).setNumberFormat('0');sheet.getRange(5,8,size,1).setNumberFormat('0');sheet.getRange(5,14,size,1).setNumberFormat('0');
  SpreadsheetApp.flush();
}
function countDate_(value,now){
  const date=value||Utilities.formatDate(now,'America/Sao_Paulo','yyyy-MM-dd');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number(date.slice(0,4))<1900)throw new Error('Data da contagem inválida.');
  const parsed=new Date(date+'T12:00:00Z');
  if(isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('Data da contagem inválida.');
  return date;
}
function route_(p){
  if(p.action==='catalog'){const products=catalog_();if(p.ean)return products.find(r=>r[0]===String(p.ean).trim())||null;return products;}
  let list=metadata_();
  if(p.action==='list')return list.filter(m=>p.allStores||m.store===p.store).map(publicMeta_);
  if(p.action==='create'){
    if(!/^[A-Z0-9]{2,24}$/.test(p.store))throw new Error('Loja inválida.');
    const now=new Date(),date=countDate_(p.date,now);
    const base=p.store+'-'+date.slice(8,10)+'-'+date.slice(5,7)+'-'+date.slice(0,4);
    let label=base,n=2;while(db_().getSheetByName(label))label=base+'-'+n++;
    const sheet=db_().insertSheet(label),meta={id:Utilities.getUuid(),store:p.store,date,label,status:'EM ANDAMENTO',version:0,sheet:label,createdBy:p.userId,createdAt:now.toISOString(),updatedAt:now.toISOString(),requestId:''};
    sheet.getRange('A1:B2').setValues([['LOJA',p.store],['DATA',date]]);
    sheet.getRange('A3:E3').merge().setValue('CONTAGEM');sheet.getRange('G3:K3').merge().setValue('DEFEITOS');sheet.getRange('M3:O3').merge().setValue('IMPORTAÇÃO — DEFEITOS PRIMEIRO');
    sheet.getRange(4,1,1,15).setValues([['EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','','EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','','EAN','QNTD','EAN,QNTD']]);
    sheet.getRange('A3:O4').setBackground('#eeeeee').setFontWeight('bold');sheet.setFrozenRows(4);
    sheet.setColumnWidths(1,15,140);sheet.setColumnWidth(3,360);sheet.setColumnWidth(9,360);sheet.setColumnWidth(15,220);
    db_().getSheetByName('_Contagens').appendRow([meta.id,meta.store,meta.date,meta.label,meta.status,0,meta.sheet,meta.createdBy,meta.createdAt,meta.updatedAt,'']);
    return state_(meta);
  }
  if(p.action==='analysis'){
    if(!p.allStores)throw new Error('Análise não autorizada.');
    const selected=list.filter(m=>m.status==='FINALIZADA'&&(!p.filterStore||m.store===p.filterStore)&&(!p.startDate||m.date>=p.startDate)&&(!p.endDate||m.date<=p.endDate));
    return selected.map(m=>state_(m));
  }
  const meta=permitted_(list.find(m=>m.id===p.id),p);
  if(p.action==='read')return state_(meta);
  if(!['save','finish'].includes(p.action))throw new Error('Ação inválida.');
  if(p.requestId&&meta.requestId===p.requestId)return state_(meta);
  if(meta.status==='FINALIZADA')throw new Error('Contagem finalizada. Abra uma nova contagem.');
  if(Number(p.version)!==meta.version)throw new Error('CONFLICT: Esta contagem foi alterada em outro acesso. Reabra a contagem antes de continuar.');
  const products=new Map(catalog_().map(r=>[r[0],r]));
  const counts=normalizeRows_(p.counts,products),defects=normalizeRows_(p.defects,products);
  writeState_(meta,counts,defects);
  meta.version++;meta.updatedAt=new Date().toISOString();meta.requestId=String(p.requestId||'');if(p.action==='finish')meta.status='FINALIZADA';
  db_().getSheetByName('_Contagens').getRange(meta.row,5,1,7).setValues([[meta.status,meta.version,meta.sheet,meta.createdBy,meta.createdAt,meta.updatedAt,meta.requestId]]);
  return Object.assign(publicMeta_(meta),{counts,defects});
}
