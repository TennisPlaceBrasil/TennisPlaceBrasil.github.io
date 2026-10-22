/* Execute setup() once, then deploy as a Web App running as the owner.
   Set BRIDGE_SECRET in Script Properties; never put it in the public website. */
function config_(name) {
  const value=PropertiesService.getScriptProperties().getProperty(name);
  if(!value)throw new Error('Configuração ausente: '+name);
  return value;
}
const META_HEADERS = ['ID','LOJA','DATA','TITULO','STATUS','REVISAO','ABA','CRIADO_POR','CRIADO_EM','ATUALIZADO_EM','ULTIMA_REQUISICAO','TIPO','CONTAGEM_ORIGEM','REQUISICAO_CRIACAO','IP_SESSAO','DISPOSITIVO','SESSAO_ID'];

function doPost(e) {
  try {
    const input = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if (!expected || !input.secret || input.secret !== expected) throw new Error('Acesso negado.');
    if(['catalog','list','recountInbox','checkCount','analysis'].includes(input.action))return json_({ok:true,data:route_(input)});
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
  if(!meta){meta=ss.insertSheet('_Contagens');meta.setFrozenRows(1);meta.hideSheet();}
  ensureMetaColumns_(meta);
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
  const ss=db_(),sheet=ss.getSheetByName('_Contagens');
  if(!sheet)throw new Error('Execute a configuração inicial.');
  ensureMetaColumns_(sheet);
  if(sheet.getLastRow()<2)return [];
  const list=sheet.getRange(2,1,sheet.getLastRow()-1,META_HEADERS.length).getDisplayValues().map((r,i)=>({
    row:i+2,id:r[0],store:r[1],date:r[2],label:r[3],status:r[4],version:Number(r[5]),sheet:r[6],
    createdBy:r[7],createdAt:r[8],updatedAt:r[9],requestId:r[10],kind:r[11]||'CONTAGEM',sourceId:r[12]||'',createdRequestId:r[13]||'',ip:r[14]||'Não registrado',device:r[15]||'Não registrado',sessionId:r[16]||''
  }));
  const tabs=new Set(ss.getSheets().map(s=>s.getName())),sources=new Set(list.filter(m=>m.kind!=='RECONTAGEM'&&tabs.has(m.sheet)).map(m=>m.id));
  // Deleting a tab manually must immediately remove it from all app results.
  return list.filter(m=>tabs.has(m.sheet)&&(m.kind!=='RECONTAGEM'||sources.has(m.sourceId)));
}
function reconcileDeletedCounts(){
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const ss=db_(),sheet=ss.getSheetByName('_Contagens');if(!sheet||sheet.getLastRow()<2)return 0;
    const rows=sheet.getRange(2,1,sheet.getLastRow()-1,META_HEADERS.length).getDisplayValues(),tabs=new Set(ss.getSheets().map(s=>s.getName())),sourceIds=new Set(rows.filter(r=>r[11]!=='RECONTAGEM'&&tabs.has(r[6])).map(r=>r[0]));
    const stale=rows.map((r,i)=>({r,row:i+2})).filter(({r})=>!tabs.has(r[6])||(r[11]==='RECONTAGEM'&&!sourceIds.has(r[12])));
    stale.sort((a,b)=>b.row-a.row).forEach(({r,row})=>{if(r[11]==='RECONTAGEM'){const tab=ss.getSheetByName(r[6]);if(tab)ss.deleteSheet(tab);}sheet.deleteRow(row);});
    SpreadsheetApp.flush();console.log('Referências removidas: '+stale.length);return stale.length;
  }finally{lock.releaseLock();}
}
function ensureMetaColumns_(sheet){if(sheet.getMaxColumns()<META_HEADERS.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),META_HEADERS.length-sheet.getMaxColumns());sheet.getRange(1,1,1,META_HEADERS.length).setValues([META_HEADERS]);}
function sessionAudit_(value){const audit=value&&typeof value==='object'?value:{};const ip=String(audit.ip||'IP não capturado').trim().slice(0,80),device=String(audit.device||'Dispositivo não identificado').trim().slice(0,100),id=String(audit.id||'').trim().slice(0,80);return {ip,device,sessionId:id};}
function saveMeta_(meta){db_().getSheetByName('_Contagens').getRange(meta.row,5,1,13).setValues([[meta.status,meta.version,meta.sheet,meta.createdBy,meta.createdAt,meta.updatedAt,meta.requestId,meta.kind||'CONTAGEM',meta.sourceId||'',meta.createdRequestId||'',meta.ip||'Não registrado',meta.device||'Não registrado',meta.sessionId||'']]);}
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
function state_(meta,spreadsheet){
  const sheet=(spreadsheet||db_()).getSheetByName(meta.sheet);
  if(!sheet)throw new Error('A aba desta contagem não foi encontrada.');
  const last=sheet.getLastRow();
  const values=last>=5?sheet.getRange(5,1,last-4,12).getDisplayValues():[];
  const parse=(offset)=>values.filter(r=>r[offset]&&Number(r[offset+1])>0).map(r=>({
    ean:String(r[offset]),quantity:Number(r[offset+1]),description:r[offset+2],brand:r[offset+3],unknown:r[offset+4]==='SIM',lastScannedAt:r[offset+5]||''
  }));
  const result=Object.assign(publicMeta_(meta),{counts:parse(0),defects:parse(6)});
  if(meta.kind==='RECONTAGEM'){const rows=last>=5?sheet.getRange(5,17,last-4,4).getDisplayValues():[];result.targets=rows.filter(r=>r[0]).map(r=>({ean:r[0],description:r[1],brand:r[2]}));result.zeroEans=rows.filter(r=>r[0]&&r[3]==='SIM').map(r=>r[0]);}
  return result;
}
function normalizeRows_(rows,products){
  if(!Array.isArray(rows)||rows.length>40000)throw new Error('Quantidade de linhas inválida.');
  const result=new Map();
  rows.forEach(r=>{
    const ean=String(r.ean||'').trim(),quantity=Number(r.quantity);
    if(!/^\d{1,30}$/.test(ean)||!Number.isInteger(quantity)||quantity<1||quantity>1000000)throw new Error('EAN ou quantidade inválida.');
    const product=products.get(ean);
    if(!product&&!r.unknown)throw new Error('Produto inexistente: '+ean);
    const inputTime=String(r.lastScannedAt||'').trim(),inputMs=Date.parse(inputTime),safeTime=inputTime&&!isNaN(inputMs)?new Date(inputMs).toISOString():'';
    const item=result.get(ean)||{ean,quantity:0,description:product?product[1]:'PRODUTO INEXISTENTE',brand:product?product[2]:'NÃO CADASTRADA',unknown:!product,lastScannedAt:safeTime};
    item.quantity+=quantity;if(Date.parse(safeTime)>Date.parse(item.lastScannedAt||0))item.lastScannedAt=safeTime;result.set(ean,item);
  });
  return Array.from(result.values());
}
function mergeRows_(existing,incoming){
  const rows=existing.map(r=>Object.assign({},r)),byEan=new Map(rows.map((r,i)=>[r.ean,i]));
  incoming.forEach(r=>{const i=byEan.get(r.ean);if(i===undefined){byEan.set(r.ean,rows.length);rows.push(Object.assign({},r));}else{const quantity=rows[i].quantity+r.quantity;if(quantity>1000000)throw new Error('A quantidade total do EAN '+r.ean+' ultrapassa 1.000.000.');rows[i].quantity=quantity;rows[i].lastScannedAt=r.lastScannedAt||rows[i].lastScannedAt;}});
  return rows;
}
function deleteEmptyCount_(meta,list){
  if(meta.kind==='RECONTAGEM')throw new Error('Uma recontagem não pode ser removida como vazia.');
  const sheet=db_().getSheetByName(meta.sheet),counts=sheet&&sheet.getLastRow()>=5?sheet.getRange(5,1,sheet.getLastRow()-4,2).getDisplayValues().some(r=>r[0]&&Number(r[1])>0):false,defects=sheet&&sheet.getLastRow()>=5?sheet.getRange(5,7,sheet.getLastRow()-4,2).getDisplayValues().some(r=>r[0]&&Number(r[1])>0):false;
  if(counts||defects)throw new Error('Esta contagem já possui produtos.');
  const ss=db_(),metadata=ss.getSheetByName('_Contagens');if(sheet)ss.deleteSheet(sheet);metadata.deleteRow(meta.row);SpreadsheetApp.flush();return {id:meta.id,label:meta.label,deleted:true,empty:true};
}
function cleanupAbandonedEmpty_(list,store){
  const cutoff=Date.now()-12*60*60*1000,stale=list.filter(m=>m.kind!=='RECONTAGEM'&&m.store===store&&m.status!=='FINALIZADA'&&Date.parse(m.updatedAt||m.createdAt)<cutoff);
  stale.sort((a,b)=>b.row-a.row).forEach(m=>{const sheet=db_().getSheetByName(m.sheet);if(sheet&&sheet.getLastRow()>=5){const values=sheet.getRange(5,1,sheet.getLastRow()-4,8).getDisplayValues();if(values.some(r=>(r[0]&&Number(r[1])>0)||(r[6]&&Number(r[7])>0)))return;}const ss=db_(),tab=ss.getSheetByName(m.sheet),meta=ss.getSheetByName('_Contagens');if(tab)ss.deleteSheet(tab);meta.deleteRow(m.row);});
}
function writeState_(meta,counts,defects,previous){
  const sheet=db_().getSheetByName(meta.sheet),isRecount=meta.kind==='RECONTAGEM';
  previous=previous||state_(meta);
  const combined=defects.concat(counts);
  const size=Math.max(counts.length,defects.length,combined.length,1);
  const oldSize=Math.max((previous.counts||[]).length,(previous.defects||[]).length,1),clearSize=Math.max(size,oldSize);
  if(sheet.getMaxRows()<size+4)sheet.insertRowsAfter(sheet.getMaxRows(),size+4-sheet.getMaxRows());
  if(isRecount&&sheet.getMaxColumns()<20)sheet.insertColumnsAfter(sheet.getMaxColumns(),20-sheet.getMaxColumns());
  sheet.getRange(5,1,clearSize,15).clearContent();
  if(!isRecount){if(sheet.getMaxRows()>size+4)sheet.setMaxRows(size+4);if(sheet.getMaxColumns()>15)sheet.setMaxColumns(15);}
  const matrix=Array.from({length:size},()=>Array(15).fill(''));
  const fill=(list,col)=>list.forEach((r,i)=>{matrix[i][col]=r.ean;matrix[i][col+1]=r.quantity;matrix[i][col+2]=r.description;matrix[i][col+3]=r.brand;matrix[i][col+4]=r.unknown?'SIM':'NÃO';matrix[i][col+5]=r.lastScannedAt||'';});
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
  if(p.action==='checkCount')return {exists:list.some(m=>m.id===p.id&&(p.allStores||m.store===p.store))};
  if(p.action==='discardEmpty'){
    const meta=permitted_(list.find(m=>m.id===p.id),p);
    if(meta.status==='FINALIZADA')throw new Error('Contagem finalizada não pode ser removida como vazia.');
    return deleteEmptyCount_(meta,list);
  }
  if(p.action==='recountInbox')return list.filter(m=>m.kind==='RECONTAGEM'&&m.status!=='FINALIZADA'&&(p.allStores||m.store===p.store)&&list.some(source=>source.id===m.sourceId&&source.store===m.store)).map(publicMeta_);
  if(p.action==='requestRecount')return requestRecount_(p,list);
  if(p.action==='list'){
    if(!p.allStores)throw new Error('Histórico restrito aos administradores.');
    return list.map(publicMeta_);
  }
  if(p.action==='delete'){
    if(!p.allStores)throw new Error('Exclusão restrita aos administradores.');
    const meta=list.find(m=>m.id===p.id);
    if(!meta)throw new Error('Esta contagem já não existe no histórico.');
    const ss=db_(),metadata=ss.getSheetByName('_Contagens');
    list.filter(m=>m.id===meta.id||m.sourceId===meta.id).sort((a,b)=>b.row-a.row).forEach(m=>{const tab=ss.getSheetByName(m.sheet);if(tab)ss.deleteSheet(tab);metadata.deleteRow(m.row);});
    SpreadsheetApp.flush();
    return {id:meta.id,deleted:true};
  }
  if(p.action==='read'&&!p.allStores)throw new Error('Histórico restrito aos administradores.');
  if(p.action==='create'){
    if(!/^[A-Z0-9]{2,24}$/.test(p.store))throw new Error('Loja inválida.');
    cleanupAbandonedEmpty_(list,p.store);list=metadata_();
    const now=new Date(),date=countDate_(p.date,now);
    let number=nextCountNumber_(list,p.store,date),label=countLabel_(p.store,date,number);
    while(db_().getSheetByName(label))label=countLabel_(p.store,date,++number);
    const sheet=db_().insertSheet(label),meta={id:Utilities.getUuid(),store:p.store,date,label,status:'EM ANDAMENTO',version:0,sheet:label,createdBy:p.userId,createdAt:now.toISOString(),updatedAt:now.toISOString(),requestId:'',...sessionAudit_(p.auditSession)};sheet.setMaxRows(4);if(sheet.getMaxColumns()>15)sheet.setMaxColumns(15);
    sheet.getRange('A1:B2').setValues([['LOJA',p.store],['DATA',date]]);
    sheet.getRange('A3:E3').merge().setValue('CONTAGEM');sheet.getRange('G3:K3').merge().setValue('DEFEITOS');sheet.getRange('M3:O3').merge().setValue('IMPORTAÇÃO — DEFEITOS PRIMEIRO');
    sheet.getRange(4,1,1,15).setValues([['EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','ÚLTIMA BIPAGEM','EAN','QNTD','EAN,QNTD']]);
    sheet.getRange('A3:O4').setBackground('#eeeeee').setFontWeight('bold');sheet.setFrozenRows(4);
    sheet.setColumnWidths(1,15,140);sheet.setColumnWidth(3,360);sheet.setColumnWidth(9,360);sheet.setColumnWidth(15,220);
    db_().getSheetByName('_Contagens').appendRow([meta.id,meta.store,meta.date,meta.label,meta.status,0,meta.sheet,meta.createdBy,meta.createdAt,meta.updatedAt,'',meta.kind||'CONTAGEM',meta.sourceId||'',meta.createdRequestId||'',meta.ip,meta.device,meta.sessionId]);
    return state_(meta);
  }
  if(p.action==='analysis'){
    if(!p.allStores)throw new Error('Análise não autorizada.');
    const start=p.startDate||'',end=p.endDate||'';
    if(!start||!end)throw new Error('Informe uma data inicial e final para limitar a análise.');
    countDate_(start,new Date());countDate_(end,new Date());
    if(end<start)throw new Error('A data final deve ser igual ou posterior à inicial.');
    if(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z')>366*86400000)throw new Error('Analise no máximo 12 meses por vez.');
    const selected=list.filter(m=>m.kind!=='RECONTAGEM'&&m.status==='FINALIZADA'&&(!p.filterStore||m.store===p.filterStore)&&(!p.startDate||m.date>=p.startDate)&&(!p.endDate||m.date<=p.endDate));
    const offset=Math.max(0,Number(p.offset)||0),limit=Math.min(40,Math.max(1,Number(p.limit)||40)),ss=db_(),page=selected.slice(offset,offset+limit).map(m=>state_(m,ss));
    return {data:page,total:selected.length,nextOffset:offset+page.length<selected.length?offset+page.length:null};
  }
  const meta=permitted_(list.find(m=>m.id===p.id),p);
  if(p.action==='openRecount'){
    if(meta.kind!=='RECONTAGEM'||(!p.allStores&&meta.status==='FINALIZADA')||!list.some(m=>m.id===meta.sourceId&&m.store===meta.store))throw new Error('Recontagem indisponível.');
    return state_(meta);
  }
  if(p.action==='read')return state_(meta);
  if(!['save','finish','importRows'].includes(p.action))throw new Error('Ação inválida.');
  if(p.requestId&&meta.requestId===p.requestId)return state_(meta);
  if(meta.status==='FINALIZADA')throw new Error('Contagem finalizada. Abra uma nova contagem.');
  if(Number(p.version)!==meta.version)throw new Error('CONFLICT: Esta contagem foi alterada em outro acesso. Reabra a contagem antes de continuar.');
  const products=new Map(catalog_().map(r=>[r[0],r]));
  if(p.action==='importRows'){
    if(meta.status==='FINALIZADA')throw new Error('Contagem finalizada. Abra uma nova contagem.');
    if(!['counts','defects'].includes(p.kind))throw new Error('Escolha Contagem ou Defeitos.');
    if(!p.requestId||!/^[a-zA-Z0-9-]{16,80}$/.test(p.requestId))throw new Error('Identificador de importação inválido.');
    if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>40000)throw new Error('O TXT deve conter entre 1 e 40.000 linhas.');
    const missing=Array.from(new Set(p.rows.map(r=>String(r.ean||'').trim()).filter(e=>/^\d{1,30}$/.test(e)&&!products.has(e))));
    if(missing.length&&!p.includeUnknown)return {requiresConfirmation:true,unknown:missing.slice(0,100),unknownCount:missing.length};
    const current=state_(meta),incoming=normalizeRows_(p.rows.map(r=>Object.assign({},r,{unknown:!!p.includeUnknown})),products);
    const merged=mergeRows_(current[p.kind],incoming),counts=p.kind==='counts'?merged:current.counts,defects=p.kind==='defects'?merged:current.defects,zeroEans=(current.zeroEans||[]).filter(e=>!incoming.some(r=>r.ean===e));
    if(meta.kind==='RECONTAGEM')validateRecount_(meta,counts,defects,zeroEans,false,current);
    writeState_(meta,counts,defects,current);meta.version++;meta.updatedAt=new Date().toISOString();meta.requestId=String(p.requestId);
    if(meta.kind==='RECONTAGEM')writeRecountZeros_(meta,zeroEans);
    if(p.auditSession){Object.assign(meta,sessionAudit_(p.auditSession));}saveMeta_(meta);
    const result=state_(meta);result.imported=incoming.length;return result;
  }
  const counts=normalizeRows_(p.counts,products),defects=normalizeRows_(p.defects,products),previous=state_(meta);
  if(meta.kind==='RECONTAGEM'){
    if(!list.some(m=>m.id===meta.sourceId&&m.store===meta.store))throw new Error('A contagem original foi excluída.');
    validateRecount_(meta,counts,defects,p.zeroEans||[],p.action==='finish',previous);
  }
  if(p.action==='finish'&&meta.kind!=='RECONTAGEM'&&!counts.length&&!defects.length)return deleteEmptyCount_(meta,list);
  writeState_(meta,counts,defects,previous);
  if(meta.kind==='RECONTAGEM'){writeRecountZeros_(meta,p.zeroEans||[]);if(p.action==='finish')applyRecount_(meta,counts,defects,list);}
  meta.version++;meta.updatedAt=new Date().toISOString();meta.requestId=String(p.requestId||'');if(p.action==='finish')meta.status='FINALIZADA';
  if(p.auditSession){Object.assign(meta,sessionAudit_(p.auditSession));}saveMeta_(meta);
  return meta.kind==='RECONTAGEM'?state_(meta):Object.assign(publicMeta_(meta),{counts,defects});
}

// Recounts keep a separate audit worksheet and never expose the original quantities to stores.
function requestRecount_(p,list){
  if(!p.allStores)throw new Error('Solicitação restrita aos administradores.');
  const source=list.find(m=>m.id===p.id);
  if(!source||source.kind==='RECONTAGEM'||source.status!=='FINALIZADA')throw new Error('Selecione uma contagem finalizada.');
  if(!p.requestId||!/^[a-zA-Z0-9-]{16,80}$/.test(p.requestId))throw new Error('Identificador da solicitação inválido.');
  const previous=list.find(m=>m.createdRequestId===p.requestId&&m.sourceId===source.id);
  if(previous)return publicMeta_(previous);
  if(list.some(m=>m.kind==='RECONTAGEM'&&m.sourceId===source.id&&m.status!=='FINALIZADA'))throw new Error('Já existe uma recontagem pendente para esta contagem.');
  if(!Array.isArray(p.eans)||!p.eans.length||p.eans.length>40000)throw new Error('Envie entre 1 e 40.000 EANs.');
  const eans=Array.from(new Set(p.eans.map(e=>String(e).trim())));
  if(eans.some(e=>!/^\d{1,30}$/.test(e)))throw new Error('TXT com EAN inválido. Use um código por linha.');
  const original=state_(source),products=new Map(original.counts.concat(original.defects).map(r=>[r.ean,r]));
  const now=new Date(),ss=db_(),base=source.label+' RECONTAGEM';let number=1+Math.max(0,...list.filter(m=>m.kind==='RECONTAGEM'&&m.sourceId===source.id).map(m=>Number((m.label.match(/#(\d+)$/)||[])[1]||1))),label=base+' #'+number;while(ss.getSheetByName(label))label=base+' #'+(++number);
  const sheet=ss.insertSheet(label),meta={id:Utilities.getUuid(),store:source.store,date:source.date,label,status:'EM ANDAMENTO',version:0,sheet:label,createdBy:p.userId,createdAt:now.toISOString(),updatedAt:now.toISOString(),requestId:'',kind:'RECONTAGEM',sourceId:source.id,createdRequestId:p.requestId};
  if(sheet.getMaxColumns()<20)sheet.insertColumnsAfter(sheet.getMaxColumns(),20-sheet.getMaxColumns());if(sheet.getMaxColumns()>20)sheet.setMaxColumns(20);
  if(sheet.getMaxRows()<eans.length+4)sheet.insertRowsAfter(sheet.getMaxRows(),eans.length+4-sheet.getMaxRows());if(sheet.getMaxRows()>eans.length+4)sheet.setMaxRows(eans.length+4);
  sheet.getRange('A1:B2').setValues([['RECONTAGEM',source.label],['LOJA',source.store]]);
  sheet.getRange(4,1,1,15).setValues([['EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','','EAN','QNTD','PRODUTO','MARCA','INEXISTENTE','','EAN','QNTD','EAN,QNTD']]);
  sheet.getRange('Q4:T4').setValues([['EAN SOLICITADO','PRODUTO','MARCA','NÃO LOCALIZADO']]);
  sheet.getRange(5,17,eans.length,4).setNumberFormat('@').setValues(eans.map(e=>[e,products.get(e)?.description||'Consultar pelo EAN',products.get(e)?.brand||'','NÃO']));
  sheet.getRange('A4:T4').setBackground('#ffda28').setFontWeight('bold');sheet.setFrozenRows(4);sheet.setColumnWidths(1,20,140);sheet.setColumnWidth(3,340);sheet.setColumnWidth(9,340);sheet.setColumnWidth(18,340);
  ss.getSheetByName('_Contagens').getRange(1,1,1,META_HEADERS.length).setValues([META_HEADERS]);
  ss.getSheetByName('_Contagens').appendRow([meta.id,meta.store,meta.date,meta.label,meta.status,0,meta.sheet,meta.createdBy,meta.createdAt,meta.updatedAt,'',meta.kind,meta.sourceId,meta.createdRequestId]);
  SpreadsheetApp.flush();return publicMeta_(meta);
}
function validateRecount_(meta,counts,defects,zeros,finish,state){
  state=state||state_(meta);const allowed=new Set(state.targets.map(r=>r.ean)),scanned=new Set(counts.concat(defects).map(r=>r.ean));
  if(!Array.isArray(zeros)||zeros.length>allowed.size||zeros.some(e=>typeof e!=='string'||!allowed.has(e)))throw new Error('Lista de produtos não localizados inválida.');
  if([...scanned].some(e=>!allowed.has(e)))throw new Error('Este EAN não está na solicitação de recontagem.');
  if(zeros.some(e=>scanned.has(e)))throw new Error('Um produto bipado não pode estar marcado como não localizado.');
  if(finish&&[...allowed].some(e=>!scanned.has(e)&&!zeros.includes(e)))throw new Error('Bipe ou marque como não localizado cada EAN solicitado antes de finalizar.');
}
function writeRecountZeros_(meta,zeros){
  const state=state_(meta),set=new Set(zeros);if(state.targets.length)db_().getSheetByName(meta.sheet).getRange(5,20,state.targets.length,1).setValues(state.targets.map(r=>[set.has(r.ean)?'SIM':'NÃO']));
}
function applyRecount_(meta,counts,defects,list){
  const source=list.find(m=>m.id===meta.sourceId&&m.store===meta.store);if(!source)throw new Error('A contagem original foi excluída.');
  if(source.requestId==='recount-'+meta.id)return;
  const original=state_(source),targets=new Set(state_(meta).targets.map(r=>r.ean));
  const replace=(old,fresh)=>{const map=new Map(fresh.map(r=>[r.ean,r])),seen=new Set();const rows=[];old.forEach(r=>{const item=targets.has(r.ean)?map.get(r.ean):r;if(item){rows.push(item);seen.add(r.ean);}});fresh.forEach(r=>{if(!seen.has(r.ean))rows.push(r);});return rows;};
  writeState_(source,replace(original.counts,counts),replace(original.defects,defects),original);
  source.version++;source.updatedAt=new Date().toISOString();source.requestId='recount-'+meta.id;
  db_().getSheetByName('_Contagens').getRange(source.row,5,1,7).setValues([[source.status,source.version,source.sheet,source.createdBy,source.createdAt,source.updatedAt,source.requestId]]);
}

function countBase_(store,date){return store+'-'+date.slice(8,10)+'-'+date.slice(5,7)+'-'+date.slice(0,4);}
function countLabel_(store,date,number){return countBase_(store,date)+' #'+number;}
function countNumber_(meta){
  const numbered=meta.label.match(/#(\d+)$/);if(numbered)return Number(numbered[1]);
  const base=countBase_(meta.store,meta.date);return meta.label===base?1:meta.label.startsWith(base+'-')?Number(meta.label.slice(base.length+1))||1:1;
}
function nextCountNumber_(list,store,date){return 1+Math.max(0,...list.filter(m=>m.kind!=='RECONTAGEM'&&m.store===store&&m.date===date).map(countNumber_));}
// Run once when deploying numbering. Existing IDs, products and revisions are preserved.
function migrateCountNames(){
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const ss=db_(),list=metadata_(),metaSheet=ss.getSheetByName('_Contagens'),used=new Set(),renamed=[];
    const ordinary=list.filter(m=>m.kind!=='RECONTAGEM').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.row-b.row);
    function rename(m,label){const tab=ss.getSheetByName(m.sheet);if(!tab)return;const other=ss.getSheetByName(label);if(other&&other.getSheetId()!==tab.getSheetId())throw new Error('Nome de aba já utilizado: '+label);if(tab.getName()!==label)tab.setName(label);if(m.label!==label||m.sheet!==label){metaSheet.getRange(m.row,4).setValue(label);metaSheet.getRange(m.row,7).setValue(label);renamed.push(label);}m.label=label;m.sheet=label;}
    ordinary.forEach(m=>{let n=countNumber_(m),key=m.store+'|'+m.date+'|'+n;while(used.has(key)){n++;key=m.store+'|'+m.date+'|'+n;}used.add(key);rename(m,countLabel_(m.store,m.date,n));});
    const recounts=list.filter(m=>m.kind==='RECONTAGEM').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.row-b.row),numbers=new Map();
    recounts.forEach(m=>{const source=list.find(s=>s.id===m.sourceId);if(!source)return;const n=(numbers.get(source.id)||0)+1;numbers.set(source.id,n);rename(m,source.label+' RECONTAGEM #'+n);const tab=ss.getSheetByName(m.sheet);if(tab)tab.getRange('B1').setValue(source.label);});
    SpreadsheetApp.flush();console.log('Nomes atualizados: '+renamed.length);return renamed;
  }finally{lock.releaseLock();}
}

function updateInventoryNamesAndCleanup(){reconcileDeletedCounts();return migrateCountNames();}
