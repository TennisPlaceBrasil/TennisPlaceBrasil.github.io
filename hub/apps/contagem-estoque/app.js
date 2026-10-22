'use strict';
const $=s=>document.querySelector(s),BASE='https://rihvnshexilakojnltox.supabase.co',KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz',AUTH_KEY='tp-manuais-supabase-v1';
let auth=null,user=null,stores=[],sessions=[],sessionsLoaded=false,loadingSessions=false,current=null,catalog=new Map(),mode='count',unknown=null,lookingUp=false;
let serial=0,saved=0,inflight=null,timer=null,retry=null,conflict=false,xlsxPromise,recounts=[],loadingRecounts=false,recountSourceId=null,recountPage=0,pendingImport=null,cameraStream=null,cameraControls=null,cameraFrame=0,cameraActive=false,zxingPromise=null,deletionRequests=[],loadingDeletions=false,activeDeletionReviewId=null,unknownOrigin='LEITOR / DIGITAÇÃO',auditSessionPromise=null;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function note(s,error=false){$('#scan-message').textContent=s;$('#scan-message').className='scan-message '+(error?'error':'success');}
function sync(s,type=''){$('#sync-status').textContent=s;$('#sync-status').className='sync-status '+type;}
function cacheCatalog(ean,value){catalog.set(ean,value);try{const db=JSON.parse(localStorage.getItem('tp-stock-catalog-v1')||'{}');db[ean]={value,expires:Date.now()+240000};const keys=Object.keys(db);if(keys.length>5000)keys.slice(0,keys.length-5000).forEach(k=>delete db[k]);localStorage.setItem('tp-stock-catalog-v1',JSON.stringify(db));}catch(_){}}
function restoreCatalog(){try{const db=JSON.parse(localStorage.getItem('tp-stock-catalog-v1')||'{}'),now=Date.now();Object.entries(db).forEach(([ean,item])=>{if(item.expires>now)catalog.set(ean,item.value);else delete db[ean];});localStorage.setItem('tp-stock-catalog-v1',JSON.stringify(db));}catch(_){}}
function saveAuth(a){auth=a;if(a)sessionStorage.setItem(AUTH_KEY,JSON.stringify(a));else sessionStorage.removeItem(AUTH_KEY);}
function sessionDevice(){const ua=navigator.userAgent||'',browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Navegador';const device=/Android/i.test(ua)?(/Mobile/i.test(ua)?'Android celular':'Android tablet'):/iPhone|iPod/i.test(ua)?'iPhone':/iPad/i.test(ua)?'iPad':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux':'Dispositivo';return browser+' · '+device;}
function auditSession(){
  if(auditSessionPromise)return auditSessionPromise;
  auditSessionPromise=(async()=>{const key='tp-stockcount-audit-'+(user?.id||'guest');try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached?.id&&cached?.device)return cached;}catch(_){}
    const data={id:uuid(),device:sessionDevice(),ip:'IP não capturado'};
    try{const response=await fetch('https://api.ipify.org?format=json',{signal:AbortSignal.timeout(3000),cache:'no-store'});if(response.ok){const result=await response.json(),ip=String(result.ip||'').trim();if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)||/^[0-9a-f:]+$/i.test(ip))data.ip=ip;}}catch(_){}
    try{sessionStorage.setItem(key,JSON.stringify(data));}catch(_){}return data;
  })().finally(()=>{auditSessionPromise=null;});return auditSessionPromise;
}
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
  $('#session-picker-wrap').hidden=!user?.allStores;
  $('#session-picker').hidden=!sessions.length;
  $('#session-picker').innerHTML='<option value="">Selecione uma contagem</option>'+sessions.slice().reverse().map(s=>'<option value="'+esc(s.id)+'">'+esc(s.label)+' · '+esc(s.status)+'</option>').join('');
  $('#session-picker').value=current?.id||'';
  $('#load-sessions').disabled=loadingSessions;
  $('#load-sessions').textContent=loadingSessions?'CARREGANDO…':sessionsLoaded?'ATUALIZAR CONTAGENS':'CARREGAR CONTAGENS';
  $('#delete-session').hidden=!user?.allStores||!$('#session-picker').value;
  $('#delete-session').disabled=loadingSessions;
  const selected=sessions.find(s=>s.id===$('#session-picker').value);
  $('#request-recount').hidden=!user?.allStores||!selected||selected.kind==='RECONTAGEM'||selected.status!=='FINALIZADA';
  $('#request-delete-session').hidden=!!user?.allStores||!current||current.deleteStatus==='PENDENTE';
  $('#share-count').hidden=!user?.allStores||!selected;
  $('#share-count').disabled=loadingSessions||!selected;
}
function render(){
  $('#empty-state').hidden=!!current;$('#counting').hidden=!current;$('#share-link-panel').hidden=!(current&&current.shareUrl);if(current?.shareUrl)$('#share-link-value').value=current.shareUrl;renderRecount();updateInventoryHelp();if(!current){$('#delete-review-actions').hidden=true;$('#request-delete-session').hidden=true;return;}
  $('#session-title').textContent=current.label;
  $('#reload-count').hidden=!user?.allStores&&current.kind!=='RECONTAGEM';
  const counts=current.counts,defects=current.defects,done=current.status==='FINALIZADA',deletePending=current.deleteStatus==='PENDENTE';
  $('#count-total').textContent=counts.reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#defect-total').textContent=defects.reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#count-rows').textContent=counts.length+' ITENS';$('#defect-rows').textContent=defects.length+' ITENS';
  $('#count-empty').hidden=!!counts.length;$('#defect-empty').hidden=!!defects.length;
  function table(rows,kind){return rows.map(r=>'<tr><td>'+esc(r.ean)+'</td><td><span class="product-name">'+esc(r.description)+'</span>'+(r.unknown?'<span class="product-sub">Lançado mesmo assim</span>':'')+'</td><td>'+esc(r.brand)+'</td><td><div class="qty-actions"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="-1" aria-label="Diminuir">−</button><input class="quantity-input" type="number" min="1" max="1000000" step="1" inputmode="numeric" value="'+r.quantity+'" data-quantity="1" data-list="'+kind+'" data-ean="'+esc(r.ean)+'" aria-label="Quantidade"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="1" aria-label="Aumentar">+</button></div></td><td><button type="button" class="remove-row" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-remove="1" aria-label="Remover">×</button></td></tr>').join('');}
  $('#count-body').innerHTML=table(counts,'counts');$('#defect-body').innerHTML=table(defects,'defects');
  $('#ean-input').disabled=done||conflict||lookingUp||deletePending;
  ['#open-camera','#import-count','#import-defects'].forEach(id=>{if($(id))$(id).disabled=done||conflict||deletePending;});
  $('#finish-count').disabled=done||conflict||deletePending;$('#finish-count').textContent=done?'CONTAGEM FINALIZADA':deletePending?'AGUARDANDO ADM':'FINALIZAR CONTAGEM';
  $('#delete-pending-status').hidden=!deletePending;
  $('#request-delete-session').hidden=!!user?.allStores||deletePending;$('#request-delete-session').disabled=done&&deletePending;
  document.querySelectorAll('.qty-actions button,.quantity-input,.remove-row').forEach(b=>b.disabled=done||conflict||deletePending);
  const review=activeDeletionReviewId===current.id&&user?.allStores&&current.deleteStatus==='PENDENTE';$('#delete-review-actions').hidden=!review;
  if(review)$('#delete-review-summary').textContent=counts.length+' produtos na contagem · '+defects.length+' produtos com defeito · '+counts.reduce((n,r)=>n+r.quantity,0)+' unidades contadas · '+defects.reduce((n,r)=>n+r.quantity,0)+' unidades com defeito.';
  $('#approve-delete').disabled=!review||loadingDeletions;$('#reject-delete').disabled=!review||loadingDeletions;
}
async function boot(){
  const r=await api('bootstrap');user=r.user;stores=r.stores;sessions=[];sessionsLoaded=false;
  auditSession();
  restoreCatalog();
  $('#login-panel').hidden=true;$('#app-main').hidden=false;$('#logout').hidden=false;
  $('#account-label').textContent=user.allStores?'ACESSO ADMINISTRATIVO':user.store;
  $('#store-code').innerHTML=(user.allStores?'<option value="">Selecione a loja</option>':'')+stores.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');$('#store-code').value=user.store||'';$('#store-code').disabled=!user.allStores;$('#count-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('#tab-analysis').hidden=!user.allStores;
  const today=$('#count-date').value,from=new Date(today+'T12:00:00-03:00');from.setDate(from.getDate()-89);$('#filter-end').value=today;$('#filter-start').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(from);
  picker();render();
  $('#catalog-status').textContent='Cadastro do Drive · consulta por EAN';
  $('#filter-store').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option>'+esc(s)+'</option>').join('');
  $('#filter-brand').innerHTML='<option value="">Todas as marcas</option>';
  $('#register-gama').hidden=!user.allStores||stores.includes('GAMA');
  $('#recount-inbox').hidden=false;loadRecounts();$('#deletion-inbox').hidden=!user.allStores;if(user.allStores)loadDeletionRequests();updateInventoryHelp();
}
async function loadSessions(){
  if(!user?.allStores)return;
  if(loadingSessions)return;
  loadingSessions=true;picker();
  try{
    const r=await api('list');
    const latest=current;
    sessions=r.data||[];
    if(latest&&!sessions.some(s=>s.id===latest.id)){clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;render();$('#app-error').textContent='Esta contagem foi excluída da planilha e removida do Inventário.';}
    else if(latest){const metadata=sessions.find(s=>s.id===latest.id);latest.label=metadata.label;sessions=sessions.map(s=>s.id===latest.id?latest:s);render();}
    sessionsLoaded=true;picker();
  }catch(e){$('#app-error').textContent=e.message;}
  finally{loadingSessions=false;picker();}
}
async function deleteSession(){
  const id=$('#session-picker').value;
  if(!user?.allStores||!id)return;
  const item=sessions.find(s=>s.id===id);
  if(!confirm('Excluir '+(item?.label||'esta contagem')+' do histórico e apagar a aba correspondente no Google Drive? Esta ação não pode ser desfeita.'))return;
  try{
    if(current?.id===id)await ensureSaved();
    await api('delete',{id});
    sessions=sessions.filter(s=>s.id!==id);
    if(current?.id===id){localStorage.removeItem(draftKey());current=null;serial=0;saved=0;retry=null;conflict=false;}
    picker();render();$('#app-error').textContent='';sync('Contagem excluída do Drive');loadRecounts();
  }catch(e){if(/já não existe|sem permissão|excluída da planilha/.test(e.message)){sessions=sessions.filter(s=>s.id!==id);if(current?.id===id){clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;}picker();render();$('#app-error').textContent='Esta contagem já foi excluída da planilha.';}else $('#app-error').textContent=e.message;}
}
async function loadDeletionRequests(){
  if(!user?.allStores||loadingDeletions)return;loadingDeletions=true;$('#refresh-deletions').disabled=true;$('#deletion-inbox-status').textContent='Buscando solicitações…';
  try{const r=await api('deletionInbox');deletionRequests=r.data||[];$('#deletion-inbox-list').innerHTML=deletionRequests.map(item=>'<article class="recount-inbox-item"><div><strong>'+esc(item.store)+' · '+esc(item.label)+'</strong><span>Solicitada em '+esc(item.deleteRequestedAt||'data não informada')+'</span></div><button class="button button-primary" type="button" data-review-delete="'+esc(item.id)+'">VER PRODUTOS</button></article>').join('');$('#deletion-inbox-status').textContent=deletionRequests.length?deletionRequests.length+' solicitação(ões) aguardando análise.':'Nenhuma solicitação pendente.';}
  catch(e){$('#deletion-inbox-status').textContent=e.message||'Não foi possível buscar os pedidos.';}
  finally{loadingDeletions=false;$('#refresh-deletions').disabled=false;render();}
}
async function reviewDeletion(id){
  const request=deletionRequests.find(item=>item.id===id);if(!request)return;
  try{await openCount(id);if(current?.deleteStatus!=='PENDENTE')throw Error('Esta solicitação já foi analisada.');activeDeletionReviewId=id;$('#delete-review-reason').value='';render();$('#product-lists').scrollIntoView({block:'start'});}
  catch(e){$('#app-error').textContent=e.message;loadDeletionRequests();}
}
async function requestDeletion(){
  if(!current||user?.allStores||current.deleteStatus==='PENDENTE')return;
  if(!confirm('Enviar solicitação para excluir '+current.label+'? O ADM vai revisar os produtos antes de decidir. A contagem ficará bloqueada até a análise.'))return;
  $('#request-delete-session').disabled=true;
  try{await ensureSaved();const result=(await api('requestDelete',{id:current.id,auditSession:await auditSession()})).data;current=Object.assign(current,result);picker();render();$('#app-error').textContent='Solicitação enviada ao painel ADM. A contagem está bloqueada enquanto aguarda análise.';}
  catch(e){$('#app-error').textContent=e.message;}
  finally{$('#request-delete-session').disabled=false;}
}
async function resolveDeletion(approve){
  if(!user?.allStores||!current||activeDeletionReviewId!==current.id||current.deleteStatus!=='PENDENTE')return;
  const id=current.id;if(approve&&!confirm('Os produtos da contagem foram revisados? Aprovar excluirá a aba e removerá a contagem do Inventário.'))return;
  $('#approve-delete').disabled=true;$('#reject-delete').disabled=true;
  try{const result=(await api('resolveDelete',{id,approve,reason:$('#delete-review-reason').value.trim(),auditSession:await auditSession()})).data;
    if(approve){sessions=sessions.filter(item=>item.id!==id);localStorage.removeItem('tp-stockcount-draft-'+user.id+'-'+id);clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;activeDeletionReviewId=null;$('#app-error').textContent='Solicitação aprovada. A contagem e a aba no Drive foram excluídas.';}
    else{current=Object.assign(current,result);activeDeletionReviewId=null;$('#app-error').textContent='Solicitação recusada. A contagem foi liberada para a loja.';}
    picker();render();loadDeletionRequests();if(sessionsLoaded)loadSessions();
  }catch(e){$('#app-error').textContent=e.message;}
  finally{render();}
}
function draftKey(){return 'tp-stockcount-draft-'+user.id+'-'+current.id;}
function persistDraft(){try{localStorage.setItem(draftKey(),JSON.stringify({version:current.version,inflightId:retry?.body.requestId||null,counts:current.counts,defects:current.defects,zeroEans:current.zeroEans||[]}));}catch(_){sync('Não foi possível criar o rascunho local. Aguarde o Drive.','error');}}
function changed(){
  serial++;persistDraft();
  sync('Salvamento pendente…','pending');render();clearTimeout(timer);timer=setTimeout(flush,2000);
}
async function flush(){
  if(inflight)return inflight;
  if(!current||serial===saved||conflict)return;
  const target=current;
  retry=retry||{serial,body:{id:target.id,version:target.version,requestId:uuid(),counts:structuredClone(target.counts),defects:structuredClone(target.defects),zeroEans:target.zeroEans||[]}};
  const packet=retry;
  persistDraft();
  inflight=(async()=>{
    try{
      sync('Salvando no Google Drive…','pending');
      packet.body.auditSession=await auditSession();const response=await api('save',packet.body);target.version=response.data.version;target.updatedAt=response.data.updatedAt;
      saved=packet.serial;retry=null;
      if(serial===saved){localStorage.removeItem(draftKey());sync('Salvo no Google Drive');}
      else persistDraft();
    }catch(e){
      if(/sem permissão|não foi encontrada|original foi excluída|já não existe/.test(e.message)){clearTimeout(timer);if(current===target){current=null;serial=0;saved=0;retry=null;conflict=false;picker();render();}$('#app-error').textContent='Esta contagem foi excluída da planilha. O rascunho local foi preservado.';return;}
      conflict=e.status===409;
      sync(conflict?'Alterada em outro acesso. Reabra a contagem.':'Salvamento pendente. Tentaremos novamente.','error');note(e.message,true);render();
    }finally{inflight=null;if(serial!==saved&&!conflict)timer=setTimeout(flush,3000);}
  })();return inflight;
}
async function ensureSaved(){
  clearTimeout(timer);
  while(serial!==saved){
    const previous=saved;await flush();clearTimeout(timer);
    if(serial===saved)return;
    if(saved===previous)throw Error('Aguarde o salvamento no Google Drive antes de continuar.');
  }
}
async function openCount(id){
  if(!id)return;
  if(conflict){if(!confirm('Reabrir a versão do Drive? O rascunho deste navegador será preservado para conferência.'))return;clearTimeout(timer);}
  else await ensureSaved();
  const action=recounts.some(r=>r.id===id)||current?.id===id&&current.kind==='RECONTAGEM'?'openRecount':'read';
  current=(await api(action,{id})).data;recountPage=0;$('#recount-search').value='';serial=0;saved=0;retry=null;conflict=false;
  let restored=false;
  try{
    const draft=JSON.parse(localStorage.getItem(draftKey())||'null');
    const sameVersion=draft&&draft.version===current.version;
    const ownRetry=draft?.inflightId&&current.lastRequestId===draft.inflightId&&current.version===draft.version+1;
    if(draft&&(sameVersion||ownRetry)&&current.status!=='FINALIZADA'){current.counts=draft.counts;current.defects=draft.defects;current.zeroEans=draft.zeroEans||[];changed();restored=true;}
    else if(draft)note('Há um rascunho de outra versão neste navegador. A versão do Drive foi preservada.',true);
  }catch(_){}
  picker();render();if(!restored)sync(current.status==='FINALIZADA'?'Contagem finalizada no Drive':'Salvo no Google Drive');$('#ean-input').focus();
}
async function createCount(){
  $('#new-count').disabled=true;
  try{
    if(current){const previous=current;await ensureSaved();if(!previous.counts.length&&!previous.defects.length&&previous.kind!=='RECONTAGEM'){await api('discardEmpty',{id:previous.id});localStorage.removeItem('tp-stockcount-draft-'+user.id+'-'+previous.id);sessions=sessions.filter(s=>s.id!==previous.id);current=null;serial=0;saved=0;retry=null;conflict=false;}}
    const store=$('#store-code').value.trim().toUpperCase();
    if(!stores.includes(store))throw Error('Informe uma sigla de loja válida.');
    const date=$('#count-date').value;if(!date||!$('#count-date').checkValidity())throw Error('Selecione uma data válida para a contagem.');
    current=(await api('create',{store,date,auditSession:await auditSession()})).data;sessions.push(current);serial=0;saved=0;retry=null;conflict=false;
    picker();render();sync(current.shareUrl?'Nova contagem criada · link de acompanhamento disponível':'Nova contagem criada no Drive');if(current.shareError)note('Contagem criada, mas não foi possível gerar o link: '+current.shareError,true);$('#ean-input').focus();
  }catch(e){alert(e.message);}finally{$('#new-count').disabled=false;}
}
function addScan(ean,allowUnknown=false,origin='LEITOR / DIGITAÇÃO'){
  if(!current||current.status==='FINALIZADA'||conflict)return;
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===ean)){note('Este EAN não está na solicitação de recontagem.',true);return;}
  current.zeroEans=(current.zeroEans||[]).filter(e=>e!==ean);
  if(current.kind==='RECONTAGEM'){recountPage=Math.floor(current.targets.findIndex(r=>r.ean===ean)/80);$('#recount-search').value='';}
  const kind=mode==='count'?'counts':'defects',p=catalog.get(ean);
  let row=current[kind].find(r=>r.ean===ean);
  if(!row){row={ean,quantity:0,description:p?.description||'PRODUTO INEXISTENTE',brand:p?.brand||'NÃO CADASTRADA',unknown:allowUnknown,origin,lastScannedAt:new Date().toISOString()};current[kind].push(row);}else{row.origin=origin;row.lastScannedAt=new Date().toISOString();}
  row.quantity++;changed();note(row.description);$('#ean-input').value='';$('#ean-input').focus();
}
async function scan(origin='LEITOR / DIGITAÇÃO'){
  if(!current||current.status==='FINALIZADA'||conflict||lookingUp)return;
  const ean=$('#ean-input').value.trim();
  if(!/^\d{1,30}$/.test(ean)){note('Confira o EAN informado: use apenas números.',true);$('#ean-input').select();return;}
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===ean)){note('Este EAN não está na solicitação de recontagem.',true);$('#ean-input').select();return;}
  lookingUp=true;$('#catalog-status').textContent='Consultando EAN…';render();
  try{
    if(!catalog.has(ean)){
      const result=await api('catalog',{ean});
      const product=result.data;
      cacheCatalog(ean,product?{ean:String(product[0]),description:product[1],brand:product[2]}:null);
    }
    if(!catalog.get(ean)){unknown=ean;unknownOrigin=origin;$('#unknown-ean').textContent=ean;$('#unknown-dialog').showModal();return;}
    addScan(ean,false,origin);
  }catch(e){note(e.message||'Não foi possível consultar o cadastro.',true);}
  finally{lookingUp=false;$('#catalog-status').textContent='Cadastro do Drive · consulta por EAN';render();}
}
async function finishCount(){
  try{
    await ensureSaved();
    if(current.kind==='RECONTAGEM'){const included=new Set(current.counts.concat(current.defects).map(r=>r.ean).concat(current.zeroEans||[]));if(current.targets.some(r=>!included.has(r.ean)))throw Error('Bipe ou marque como não localizado cada EAN solicitado.');}
    const empty=current.kind!=='RECONTAGEM'&&!current.counts.length&&!current.defects.length,question=current.kind==='RECONTAGEM'?'Finalizar a recontagem? Os produtos solicitados serão atualizados na contagem original.':empty?'Esta contagem não tem produtos. Ao confirmar, sua aba será excluída automaticamente do Drive e do Inventário.':'Finalizar esta contagem? Ela aparecerá na análise e não receberá mais bipagens.';if(!confirm(question))return;
    const result=(await api('finish',{id:current.id,version:current.version,requestId:uuid(),counts:current.counts,defects:current.defects,zeroEans:current.zeroEans||[],auditSession:await auditSession()})).data;
    if(result.empty){sessions=sessions.filter(s=>s.id!==result.id);clearTimeout(timer);localStorage.removeItem(draftKey());current=null;serial=0;saved=0;retry=null;conflict=false;picker();render();sync('Contagem vazia excluída automaticamente');$('#app-error').textContent='A contagem sem produtos foi excluída do Drive e do Inventário.';return;}
    current=result;
    sessions=sessions.map(s=>s.id===current.id?current:s);picker();render();sync('Contagem finalizada no Google Drive');loadRecounts();
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
    const all=[];let offset=0,total=0;do{const r=await api('analysis',{filterStore:$('#filter-store').value,startDate:$('#filter-start').value,endDate:$('#filter-end').value,offset,limit:40});all.push(...r.data.data);total=r.data.total;offset=r.data.nextOffset??0;$('#analysis-status').textContent='Carregando contagens… '+all.length+' de '+total;}while(offset);
    const previousBrand=$('#filter-brand').value,brands=[...new Set(all.flatMap(s=>s.counts.concat(s.defects).map(item=>item.brand).filter(Boolean)))].sort();
    $('#filter-brand').innerHTML='<option value="">Todas as marcas</option>'+brands.map(b=>'<option>'+esc(b)+'</option>').join('');if(brands.includes(previousBrand))$('#filter-brand').value=previousBrand;
    const result=pivotAnalysis(all,$('#filter-brand').value);
    $('#analysis-head').innerHTML='<tr><th>LOJA</th><th>EAN</th><th>PRODUTO</th><th>MARCA</th>'+result.dates.map(d=>'<th>'+esc(d.split('-').reverse().join('/'))+'</th>').join('')+'</tr>';
    $('#analysis-body').innerHTML=result.rows.map(r=>'<tr><td>'+esc(r.store)+'</td><td>'+esc(r.ean)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.brand)+'</td>'+result.dates.map(d=>'<td class="'+(r.values[d]?'':'zero')+'">'+(r.values[d]||0)+'</td>').join('')+'</tr>').join('');
    $('#analysis-status').textContent=result.rows.length+' produtos · '+result.dates.length+' datas · '+all.length+' contagens consultadas. Última contagem finalizada de cada loja em cada data.';
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
function parseRecountTxt(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),result=[],seen=new Set(),invalid=[];
  lines.forEach((line,index)=>{const value=line.trim();if(!value)return;if(index===0&&/^(EAN|CÓDIGO|CODIGO)([;,\t]|$)/i.test(value))return;const ean=value.split(/[;,\t]/)[0].trim().replace(/^"|"$/g,'');if(!/^\d{1,30}$/.test(ean)){invalid.push(index+1);return;}if(!seen.has(ean)){seen.add(ean);result.push(ean);}});
  if(invalid.length)throw Error('Confira as linhas '+invalid.slice(0,8).join(', ')+'. Use um EAN por linha, sem descrição.');
  if(!result.length||result.length>40000)throw Error('O TXT deve conter entre 1 e 40.000 EANs.');return result;
}
function parseImportTxt(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),items=new Map(),invalid=[];
  lines.forEach((line,index)=>{const value=line.trim();if(!value)return;if(index===0&&/^(EAN|CÓDIGO|CODIGO)([,;\t]|$)/i.test(value))return;const parts=value.split(/[,;\t]/).map(v=>v.trim().replace(/^"|"$/g,''));const ean=parts[0]||'',quantity=Number(parts[1]);if(!/^\d{1,30}$/.test(ean)||parts.length!==2||!/^\d+$/.test(parts[1]||'')||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000){invalid.push(index+1);return;}const total=(items.get(ean)||0)+quantity;if(total>1000000){invalid.push(index+1);return;}items.set(ean,total);});
  if(invalid.length)throw Error('Revise as linhas '+invalid.slice(0,8).join(', ')+'. Use EAN,QNTDD, com quantidades inteiras positivas.');
  if(!items.size||items.size>40000)throw Error('O TXT deve conter entre 1 e 40.000 EANs.');return [...items].map(([ean,quantity])=>({ean,quantity}));
}
async function importFile(kind,input){
  const file=input.files?.[0];if(!file)return;input.value='';if(!current)throw Error('Crie ou abra uma contagem antes de importar.');if(file.size>3000000)throw Error('O TXT deve ter no máximo 3 MB.');
  const rows=parseImportTxt(await file.text());await ensureSaved();pendingImport={id:current.id,kind,rows,requestId:uuid()};$('#import-file-status').textContent='Validando '+rows.length+' EANs…';await sendImport(false);
}
async function sendImport(includeUnknown){
  if(!pendingImport||!current||pendingImport.id!==current.id)throw Error('A contagem mudou. Escolha o arquivo novamente.');
  const p=pendingImport;$('#import-confirm-unknown').disabled=true;
  try{
    const r=await api('importRows',{id:p.id,version:current.version,kind:p.kind,rows:p.rows,requestId:p.requestId,includeUnknown,auditSession:await auditSession()});
    if(r.data.requiresConfirmation){$('#import-unknown-list').textContent=r.data.unknown.slice(0,16).join(', ')+(r.data.unknownCount>16?' e mais '+(r.data.unknownCount-16):'');$('#import-unknown-count').textContent=r.data.unknownCount+' EAN(s) não constam no cadastro. Deseja lançar mesmo assim?';$('#import-unknown-dialog').showModal();window.dispatchEvent(new CustomEvent('tp-help',{detail:'inventory-import-unknown'}));return;}
    current=r.data;serial=0;saved=0;retry=null;conflict=false;localStorage.removeItem(draftKey());if(user.allStores)sessions=sessions.map(s=>s.id===current.id?current:s);render();picker();sync('Arquivo importado e salvo no Google Drive');note(p.rows.length+' linhas do arquivo importadas para '+(p.kind==='counts'?'Contagem':'Defeitos')+'.');pendingImport=null;$('#import-file-status').textContent='';
  }catch(e){if(e.status===409){conflict=true;render();}throw e;}finally{$('#import-confirm-unknown').disabled=false;}
}
async function importWithFeedback(kind,input){try{await importFile(kind,input);}catch(e){$('#import-file-status').textContent=e.message;}}
function loadZxing(){if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(zxingPromise)return zxingPromise;zxingPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../../shared/zxing-browser.min.js';s.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error('Leitor de câmera indisponível.'));s.onerror=()=>reject(Error('Não foi possível carregar o leitor local.'));document.head.append(s);});return zxingPromise;}
function stopCamera(close=true){cameraActive=false;if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=0;try{cameraControls?.stop();}catch(_){}cameraControls=null;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const video=$('#camera-video');if(video)video.srcObject=null;if(close&&$('#camera-dialog')?.open)$('#camera-dialog').close();}
async function cameraDetected(value){if(!cameraActive)return;const ean=String(value||'').replace(/\D/g,'');if(!/^\d{8,14}$/.test(ean))return;stopCamera();$('#ean-input').value=ean;await scan('CÂMERA');}
async function startCamera(){
  stopCamera(false);$('#camera-status').textContent='Solicitando acesso à câmera…';
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});const video=$('#camera-video');video.srcObject=cameraStream;await video.play();cameraActive=true;$('#camera-status').textContent='Aponte a câmera para o código de barras.';
    let detector=null,formats=[];if('BarcodeDetector'in window){try{formats=await BarcodeDetector.getSupportedFormats();const supported=['ean_13','ean_8','upc_a','upc_e'].filter(f=>formats.includes(f));if(supported.length)detector=new BarcodeDetector({formats:supported});}catch(_){}}
    if(detector){let busy=false,last=0;const tick=async now=>{if(!cameraActive)return;cameraFrame=requestAnimationFrame(tick);if(busy||now-last<220||video.readyState<2)return;last=now;busy=true;try{const found=await detector.detect(video);if(found.length)await cameraDetected(found[0].rawValue);}catch(_){}finally{busy=false;}};cameraFrame=requestAnimationFrame(tick);}
    else{const ZX=await loadZxing();if(!cameraActive)return;const Reader=ZX.BrowserMultiFormatOneDReader||ZX.BrowserMultiFormatReader,reader=new Reader();cameraControls=await reader.decodeFromVideoDevice(undefined,video,(result)=>{if(result&&cameraActive)cameraDetected(result.getText());});}
  }catch(e){stopCamera(false);$('#camera-status').textContent=e.name==='NotAllowedError'?'Permita o acesso à câmera nas configurações do Chrome e tente novamente.':e.name==='NotFoundError'?'Não encontramos uma câmera disponível neste dispositivo.':e.message||'Não foi possível iniciar a câmera.';}
}
async function loadRecounts(){
  if(!user||loadingRecounts)return;loadingRecounts=true;$('#refresh-recounts').disabled=true;$('#recount-inbox-status').textContent='Buscando solicitações…';
  try{const r=await api('recountInbox');recounts=r.data||[];if(current?.kind==='RECONTAGEM'&&current.status!=='FINALIZADA'&&!recounts.some(item=>item.id===current.id)){clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;picker();render();}$('#recount-inbox-list').innerHTML=recounts.map(r=>'<article class="recount-inbox-item"><div><strong>'+esc(r.store)+' · '+esc(r.label)+'</strong><span>Recontagem solicitada para esta contagem</span></div><button class="button button-primary" data-open-recount="'+esc(r.id)+'">ABRIR RECONTAGEM</button></article>').join('');$('#recount-inbox-status').textContent=recounts.length?recounts.length+' solicitação(ões) pendente(s).':'Nenhuma recontagem pendente.';}
  catch(e){$('#recount-inbox-status').textContent='Não foi possível buscar solicitações. Toque em Atualizar solicitações.';}
  finally{loadingRecounts=false;$('#refresh-recounts').disabled=false;}
}
function renderRecount(){
  const active=current?.kind==='RECONTAGEM';$('#recount-targets').hidden=!active;if(!active)return;
  const scanned=new Set(current.counts.concat(current.defects).map(r=>r.ean)),zeros=new Set(current.zeroEans||[]),included=current.targets.filter(r=>scanned.has(r.ean)||zeros.has(r.ean)).length,done=current.status==='FINALIZADA';
  $('#recount-progress').textContent=included+' de '+current.targets.length+' EANs incluídos';
  const query=$('#recount-search').value.trim().toLowerCase(),targets=query?current.targets.filter(r=>r.ean.includes(query)||r.description.toLowerCase().includes(query)):current.targets,pages=Math.max(1,Math.ceil(targets.length/80));recountPage=Math.max(0,Math.min(recountPage,pages-1));
  $('#recount-page').textContent='Página '+(recountPage+1)+' de '+pages;$('#recount-prev').disabled=recountPage===0;$('#recount-next').disabled=recountPage>=pages-1;
  $('#recount-target-list').innerHTML=targets.slice(recountPage*80,(recountPage+1)*80).map(r=>'<article class="recount-target '+(scanned.has(r.ean)||zeros.has(r.ean)?'included':'')+'"><div><strong>'+esc(r.ean)+'</strong><span>'+esc(r.description)+'</span><small>'+(scanned.has(r.ean)?'INCLUÍDO NA RECONTAGEM':zeros.has(r.ean)?'NÃO LOCALIZADO · 0':'AGUARDANDO BIPAGEM')+'</small></div>'+(!scanned.has(r.ean)?'<button type="button" class="button button-quiet" data-zero-ean="'+esc(r.ean)+'" '+(done||conflict?'disabled':'')+'>'+(zeros.has(r.ean)?'DESFAZER':'NÃO LOCALIZADO (0)')+'</button>':'')+'</article>').join('');
}
function requestRecountDialog(){
  const id=$('#session-picker').value,source=sessions.find(r=>r.id===id);if(!user?.allStores||!source||source.kind==='RECONTAGEM'||source.status!=='FINALIZADA')return;
  recountSourceId=id;$('#recount-source-label').textContent='LOJA '+source.store+' · '+source.label;$('#recount-file').value='';$('#recount-file-status').textContent='';$('#recount-dialog').showModal();
}
async function submitRecount(event){
  event.preventDefault();const file=$('#recount-file').files[0];if(!file)return;$('#send-recount').disabled=true;
  try{if(file.size>1500000)throw Error('O TXT deve ter no máximo 1,5 MB.');const eans=parseRecountTxt(await file.text());$('#recount-file-status').textContent='Enviando '+eans.length+' EANs…';const r=await api('requestRecount',{id:recountSourceId,eans,requestId:uuid(),auditSession:await auditSession()});sessions.push(r.data);$('#recount-dialog').close();picker();$('#app-error').textContent='Recontagem enviada para a loja '+r.data.store+'.';loadRecounts();}
  catch(e){$('#recount-file-status').textContent=e.message;}finally{$('#send-recount').disabled=false;}
}
function updateInventoryHelp(){
  const context=!user?'inventory-login':activeDeletionReviewId&&current?.id===activeDeletionReviewId?'inventory-delete-review':!$('#analysis-view').hidden?'inventory-analysis':current?.deleteStatus==='PENDENTE'?'inventory-delete-pending':current?.status==='FINALIZADA'?(current.kind==='RECONTAGEM'?'inventory-recount-finished':'inventory-finished'):current?.kind==='RECONTAGEM'?'inventory-recount':!current?(user.allStores?'inventory-admin-start':'inventory-start'):mode==='defects'?'inventory-defects':'inventory-count';
  window.dispatchEvent(new CustomEvent('tp-help',{detail:context}));
}
$('#recount-search').addEventListener('input',()=>{recountPage=0;renderRecount();});
$('#recount-prev').addEventListener('click',()=>{recountPage--;renderRecount();});
$('#recount-next').addEventListener('click',()=>{recountPage++;renderRecount();});
$('#register-gama').addEventListener('click',async()=>{
  if(!user?.allStores)return;$('#register-gama').disabled=true;
  try{const r=await fetch(BASE+'/functions/v1/register-gama-admin',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:'{}'});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Não foi possível liberar a loja.');$('#app-error').textContent='Acesso GAMA liberado. Login: GAMA. Senha: CNPJ da loja, somente números.';$('#register-gama').hidden=true;if(!stores.includes('GAMA')){stores.push('GAMA');stores.sort();$('#store-code').insertAdjacentHTML('beforeend','<option value="GAMA">GAMA</option>');$('#filter-store').insertAdjacentHTML('beforeend','<option value="GAMA">GAMA</option>');}}
  catch(e){$('#app-error').textContent=e.message;}finally{$('#register-gama').disabled=false;}
});
$('#request-recount').addEventListener('click',requestRecountDialog);
$('#recount-request-form').addEventListener('submit',submitRecount);
$('#cancel-recount').addEventListener('click',()=>$('#recount-dialog').close());
$('#refresh-recounts').addEventListener('click',loadRecounts);
$('#recount-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-open-recount]');if(b)openCount(b.dataset.openRecount).catch(e=>{$('#app-error').textContent=e.message;});});
$('#refresh-deletions').addEventListener('click',loadDeletionRequests);
$('#deletion-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-review-delete]');if(b)reviewDeletion(b.dataset.reviewDelete);});
$('#request-delete-session').addEventListener('click',requestDeletion);
$('#approve-delete').addEventListener('click',()=>resolveDeletion(true));$('#reject-delete').addEventListener('click',()=>resolveDeletion(false));
$('#recount-target-list').addEventListener('click',event=>{const b=event.target.closest('[data-zero-ean]');if(!b||!current||current.status==='FINALIZADA'||conflict)return;const ean=b.dataset.zeroEan;current.zeroEans=current.zeroEans||[];current.zeroEans=current.zeroEans.includes(ean)?current.zeroEans.filter(e=>e!==ean):current.zeroEans.concat(ean);changed();});
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
  try{await ensureSaved();if(current&&!current.counts.length&&!current.defects.length&&current.kind!=='RECONTAGEM'){await api('discardEmpty',{id:current.id});localStorage.removeItem(draftKey());}stopCamera();saveAuth(null);user=null;current=null;recounts=[];$('#recount-inbox-list').innerHTML='';updateInventoryHelp();$('#app-main').hidden=true;$('#login-panel').hidden=false;$('#logout').hidden=true;$('#account-label').textContent='ACESSO TENNIS PLACE';}catch(e){note(e.message,true);}
});
$('#share-count').addEventListener('click',async()=>{
  const selected=sessions.find(s=>s.id===$('#session-picker').value);if(!selected)return;
  $('#share-count').disabled=true;const original=$('#share-count').textContent;$('#share-count').textContent='GERANDO…';
  try{const response=await api('shareCreate',{id:selected.id,store:selected.store});selected.shareUrl=response.data.url;if(current?.id===selected.id)current.shareUrl=response.data.url;render();$('#share-count').textContent='LINK COPIADO';try{await navigator.clipboard.writeText(response.data.url);}catch(_){$('#share-link-value').focus();$('#share-link-value').select();}setTimeout(()=>{$('#share-count').textContent=original;},1800);}
  catch(e){note(e.message,true);$('#share-count').textContent=original;}finally{$('#share-count').disabled=false;}
});
$('#copy-share-link').addEventListener('click',async()=>{const value=$('#share-link-value').value;if(!value)return;try{await navigator.clipboard.writeText(value);$('#copy-share-link').textContent='LINK COPIADO';setTimeout(()=>$('#copy-share-link').textContent='COPIAR LINK',1600);}catch(_){$('#share-link-value').focus();$('#share-link-value').select();document.execCommand('copy');$('#copy-share-link').textContent='LINK COPIADO';}});
$('#new-count').addEventListener('click',createCount);
$('#session-picker').addEventListener('change',event=>openCount(event.target.value).catch(e=>note(e.message,true)));
$('#load-sessions').addEventListener('click',loadSessions);
$('#delete-session').addEventListener('click',deleteSession);
$('#scan-form').addEventListener('submit',event=>{event.preventDefault();scan();});
$('#import-count').addEventListener('click',()=>$('#import-count-file').click());$('#import-defects').addEventListener('click',()=>$('#import-defects-file').click());
$('#import-count-file').addEventListener('change',event=>importWithFeedback('counts',event.target));$('#import-defects-file').addEventListener('change',event=>importWithFeedback('defects',event.target));
$('#import-confirm-unknown').addEventListener('click',()=>{if($('#import-unknown-dialog').open)$('#import-unknown-dialog').close();sendImport(true).catch(e=>$('#import-file-status').textContent=e.message);});
$('#import-cancel-unknown').addEventListener('click',()=>{$('#import-unknown-dialog').close();pendingImport=null;$('#import-file-status').textContent='Importação cancelada para corrigir os EANs.';});
$('#import-unknown-dialog').addEventListener('close',()=>{$('#import-confirm-unknown').disabled=false;updateInventoryHelp();});
$('#open-camera').addEventListener('click',()=>{if(!current||current.status==='FINALIZADA')return;$('#camera-dialog').showModal();window.dispatchEvent(new CustomEvent('tp-help',{detail:'inventory-camera'}));startCamera();});
$('#camera-close').addEventListener('click',()=>stopCamera());$('#camera-dialog').addEventListener('close',()=>{stopCamera(false);updateInventoryHelp();});
$('#correct-ean').addEventListener('click',()=>{$('#unknown-dialog').close();unknown=null;$('#ean-input').focus();$('#ean-input').select();});
$('#allow-ean').addEventListener('click',()=>{$('#unknown-dialog').close();addScan(unknown,true,unknownOrigin);unknown=null;});
document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;updateInventoryHelp();document.querySelectorAll('.mode-button').forEach(x=>x.classList.toggle('active',x===b));$('#ean-input').focus();}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('click',event=>{
  const b=event.target.closest('[data-delta],[data-remove]');if(!b||!current||current.status==='FINALIZADA'||conflict)return;
  const list=current[b.dataset.kind],row=list.find(r=>r.ean===b.dataset.ean);if(!row)return;
  row.quantity=b.dataset.remove?0:row.quantity+Number(b.dataset.delta);row.origin='AJUSTE MANUAL';current[b.dataset.kind]=list.filter(r=>r.quantity>0);changed();
}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('change',event=>{
  const input=event.target.closest('[data-quantity]');if(!input||!current||current.status==='FINALIZADA'||conflict)return;
  const value=Number(input.value),list=current[input.dataset.list],row=list.find(r=>r.ean===input.dataset.ean);if(!row)return;
  if(!Number.isInteger(value)||value<1||value>1000000){input.value=String(row.quantity);note('Informe uma quantidade inteira entre 1 e 1.000.000.',true);return;}
  if(value!==row.quantity){row.quantity=value;row.origin='AJUSTE MANUAL';changed();}
}));
$('#reload-count').addEventListener('click',()=>openCount(current?.id).catch(e=>note(e.message,true)));
$('#finish-count').addEventListener('click',finishCount);$('#export-txt').addEventListener('click',exportCsv);$('#export-xlsx').addEventListener('click',exportExcel);
$('#analysis-filters').addEventListener('submit',analyze);
function showTab(analysis){$('#count-view').hidden=analysis;$('#analysis-view').hidden=!analysis;$('#tab-count').classList.toggle('active',!analysis);$('#tab-analysis').classList.toggle('active',analysis);updateInventoryHelp();}
$('#tab-count').addEventListener('click',()=>showTab(false));$('#tab-analysis').addEventListener('click',()=>{showTab(true);analyze();});
window.addEventListener('pagehide',()=>{stopCamera(false);if(current&&!current.counts.length&&!current.defects.length&&current.kind!=='RECONTAGEM'&&auth?.access_token){const headers={'apikey':KEY,'Authorization':'Bearer '+auth.access_token,'Content-Type':'application/json'};fetch(BASE+'/functions/v1/stockcount-api',{method:'POST',headers,body:JSON.stringify({action:'discardEmpty',id:current.id}),keepalive:true}).catch(()=>{});}});
window.addEventListener('beforeunload',event=>{if(serial!==saved&&!(current&&!current.counts.length&&!current.defects.length)){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>flush());
let lastReturnCheck=0;
async function refreshAfterReturn(){
 if(document.hidden||!user||Date.now()-lastReturnCheck<1500)return;lastReturnCheck=Date.now();
 if(user.allStores&&!$('#analysis-view').hidden)analyze();
 if(user.allStores&&(sessionsLoaded||current))loadSessions();
 else if(current&&current.kind!=='RECONTAGEM'){
  const target=current;
  try{const result=await api('checkCount',{id:target.id});if(!result.data.exists&&current===target){clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;picker();render();$('#app-error').textContent='Esta contagem foi excluída da planilha e removida do Inventário.';}}catch(_){}
 }
 loadRecounts();
}
document.addEventListener('visibilitychange',refreshAfterReturn);window.addEventListener('focus',refreshAfterReturn);
window.tpPrepareClose=ensureSaved;
try{auth=JSON.parse(sessionStorage.getItem(AUTH_KEY)||'null');}catch(_){}
if(auth?.access_token)boot().catch(e=>{$('#login-error').textContent=e.message;$('#app-error').textContent=e.message;});
