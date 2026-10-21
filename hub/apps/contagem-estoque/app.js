'use strict';
const $=s=>document.querySelector(s),BASE='https://rihvnshexilakojnltox.supabase.co',KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz',AUTH_KEY='tp-manuais-supabase-v1';
let auth=null,user=null,stores=[],sessions=[],current=null,catalog=new Map(),mode='count',unknown=null;
let serial=0,saved=0,inflight=null,timer=null,retry=null,conflict=false,xlsxPromise;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function note(s,error=false){$('#scan-message').textContent=s;$('#scan-message').className='scan-message '+(error?'error':'success');}
function sync(s,type=''){$('#sync-status').textContent=s;$('#sync-status').className='sync-status '+type;}
function saveAuth(a){auth=a;if(a)sessionStorage.setItem(AUTH_KEY,JSON.stringify(a));else sessionStorage.removeItem(AUTH_KEY);}
async function refresh(){
  const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth?.refresh_token})});
  const data=await r.json();if(!r.ok){saveAuth(null);throw Error('Sessão expirada. Entre novamente.');}saveAuth(data);
}
async function api(action,params={},again=false){
  const r=await fetch(BASE+'/functions/v1/stockcount-api',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+auth?.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...params})});
  if(r.status===401&&!again){await refresh();return api(action,params,true);}
  const data=await r.json();if(!r.ok){const e=Error(data.error||'Falha de comunicação.');e.status=r.status;throw e;}return data;
}
function picker(){
  $('#session-picker-wrap').hidden=!sessions.length;
  $('#session-picker').innerHTML='<option value="">Selecione uma contagem</option>'+sessions.slice().reverse().map(s=>'<option value="'+esc(s.id)+'">'+esc(s.label)+' · '+esc(s.status)+'</option>').join('');
  $('#session-picker').value=current?.id||'';
}
function render(){
  $('#empty-state').hidden=!!current;$('#counting').hidden=!current;if(!current)return;
  $('#session-title').textContent=current.label;
  const counts=current.counts,defects=current.defects,done=current.status==='FINALIZADA';
  $('#count-total').textContent=counts.reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#defect-total').textContent=defects.reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#count-rows').textContent=counts.length+' ITENS';$('#defect-rows').textContent=defects.length+' ITENS';
  $('#count-empty').hidden=!!counts.length;$('#defect-empty').hidden=!!defects.length;
  function table(rows,kind){return rows.map(r=>'<tr><td>'+esc(r.ean)+'</td><td><span class="product-name">'+esc(r.description)+'</span>'+(r.unknown?'<span class="product-sub">Lançado mesmo assim</span>':'')+'</td><td>'+esc(r.brand)+'</td><td><div class="qty-actions"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="-1" aria-label="Diminuir">−</button><b>'+r.quantity+'</b><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="1" aria-label="Aumentar">+</button></div></td><td><button type="button" class="remove-row" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-remove="1" aria-label="Remover">×</button></td></tr>').join('');}
  $('#count-body').innerHTML=table(counts,'counts');$('#defect-body').innerHTML=table(defects,'defects');
  $('#ean-input').disabled=done||!catalog.size||conflict;
  $('#finish-count').disabled=done||conflict;$('#finish-count').textContent=done?'CONTAGEM FINALIZADA':'FINALIZAR CONTAGEM';
  document.querySelectorAll('.qty-actions button,.remove-row').forEach(b=>b.disabled=done||conflict);
}
async function boot(){
  const r=await api('bootstrap');user=r.user;stores=r.stores;sessions=r.sessions;
  $('#login-panel').hidden=true;$('#app-main').hidden=false;$('#logout').hidden=false;
  $('#account-label').textContent=user.allStores?'ACESSO ADMINISTRATIVO':user.store;
  $('#store-code').value=user.store||stores[0]||'';$('#store-code').readOnly=!user.allStores;$('#tab-analysis').hidden=!user.allStores;
  picker();render();
  const data=await api('catalog');catalog=new Map(data.data.map(([ean,description,brand])=>[String(ean),{ean,description,brand}]));
  $('#catalog-status').textContent='Cadastro do Drive · '+catalog.size.toLocaleString('pt-BR')+' produtos';
  $('#filter-store').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option>'+esc(s)+'</option>').join('');
  $('#filter-brand').innerHTML='<option value="">Todas as marcas</option>'+[...new Set([...catalog.values()].map(r=>r.brand).filter(Boolean))].sort().map(s=>'<option>'+esc(s)+'</option>').join('');
  render();
}
function draftKey(){return 'tp-stockcount-draft-'+user.id+'-'+current.id;}
function persistDraft(){try{localStorage.setItem(draftKey(),JSON.stringify({version:current.version,inflightId:retry?.body.requestId||null,counts:current.counts,defects:current.defects}));}catch(_){sync('Não foi possível criar o rascunho local. Aguarde o Drive.','error');}}
function changed(){
  serial++;persistDraft();
  sync('Salvamento pendente…','pending');render();clearTimeout(timer);timer=setTimeout(flush,800);
}
async function flush(){
  if(inflight)return inflight;
  if(!current||serial===saved||conflict)return;
  const target=current;
  retry=retry||{serial,body:{id:target.id,version:target.version,requestId:uuid(),counts:structuredClone(target.counts),defects:structuredClone(target.defects)}};
  const packet=retry;
  persistDraft();
  inflight=(async()=>{
    try{
      sync('Salvando no Google Drive…','pending');
      const response=await api('save',packet.body);target.version=response.data.version;target.updatedAt=response.data.updatedAt;
      saved=packet.serial;retry=null;
      if(serial===saved){localStorage.removeItem(draftKey());sync('Salvo no Google Drive');}
      else persistDraft();
    }catch(e){
      conflict=e.status===409;
      sync(conflict?'Alterada em outro acesso. Reabra a contagem.':'Salvamento pendente. Tentaremos novamente.','error');note(e.message,true);render();
    }finally{inflight=null;if(serial!==saved&&!conflict)timer=setTimeout(flush,3000);}
  })();return inflight;
}
async function ensureSaved(){
  clearTimeout(timer);
  while(serial!==saved){
    const previous=saved;await flush();clearTimeout(timer);
    if(saved===previous)throw Error('Aguarde o salvamento no Google Drive antes de continuar.');
  }
}
async function openCount(id){
  if(!id)return;
  if(conflict){if(!confirm('Reabrir a versão do Drive? O rascunho deste navegador será preservado para conferência.'))return;clearTimeout(timer);}
  else await ensureSaved();
  current=(await api('read',{id})).data;serial=0;saved=0;retry=null;conflict=false;
  let restored=false;
  try{
    const draft=JSON.parse(localStorage.getItem(draftKey())||'null');
    const sameVersion=draft&&draft.version===current.version;
    const ownRetry=draft?.inflightId&&current.lastRequestId===draft.inflightId&&current.version===draft.version+1;
    if(draft&&(sameVersion||ownRetry)&&current.status!=='FINALIZADA'){current.counts=draft.counts;current.defects=draft.defects;changed();restored=true;}
    else if(draft)note('Há um rascunho de outra versão neste navegador. A versão do Drive foi preservada.',true);
  }catch(_){}
  picker();render();if(!restored)sync(current.status==='FINALIZADA'?'Contagem finalizada no Drive':'Salvo no Google Drive');$('#ean-input').focus();
}
async function createCount(){
  $('#new-count').disabled=true;
  try{
    await ensureSaved();const store=$('#store-code').value.trim().toUpperCase();
    if(!stores.includes(store))throw Error('Informe uma sigla de loja válida.');
    current=(await api('create',{store})).data;sessions.push(current);serial=0;saved=0;retry=null;conflict=false;
    picker();render();sync('Nova contagem criada no Drive');$('#ean-input').focus();
  }catch(e){alert(e.message);}finally{$('#new-count').disabled=false;}
}
function addScan(ean,allowUnknown=false){
  if(!current||current.status==='FINALIZADA'||conflict)return;
  const kind=mode==='count'?'counts':'defects',p=catalog.get(ean);
  let row=current[kind].find(r=>r.ean===ean);
  if(!row){row={ean,quantity:0,description:p?.description||'PRODUTO INEXISTENTE',brand:p?.brand||'NÃO CADASTRADA',unknown:allowUnknown};current[kind].push(row);}
  row.quantity++;changed();note(row.description);$('#ean-input').value='';$('#ean-input').focus();
}
function scan(){
  if(!current||!catalog.size||current.status==='FINALIZADA'||conflict)return;
  const ean=$('#ean-input').value.trim();
  if(!/^\d{1,30}$/.test(ean)){note('Confira o EAN informado: use apenas números.',true);$('#ean-input').select();return;}
  if(!catalog.has(ean)){unknown=ean;$('#unknown-ean').textContent=ean;$('#unknown-dialog').showModal();return;}
  addScan(ean);
}
async function finishCount(){
  try{
    await ensureSaved();if(!confirm('Finalizar esta contagem? Ela aparecerá na análise e não receberá mais bipagens.'))return;
    current=(await api('finish',{id:current.id,version:current.version,requestId:uuid(),counts:current.counts,defects:current.defects})).data;
    sessions=sessions.map(s=>s.id===current.id?current:s);picker();render();sync('Contagem finalizada no Google Drive');
  }catch(e){note(e.message,true);}
}
function pivotAnalysis(data,brand=''){
  const latest=new Map();
  data.forEach(s=>{const key=s.store+'|'+s.date,old=latest.get(key);if(!old||s.createdAt>old.createdAt)latest.set(key,s);});
  const selected=[...latest.values()],dates=[...new Set(selected.map(s=>s.date))].sort(),rows=new Map();
  selected.forEach(s=>s.counts.concat(s.defects).forEach(item=>{
    const key=s.store+'|'+item.ean,p=catalog.get(item.ean)||item;if(brand&&p.brand!==brand)return;
    const row=rows.get(key)||{store:s.store,ean:item.ean,description:p.description,brand:p.brand,values:{}};
    row.values[s.date]=(row.values[s.date]||0)+item.quantity;rows.set(key,row);
  }));
  return {dates,rows:[...rows.values()].sort((a,b)=>a.store.localeCompare(b.store)||a.description.localeCompare(b.description))};
}
async function analyze(event){
  event?.preventDefault();$('#analysis-status').textContent='Carregando contagens finalizadas do Drive…';
  try{
    const r=await api('analysis',{filterStore:$('#filter-store').value,startDate:$('#filter-start').value,endDate:$('#filter-end').value});
    const result=pivotAnalysis(r.data,$('#filter-brand').value);
    $('#analysis-head').innerHTML='<tr><th>LOJA</th><th>EAN</th><th>PRODUTO</th><th>MARCA</th>'+result.dates.map(d=>'<th>'+esc(d.split('-').reverse().join('/'))+'</th>').join('')+'</tr>';
    $('#analysis-body').innerHTML=result.rows.map(r=>'<tr><td>'+esc(r.store)+'</td><td>'+esc(r.ean)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.brand)+'</td>'+result.dates.map(d=>'<td class="'+(r.values[d]?'':'zero')+'">'+(r.values[d]||0)+'</td>').join('')+'</tr>').join('');
    $('#analysis-status').textContent=result.rows.length+' produtos · '+result.dates.length+' datas. Última contagem finalizada de cada loja em cada data.';
  }catch(e){$('#analysis-status').textContent=e.message;}
}
function imports(){return current.defects.concat(current.counts).map(r=>({EAN:r.ean,QNTD:r.quantity,'CÓDIGO IMPORTAÇÃO':r.ean+','+r.quantity}));}
function exportCsv(){
  if(!current)return;const blob=new Blob([imports().map(r=>r.EAN+','+r.QNTD).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=window.URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='IMPORTACAO_'+current.label+'.csv';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);
}
async function exportExcel(){
  try{
    if(!window.XLSX){xlsxPromise=xlsxPromise||new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=()=>reject(Error('A exportação Excel não carregou. Use o CSV ou tente novamente.'));document.head.append(s);});await xlsxPromise;}
    const wb=XLSX.utils.book_new();
    [['CONTAGEM',current.counts],['DEFEITOS',current.defects],['IMPORTAÇÃO',imports()]].forEach(([name,list])=>{
      const rows=name==='IMPORTAÇÃO'?list:list.map(r=>({EAN:r.ean,QNTD:r.quantity}));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows,{header:name==='IMPORTAÇÃO'?['EAN','QNTD','CÓDIGO IMPORTAÇÃO']:['EAN','QNTD']}),name);
    });XLSX.writeFile(wb,current.label+'.xlsx',{compression:true});
  }catch(e){note(e.message,true);}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('#login-submit').disabled=true;$('#login-error').textContent='';
  try{
    let login=$('#login-id').value.trim();const password=$('#login-password').value;
    const aliases={ALBERTO:'alberto.guimaraes@tennisplacebrasil.com.br',PAULO:'paulo.ribeiro@tennisplacebrasil.com.br'};login=aliases[login.toUpperCase()]||login;
    const email=login.includes('@'),r=await fetch(BASE+(email?'/auth/v1/token?grant_type=password':'/functions/v1/manual-portal-login'),{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(email?{email:login.toLowerCase(),password}:{login:login.toUpperCase(),password})});
    const data=await r.json();$('#login-password').value='';if(!r.ok)throw Error(data.error_description||data.error||'Login ou senha inválidos.');
    saveAuth(data);await boot();
  }catch(e){$('#login-error').textContent=e.message;$('#app-error').textContent=e.message;}finally{$('#login-submit').disabled=false;}
});
$('#logout').addEventListener('click',async()=>{
  try{await ensureSaved();saveAuth(null);user=null;current=null;catalog.clear();$('#app-main').hidden=true;$('#login-panel').hidden=false;$('#logout').hidden=true;$('#account-label').textContent='ACESSO TENNIS PLACE';}catch(e){note(e.message,true);}
});
$('#new-count').addEventListener('click',createCount);
$('#session-picker').addEventListener('change',event=>openCount(event.target.value).catch(e=>note(e.message,true)));
$('#scan-form').addEventListener('submit',event=>{event.preventDefault();scan();});
$('#correct-ean').addEventListener('click',()=>{$('#unknown-dialog').close();unknown=null;$('#ean-input').focus();$('#ean-input').select();});
$('#allow-ean').addEventListener('click',()=>{$('#unknown-dialog').close();addScan(unknown,true);unknown=null;});
document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode-button').forEach(x=>x.classList.toggle('active',x===b));$('#ean-input').focus();}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('click',event=>{
  const b=event.target.closest('[data-kind]');if(!b||!current||current.status==='FINALIZADA'||conflict)return;
  const list=current[b.dataset.kind],row=list.find(r=>r.ean===b.dataset.ean);if(!row)return;
  row.quantity=b.dataset.remove?0:row.quantity+Number(b.dataset.delta);current[b.dataset.kind]=list.filter(r=>r.quantity>0);changed();
}));
$('#reload-count').addEventListener('click',()=>openCount(current?.id).catch(e=>note(e.message,true)));
$('#finish-count').addEventListener('click',finishCount);$('#export-txt').addEventListener('click',exportCsv);$('#export-xlsx').addEventListener('click',exportExcel);
$('#analysis-filters').addEventListener('submit',analyze);
function showTab(analysis){$('#count-view').hidden=analysis;$('#analysis-view').hidden=!analysis;$('#tab-count').classList.toggle('active',!analysis);$('#tab-analysis').classList.toggle('active',analysis);}
$('#tab-count').addEventListener('click',()=>showTab(false));$('#tab-analysis').addEventListener('click',()=>{showTab(true);analyze();});
window.addEventListener('beforeunload',event=>{if(serial!==saved){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>flush());
window.tpPrepareClose=ensureSaved;
try{auth=JSON.parse(sessionStorage.getItem(AUTH_KEY)||'null');}catch(_){}
if(auth?.access_token)boot().catch(e=>{$('#login-error').textContent=e.message;$('#app-error').textContent=e.message;});
