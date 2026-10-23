Warning: truncated output (original token count: 21479)
Total output lines: 727

'use strict';
const $=s=>document.querySelector(s),BASE='https://rihvnshexilakojnltox.supabase.co',KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz',AUTH_KEY='tp-manuais-supabase-v1';
let auth=null,user=null,stores=[],sessions=[],sessionsLoaded=false,loadingSessions=false,historyStoreFilter='',current=null,catalog=new Map(),mode='count',unknown=null,lookingUp=false;
let inventoryHome=false,openingCount=false,cameraCandidate=null,cameraLookup=false,cameraGeneration=0,cameraLastEan='',cameraLastAt=0,cameraFallbackStarted=false,scanAudio=null;
let analysisCache=null,analysisRequest=0,subgroupCatalogReady=false;
let teamScope='own',teamBusy=false,teamListBusy=false,teamLockId=null,teamUnlock=null;
let serial=0,saved=0,inflight=null,timer=null,retry=null,conflict=false,xlsxPromise,recounts=[],loadingRecounts=false,recountSourceId=null,recountPage=0,pendingImport=null,cameraStream=null,cameraControls=null,cameraFrame=0,cameraActive=false,zxingPromise=null,deletionRequests=[],loadingDeletions=false,activeDeletionReviewId=null,unknownOrigin='LEITOR / DIGITAÇÃO',auditSessionPromise=null;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function note(s,error=false){$('#scan-message').textContent=s;$('#scan-message').className='scan-message '+(error?'error':'success');}
function sync(s,type=''){$('#sync-status').textContent=s;$('#sync-status').className='sync-status '+type;}
let localWrites=0,localRepair=false;
let localReady=false,shellReady=false,catalogComplete=false,catalogUpdated='',localError='',preparingOffline=null,deviceProfile=null;
const listPage={counts:0,defects:0},PAGE_SIZE=100;
function validResponsible(value){const name=String(value||'').trim().normalize('NFC');return name.length<=80&&/^[\p{L} ]+$/u.test(name)&&Array.from(name.replace(/ /g,'')).length>=4;}
function readResponsible(){const input=$('#count-responsible'),name=input.value.trim().normalize('NFC');input.setCustomValidity(validResponsible(name)?'':'Informe pelo menos 4 letras, sem números.');if(!input.reportValidity())throw Error('RESPONSÁVEL: informe pelo menos 4 letras, sem números.');input.value=name;return name;}
function editableTeam(){
 if(!current||current.status==='FINALIZADA'||current.localFinished||current.deleteStatus==='PENDENTE'||current.collabReadOnly||current.collabViewOnly||current.collaborative&&teamScope==='total')return false;
 if(!current.responsible){try{current.responsible=readResponsible();}catch(e){note(e.message,true);return false;}}return true;
}
function releaseTeamLock(){teamUnlock?.();teamUnlock=null;teamLockId=null;}
async function activateTeamLock(){
 const target=current;if(!target?.collaborative||target.collabViewOnly){releaseTeamLock();return;}
 $('#count-responsible').value=target.responsible||'';
 const key='tp-inventory-edit:'+user.id+':'+target.id;
 if(teamLockId===key){target.collabReadOnly=false;return;}
 releaseTeamLock();target.collabReadOnly=true;
 if(!navigator.locks){note('Use o Chrome atualizado para lançar com proteção entre abas. A exportação continua disponível.',true);return;}
 await new Promise(resolve=>{
  navigator.locks.request(key,{ifAvailable:true},async lock=>{
   if(!lock){resolve();return;}
   if(current!==target){resolve();return;}
   teamLockId=key;target.collabReadOnly=false;
   await new Promise(release=>{teamUnlock=release;resolve();});
  }).catch(()=>resolve());
 });
}
function mergeTeamRows(others,mine,name){
 const map=new Map();for(const row of others||[])map.set(row.ean,{...row});
 for(const row of mine||[]){const old=map.get(row.ean),names=new Set(String(old?.responsible||'').split(', ').filter(Boolean));if(name)names.add(name);
  const latest=old&&String(old.lastScannedAt||'')>String(row.lastScannedAt||'')?old:row;
  map.set(row.ean,{...latest,quantity:(old?.quantity||0)+row.quantity,responsible:[...names].join(', ')});
 }return [...map.values()];
}
function subgroupOf(row){return row.subgroup||catalog.get(row.ean)?.subgroup||'';}
function withSubgroups(state){return {...state,counts:(state.counts||[]).map(r=>({...r,subgroup:subgroupOf(r)})),defects:(state.defects||[]).map(r=>({...r,subgroup:subgroupOf(r)}))};}
function teamExportState(){
 if(!current)return null;if(!current.collaborative||current.collabViewOnly)return withSubgroups(current);if(current.status==='FINALIZADA'&&current.finalTotals)return withSubgroups({...current,...current.finalTotals});
 return withSubgroups({...current,counts:mergeTeamRows(current.peers?.counts,current.counts,current.responsible),defects:mergeTeamRows(current.peers?.defects,current.defects,current.responsible)});
}
function warnTeamExport(){if(current?.collaborative){const text='Arquivo com seus lançamentos locais e a última soma recebida dos demais responsáveis. Aparelhos sem sincronizar ainda podem ter produtos pendentes.';note(text,!navigator.onLine);}}
function applyTeamResult(target,remote){
 for(const k of ['peers','finalTotals','participants','participantVersion','participantDone','version','status','updatedAt','mirroredVersion','mirrorError','deleteStatus'])if(remote[k]!==undefined)target[k]=remote[k];
 if(remote.participantDone)target.localFinished=true;target.teamFetchedAt=new Date().toISOString();
}
function renderTeam(){
 const active=!!current?.collaborative;
 $('#team-panel').hidden=!active;$('#team-open').hidden=false;
 $('#count-responsible').readOnly=active&&!inventoryHome;
 if(!active)return;
 $('#team-who').textContent=current.collabViewOnly?'Total da contagem · somente consulta':'RESPONSÁVEL: '+current.responsible;
 const when=current.teamFetchedAt?new Date(current.teamFetchedAt).toLocaleTimeString('pt-BR'):null;
 $('#team-state').textContent=current.collabReadOnly?'Outra aba deste aparelho está usando esta contagem. Feche-a e reabra aqui.':current.collabViewOnly?'Consulta administrativa. Os participantes alteram somente a própria parte.':
  (teamScope==='total'?'TOTAL · somente consulta. ':'MINHA PARTE · edite apenas o que você contou. ')+(when?'Última soma recebida às '+when+'. ':'')+(current.mirroredVersion<current.version?'Planilha aguardando espelhamento; dados recebidos no servidor.':'Planilha atualizada.');
 $('#team-people').innerHTML=(current.participants||[]).map(p=>'<div class="team-person"><strong>'+esc(p.responsible)+'</strong> · '+(p.done?'PARTE FINALIZADA':'CONTANDO / AGUARDANDO FINALIZAÇÃO')+' · '+Number(p.units||0)+' unidades · '+Number(p.defects||0)+' defeitos<br><span>Último envio: '+esc(new Date(p.updatedAt).toLocaleString('pt-BR'))+' · '+esc(p.device||'Dispositivo não informado')+' · '+esc(p.ip||'IP não capturado')+'</span></div>').join('');
 $('#team-own').disabled=!!current.collabViewOnly;$('#team-total').disabled=false;$('#team-own-export').hidden=!!current.collabViewOnly;
}
async function loadTeamCounts(){
 if(!auth||!user||!navigator.onLine||teamListBusy)return;teamListBusy=true;
 try{const r=await api('teamList',{store:$('#store-code').value||undefined});const counts=r.data||[];
  $('#team-open-list').innerHTML=counts.map(c=>'<article class="recount-inbox-item"><div><strong>'+esc(c.label)+'</strong><span>'+esc(c.date)+' · '+(c.deleteStatus==='PENDENTE'?'EXCLUSÃO SOLICITADA':'CONTAGEM EM EQUIPE')+' · '+(c.participants||[]).map(p=>esc(p.responsible)+(p.done?' ✓':'')).join(', ')+'</span></div><button class="button button-primary" type="button" data-team-join="'+esc(c.id)+'" '+(c.deleteStatus==='PENDENTE'?'disabled':'')+'>CONTINUAR</button></article>').join('');
  $('#team-open-status').textContent=counts.length?'Contagens sincronizadas da loja. O responsável salvo neste aparelho já fica preenchido.':'Nenhuma contagem em equipe em andamento nesta loja. Crie uma nova acima.';
 }catch(e){$('#team-open-status').textContent=e.message;}finally{teamListBusy=false;}
}
async function joinTeamCount(id){
 if(openingCount)return;stopCamera();const responsible=readResponsible();if(!navigator.onLine)throw Error('Conecte à internet para entrar pela primeira vez.');
 openingCount=true;
 try{
  await persistDraft();await TPInventoryLocal.drain();if(inflight)await inflight;
  const local=await TPInventoryLocal.restore(user.id,id);
  if(local?.collaborative){
   if(local.responsible!==responsible)throw Error('Este aparelho já tem a parte de '+local.responsible+'. Continue com esse nome e preserve seus lançamentos.');
   clearTimeout(timer);timer=null;adoptLocal(local);await activateTeamLock();inventoryHome=false;teamScope='own';render();picker();if(!current.collabReadOnly){await flush();await refreshTeam();}return;
  }
  const pendingKey='team-joining:'+user.id+':'+id,prior=await TPInventoryLocal.read('settings',pendingKey);
  if(prior&&prior.responsible!==responsible)throw Error('Este aparelho iniciou uma participação com '+prior.responsible+'. Use esse nome para recuperá-la.');
  const participantId=prior?.participantId||uuid();await TPInventoryLocal.setting(pendingKey,{participantId,responsible});const remote=(await api('teamJoin',{id,participantId,responsible,auditSession:await auditSession()})).data;
  clearTimeout(timer);timer=null;current=remote;serial=0;saved=0;retry=null;conflict=false;inventoryHome=false;teamScope='own';
  await activateTeamLock();await TPInventoryLocal.setting('responsible:'+user.id,responsible);await persistDraft();await TPInventoryLocal.setting(pendingKey,null);picker();render();$('#ean-input').focus();
 }finally{openingCount=false;}
}
async function refreshTeam(){
 const target=current;if(!target?.collaborative||teamBusy||!navigator.onLine||!auth||document.hidden)return;
 teamBusy=true;try{
  const r=await api(target.collabViewOnly?'read':'teamRead',{id:target.id,...(!target.collabViewOnly?{participantId:target.participantId}:{})});if(current!==target)return;
  const remote=r.data;
  if(target.collabViewOnly){current=remote;render();return;}
  // A retry may have been committed while its HTTP response was lost. Replay its ID in flush.
  const clean=serial===saved&&!retry&&!inflight;
  const prevVersion=target.participantVersion;
  const ownKeys={participantVersion:target.participantVersion,participantDone:target.participantDone};applyTeamResult(target,remote);
  if(!clean){target.participantVersion=ownKeys.participantVersion;target.participantDone=ownKeys.participantDone;}
  else if(remote.participantVersion!==prevVersion){target.counts=remote.counts;target.defects=remote.defects;}
  await persistDraft();
  // Background updates must not replace a quantity input currently being edited.
  if(!document.activeElement?.matches?.('.quantity-input'))render();else renderTeam();
 }catch(e){if(current===target){$('#team-state').textContent='Sem atualização dos demais responsáveis. Seus lançamentos e arquivos locais continuam disponíveis.';if(e.status===403||/já não existe/.test(e.message))remoteUnavailable(e.message);}}
 finally{teamBusy=false;}
}

function cacheCatalog(ean,value){catalog.set(ean,value);}
function restoreCatalog(){} // The durable catalogue is restored asynchronously from IndexedDB.
// Short oscillator tones need no audio files or network requests.
function unlockScanAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;scanAudio=scanAudio||new Audio();if(scanAudio.state==='suspended')scanAudio.resume().catch(()=>{});}catch(_){}}
function scanSound(positive){try{unlockScanAudio();if(!scanAudio||scanAudio.state!=='running')return;if(scanSound.active){try{scanSound.active.stop();}catch(_){}}const t=scanAudio.currentTime,osc=scanAudio.createOscillator(),gain=scanAudio.createGain(),pulses=positive?[[0,.10,1500],[.13,.10,2100]]:[[0,.14,950],[.19,.14,650],[.38,.14,950]];osc.type='square';gain.gain.setValueAtTime(0,t);for(const [offset,duration,frequency] of pulses){const start=t+offset,end=start+duration;osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+.004);gain.gain.setValueAtTime(1,end-.006);gain.gain.linearRampToValueAtTime(0,end);}osc.connect(gain);gain.connect(scanAudio.destination);scanSound.active=osc;osc.start(t);const last=pulses[pulses.length-1];osc.stop(t+last[0]+last[1]+.01);osc.onended=()=>{if(scanSound.active===osc)scanSound.active=null;osc.disconnect();gain.disconnect();};}catch(_){}}
document.addEventListener('pointerdown',unlockScanAudio,{passive:true});document.addEventListener('keydown',unlockScanAudio,{passive:true});
function showUnknown(ean,origin,reason){
 const previous=current.counts.concat(current.defects).find(r=>r.ean===ean&&r.unknown);
 unknown=ean;unknownOrigin=origin;$('#unknown-ean').textContent=ean;$('#unknown-reason').textContent=reason;
 $('#unknown-description').value=previous?.description==='PRODUTO INEXISTENTE'?'':previous?.description||'';
 $('#unknown-brand').value=previous?.brand==='NÃO CADASTRADA'?'':previous?.brand||'';
 scanSound(false);$('#unknown-dialog').showModal();
}
async function showInventoryHome(){
 stopCamera();await persistDraft();await TPInventoryLocal.drain();inventoryHome=true;loadTeamCounts();$('#recount-inbox').hidden=false;render();await renderDeviceDrafts();
 $('#count-view').scrollIntoView({block:'start'});if(navigator.onLine&&auth)loadRecounts();
}
async function renderDeviceDrafts(){
 const list=await TPInventoryLocal.list(user.id);const drafts=list.filter(r=>r.status!=='FINALIZADA'||r.serial!==r.saved);
 $('#device-drafts').hidden=!inventoryHome||!drafts.length;
 $('#device-draft-list').innerHTML=drafts.map(r=>'<article class="recount-inbox-item"><div><strong>'+esc(r.label)+'</strong><span>'+(r.serial!==r.saved?'Há dados locais aguardando envio':'Contagem em andamento neste dispositivo')+'</span></div><button class="button button-primary" data-resume-draft="'+esc(r.id)+'">CONTINUAR</button></article>').join('');
}
async function resumeDeviceDraft(id){
 if(openingCount)return;openingCount=true;
 try{await persistDraft();await TPInventoryLocal.drain();if(inflight)await inflight;const record=await TPInventoryLocal.restore(user.id,id);if(!record)throw Error('Cópia local não encontrada.');clearTimeout(timer);timer=null;adoptLocal(record);await activateTeamLock();inventoryHome=false;picker();render();sync(serial!==saved?'Salvo neste dispositivo · envio pendente':'Contagem recuperada deste dispositivo',serial!==saved?'pending':'');if(navigator.onLine&&auth){flush();validateActiveCount();}}
 finally{openingCount=false;}
}
function updateOfflineStatus(){
 const box=$('#offline-status');if(!box)return;
 box.textContent=localError?'ATENÇÃO: '+localError:!navigator.onLine?'Sem conexão — '+(localReady?'bipagens salvas neste dispositivo.':'aguarde a preparação local.'):(localReady&&shellReady&&catalogComplete?'Pronto para contar sem internet.':'Preparando uso sem internet…');
 if(current&&serial!==saved)box.textContent+=' '+Math.max(0,serial-saved)+' alteração(ões) aguardando sincronização.';
 if(current?.localFinished&&current.status!=='FINALIZADA')box.textContent+=current.collaborative&&current.participantDone?' Sua parte foi recebida; aguardando os demais responsáveis.':' Finalizada neste dispositivo; envio pendente.';
 box.className='offline-status'+(localError?' error':!navigator.onLine||serial!==saved?' pending':'');
 $('#prepare-offline').disabled=!!preparingOffline;
 if(catalogUpdated)$('#catalog-status').textContent='Cadastro neste dispositivo · '+new Date(catalogUpdated).toLocaleString('pt-BR');
}
async function loadLocalCatalog(){
 await TPInventoryLocal.ready();localReady=true;const cached=await TPInventoryLocal.read('settings','catalog');
 if(cached?.rows?.length){subgroupCatalogReady=cached.rows.some(row=>row.length>3);catalog.clear();for(const row of cached.rows)catalog.set(String(row[0]),{ean:String(row[0]),description:row[1],brand:row[2],subgroup:row[3]||''});catalogComplete=true;catalogUpdated=cached.updated;}
}
async function prepareShell(){
 try{if(!('serviceWorker'in navigator))throw Error('Este navegador não permite reabrir a página sem internet.');
 await navigator.serviceWorker.register('../../sw.js',{scope:'../../'});
 await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Não foi possível preparar a reabertura offline. Tente novamente com internet.')),30000))]);shellReady=true;
 }catch(e){localError=e.message;}updateOfflineStatus();
}
async function prepareOffline(){
 if(preparingOffline)return preparingOffline;
 preparingOffline=(async()=>{try{
  await loadLocalCatalog();localError='';
  if(navigator.onLine&&auth){const result=await api('catalog');const rows=result.data;if(!Array.isArray(rows)||!rows.length)throw Error('Cadastro vazio. Tente preparar novamente.');
   await TPInventoryLocal.setting('catalog',{rows,updated:new Date().toISOString()});subgroupCatalogReady=rows.some(row=>row.length>3);catalog.clear();for(const row of rows)catalog.set(String(row[0]),{ean:String(row[0]),description:row[1],brand:row[2],subgroup:row[3]||''});catalogComplete=true;catalogUpdated=new Date().toISOString();
  }
  if(!catalogComplete)throw Error('Cadastro ainda não preparado. É possível lançar EANs e exportar; confira os produtos quando a conexão voltar.');
  await prepareShell();try{await navigator.storage?.persist?.();}catch(_){}
 }catch(e){localError=e.message||'Não foi possível preparar o armazenamento local.';}finally{preparingOffline=null;updateOfflineStatus();}})();updateOfflineStatus();return preparingOffline;
}
async function localCheckpoint(hint){
 if(!current||!user||current.collaborative&&(current.collabReadOnly||current.collabViewOnly))return;
 if(localRepair)hint=undefined;
 localWrites++;try{await TPInventoryLocal.save(user.id,current,{serial,saved,...(!hint?{retry}:{}),localUpdatedAt:new Date().toISOString()},hint);localReady=true;if(!hint)localRepair=false;if(!localRepair)localError='';}
 catch(e){localRepair=true;localError='Não foi possível salvar no dispositivo. Baixe o arquivo agora. '+(e.message||'');}
 localWrites--;updateOfflineStatus();
}
function adoptLocal(record){
 current={...record};for(const key of ['serial','saved','retry','owner','localUpdatedAt'])delete current[key];serial=record.serial||0;saved=record.saved||0;retry=record.retry||null;conflict=!!record.orphaned;listPage.counts=Math.max(0,Math.ceil(current.counts.length/PAGE_SIZE)-1);listPage.defects=Math.max(0,Math.ceil(current.defects.length/PAGE_SIZE)-1);
}
async function recoverLocal(){
 const profile=await TPInventoryLocal.read('settings','profile');if(!profile?.enabled)return false;
 if(auth?.access_token){try{const payload=JSON.parse(atob(auth.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.sub!==profile.user.id)return false;}catch(_){return false;}}
 const record=await TPInventoryLocal.restore(profile.user.id);if(!record)return false;
 user=profile.user;stores=profile.stores;deviceProfile=profile;adoptLocal(record);await activateTeamLock();displayAccount();picker();render();sync('Contagem recuperada deste dispositivo',serial!==saved?'pending':'');updateOfflineStatus();return true;
}
async function initializeDevice(){
 try{await loadLocalCatalog();deviceProfile=await TPInventoryLocal.read('settings','profile');const record=deviceProfile?.enabled?await TPInventoryLocal.restore(deviceProfile.user.id):null;
 $('#recover-local').hidden=!record;if(record)$('#recover-local').textContent='RETOMAR '+record.label+' DESTE DISPOSITIVO';
 }catch(e){localError='Armazenamento local indisponível. '+(e.message||'');}updateOfflineStatus();prepareShell();
}
function remoteUnavailable(message){
 conflict=true;if(current)current.orphaned=true;sync(message+' Cópia local preservada para exportar.','error');note(message,true);render();localCheckpoint();
}
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
  const r=await fetch(BASE+'/functions/v1/stockcount-api',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+auth?.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...params}),signal:AbortSignal.timeout(action==='catalog'&&!params.ean?90000:action==='catalog'?4500:action==='bootstrap'?12000:60000)});
  if(r.status===401&&!again){await refresh();return api(action,params,true);}
  const data=await r.json();if(!r.ok){const e=Error(data.error||'Falha de comunicação.');e.status=r.status;throw e;}return data;
}
function picker(){
  $('#session-picker-wrap').hidden=!(user?.allStores||user?.multiStore);
  const filter=$('#history-store-filter');
  if(filter){filter.hidden=!(user?.allStores||user?.multiStore);filter.value=historyStoreFilter||'';}
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
  const compactCounting=!!current&&!inventoryHome&&$('#analysis-view').hidden;
  document.body?.classList.toggle('is-counting',compactCounting);
  if(document.body)document.body.dataset.countMode=mode;
  $('#count-options-toggle').hidden=!compactCounting;
  if(!compactCounting){document.body?.classList.remove('count-options-open');$('#count-options-toggle').setAttribute?.('aria-expanded','false');$('#count-options-toggle').textContent='OPÇÕES';}

  $('#empty-state').hidden=!!current&&!inventoryHome;$('#counting').hidden=!current||inventoryHome;$('#back-inventory-home').hidden=!current||inventoryHome;$('#device-drafts').hidden=!inventoryHome;$('#counting').dataset.localFinished=String(!!current?.localFinished&&current.status!=='FINALIZADA');$('#share-link-panel').hidden=inventoryHome||!(current&&current.shareUrl);if(current?.shareUrl)$('#share-link-value').value=current.shareUrl;renderRecount();updateInventoryHelp();if(!current){renderTeam();$('#delete-review-actions').hidden=true;$('#request-delete-session').hidden=true;return;}
  renderTeam();$('#export-xlsx').textContent=current.collaborative?'BAIXAR EXCEL CONSOLIDADO':'BAIXAR PLANILHA EXCEL';$('#session-title').textContent=current.label;
  $('#reload-count').hidden=!user?.allStores&&current.kind!=='RECONTAGEM';
  const view=current.collaborative&&teamScope==='total'?teamExportState():current,counts=view.counts,defects=view.defects,done=current.status==='FINALIZADA'||current.localFinished||current.collabViewOnly||current.collabReadOnly||current.collaborative&&teamScope==='total',deletePending=current.deleteStatus==='PENDENTE';
  $('#count-total').textContent=(current.collaborative?teamExportState().counts:counts).reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#defect-total').textContent=(current.collaborative?teamExportState().defects:defects).reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#count-rows').textContent=counts.length+' ITENS';$('#defect-rows').textContent=defects.length+' ITENS';
  $('#count-empty').hidden=!!counts.length;$('#defect-empty').hidden=!!defects.length;
  function table(rows,kind){listPage[kind]=Math.min(listPage[kind],Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1));return rows.slice(listPage[kind]*PAGE_SIZE,(listPage[kind]+1)*PAGE_SIZE).map(r=>'<tr><td>'+esc(r.ean)+'</td><td><span class="product-name">'+esc(r.description)+'</span><span class="mobile-ean">'+esc(r.ean)+'</span><span class="mobile-subgroup">'+esc(subgroupOf(r)||'Não informado')+'</span>'+(r.unknown?'<span class="product-sub">Lançado mesmo assim</span>':'')+'</td><td>'+esc(r.brand)+'</td><td>'+esc(subgroupOf(r)||'Não informado')+'</td><td><div class="qty-actions"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="-1" aria-label="Diminuir">−</button><input class="quantity-input" type="number" min="1" max="1000000" step="1" inputmode="numeric" value="'+r.quantity+'" data-quantity="1" data-list="'+kind+'" data-ean="'+esc(r.ean)+'" aria-label="Quantidade"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="1" aria-label="Aumentar">+</button></div></td><td><button type="button" class="remove-row" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-remove="1" aria-label="Remover">×</button></td></tr>').join('');}
  $('#count-body').innerHTML=table(counts,'counts');$('#defect-body').innerHTML=table(defects,'defects');
  for(const kind of ['counts','defects']){const pages=Math.max(1,Math.ceil(view[kind].length/PAGE_SIZE));$('#'+kind+'-page').textContent=(listPage[kind]+1)+' / '+pages;$('#'+kind+'-prev').disabled=listPage[kind]===0;$('#'+kind+'-next').disabled=listPage[kind]>=pages-1;}
  $('#ean-input').disabled=done||lookingUp||deletePending;
  ['#open-camera','#import-count','#import-defects'].forEach(id=>{if($(id))$(id).disabled=done||deletePending;});
  $('#finish-count').disabled=current.status==='FINALIZADA'||current.localFinished||current.collabViewOnly||current.collabReadOnly||deletePending;$('#finish-count').textContent=done?(current.localFinished&&current.status!=='FINALIZADA'?'FINALIZADA · ENVIO PENDENTE':'CONTAGEM FINALIZADA'):deletePending?'AGUARDANDO ADM':'FINALIZAR CONTAGEM';
  if(current.collaborative)$('#finish-count').textContent=current.participantDone?'MINHA PARTE FINALIZADA':current.localFinished?'FINALIZADA · ENVIO PENDENTE':current.status==='FINALIZADA'?'CONTAGEM FINALIZADA':'FINALIZAR MINHA PARTE';
  $('#delete-pending-status').hidden=!deletePending;
  $('#request-delete-session').hidden=!!user?.allStores||deletePending;$('#request-delete-session').disabled=deletePending||!!current.collabReadOnly||!!current.collabViewOnly;
  document.querySelectorAll('.qty-actions button,.quantity-input,.remove-row').forEach(b=>b.disabled=done||deletePending);
  const review=activeDeletionReviewId===current.id&&user?.allStores&&current.deleteStatus==='PENDENTE';$('#delete-review-actions').hidden=!review;
  updateOfflineStatus();
  if(review)$('#delete-review-summary').textContent=counts.length+' produtos na contagem · '+defects.length+' produtos com defeito · '+counts.reduce((n,r)=>n+r.quantity,0)+' unidades contadas · '+defects.reduce((n,r)=>n+r.quantity,0)+' unidades com defeito.';
  $('#approve-delete').disabled=!review||loadingDeletions;$('#reject-delete').disabled=!review||loadingDeletions;
}
function displayAccount(){
  $('#login-panel').hidden=true;$('#app-main').hidden=false;$('#logout').hidden=false;
  $('#account-label').textContent=user.allStores?'ACESSO ADMINISTRATIVO':user.multiStore?'ACESSO A VÁRIAS LOJAS':user.store;
  $('#store-code').innerHTML=((user.allStores||user.multiStore)?'<option value="">Selecione a loja</option>':'')+stores.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');$('#store-code').value=user.store||'';$('#store-code').disabled=!user.allStores&&!user.multiStore;$('#count-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('#tab-analysis').hidden=!user.allStores;
  const today=$('#count-date').value,from=new Date(today+'T12:00:00-03:00');from.setDate(from.getDate()-89);$('#filter-end').value=today;$('#filter-start').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(from);
  $('#filter-store').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option>'+esc(s)+'</option>').join('');
  $('#history-store-filter').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 $('#count-responsible').value=current?.responsible||$('#count-responsible').value;
 $('#filter-brand').innerHTML='<option value="">Todas as marcas</option>';$('#register-gama').hidden=!user.allStores||stores.includes('GAMA');
}
async function boot(){
 const r=await api('bootstrap');user=r.user;stores=r.stores;sessions=[];sessionsLoaded=false;auditSession();
 await loadLocalCatalog().catch(e=>{localError=e.message;});
 await TPInventoryLocal.setting('profile',{user,stores,enabled:true}).catch(()=>{});displayAccount();
 const cached=await TPInventoryLocal.restore(user.id).catch(()=>null);if(cached){adoptLocal(cached);await activateTeamLock();}const priorName=await TPInventoryLocal.read('settings','responsible:'+user.id);if(!$('#count-responsible').value&&priorName)$('#count-responsible').value=priorName;loadTeamCounts();
 picker();render();if(user.allStores||user.multiStore)loadSessions();$('#recount-inbox').hidden=false;loadRecounts();$('#deletion-inbox').hidden=!user.allStores;if(user.allStores)loadDeletionRequests();
 prepareOffline();if(current&&serial!==saved)flush();if(current)validateActiveCount();
}
async function validateActiveCount(){
 const target=current;if(!target||!navigator.onLine||!auth)return;
 try{const r=await api('checkCount',{id:target.id});if(r.data.exists||current!==target)return;
  if(serial!==saved&&!(target.localFinished&&!target.counts.length&&!target.defects.length)){remoteUnavailable('Esta contagem foi excluída da planilha.');return;}
  await TPInventoryLocal.remove(user.id,target.id);current=null;retry=null;serial=0;saved=0;picker();render();$('#app-error').textContent='Esta contagem foi excluída da planilha e removida do Inventário.';
 }catch(_){}
}
async function loadSessions(){
  if(!user?.allStores&&!user?.multiStore)return;
  if(loadingSessions)return;
  loadingSessions=true;picker();
  try{
    const r=a…5479 tokens truncated…oard').setAttribute?.('aria-busy','false');}
}
function imports(){const state=teamExportState();warnTeamExport();return state.defects.concat(state.counts).map(r=>({EAN:r.ean,QNTD:r.quantity,'CÓDIGO IMPORTAÇÃO':r.ean+','+r.quantity}));}
function exportCsv(){
  if(!current)return;const blob=new Blob([imports().map(r=>r.EAN+','+r.QNTD).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=window.URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='IMPORTACAO_'+current.label+'.csv';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);
}
async function exportExcel(){
 try{if(current){warnTeamExport();TPInventoryExport.download(TPInventoryExport.workbook(teamExportState()),current.label+'.xlsx');}}catch(e){note('Não foi possível gerar o Excel. Baixe os arquivos TXT. '+e.message,true);}
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
  if(!editableTeam())throw Error('Escolha MINHA PARTE para lançar nesta participação.');const rows=parseImportTxt(await file.text());pendingImport={id:current.id,kind,rows,requestId:uuid()};$('#import-file-status').textContent='Validando '+rows.length+' EANs…';await sendImport(false);
}
async function sendImport(includeUnknown){
 if(!editableTeam())throw Error('Sua participação está fechada para lançamentos.');
 if(!pendingImport||!current||pendingImport.id!==current.id)throw Error('A contagem mudou. Escolha o arquivo novamente.');
 const p=pendingImport,missing=p.rows.filter(r=>!catalog.get(r.ean));
 if(missing.length&&!includeUnknown){$('#import-unknown-list').textContent=missing.slice(0,16).map(r=>r.ean).join(', ');$('#import-unknown-count').textContent=missing.length+' EAN(s) não reconhecidos no cadastro local. Deseja lançar mesmo assim?';$('#import-unknown-fields').innerHTML=missing.map(r=>'<fieldset><legend>'+esc(r.ean)+'</legend><label>PRODUTO<input data-import-ean="'+esc(r.ean)+'" data-field="description" required maxlength="180"></label><label>MARCA<input data-import-ean="'+esc(r.ean)+'" data-field="brand" required maxlength="80"></label></fieldset>').join('');$('#import-unknown-dialog').showModal();return;}
 if(current.kind==='RECONTAGEM'&&p.rows.some(r=>!current.targets.some(t=>t.ean===r.ean)))throw Error('O TXT contém EAN fora da solicitação de recontagem.');
 if(includeUnknown){if(!$('#import-unknown-form').reportValidity())return;const identities=new Map();for(const field of $('#import-unknown-fields').querySelectorAll('input')){if(!identities.has(field.dataset.importEan))identities.set(field.dataset.importEan,{});identities.get(field.dataset.importEan)[field.dataset.field]=field.value.trim();}for(const r of missing){r.metadata=identities.get(r.ean)||{};if(!r.metadata.description||!r.metadata.brand)throw Error('Preencha produto e marca de todos os EANs desconhecidos.');}}
 const existing=new Map(current[p.kind].map(r=>[r.ean,r]));for(const r of p.rows)if((existing.get(r.ean)?.quantity||0)+r.quantity>1000000)throw Error('Quantidade ultrapassa 1.000.000 para '+r.ean);
 const now=new Date().toISOString();for(const r of p.rows){let row=existing.get(r.ean);if(!row){const product=catalog.get(r.ean);row={ean:r.ean,quantity:0,description:product?.description||r.metadata?.description||'PRODUTO INEXISTENTE',brand:product?.brand||r.metadata?.brand||'NÃO CADASTRADA',subgroup:product?.subgroup||'',unknown:!product};current[p.kind].push(row);existing.set(r.ean,row);}if(r.metadata&&row.unknown){row.description=r.metadata.description;row.brand=r.metadata.brand;}row.quantity+=r.quantity;row.lastScannedAt=now;row.origin='IMPORTAÇÃO TXT';}
 const imported=new Set(p.rows.map(r=>r.ean));current.zeroEans=(current.zeroEans||[]).filter(e=>!imported.has(e));changed();await persistDraft();note(p.rows.length+' linhas importadas neste dispositivo.');pendingImport=null;$('#import-file-status').textContent='Importado localmente; será enviado ao Drive com os demais lançamentos.';
}

async function importWithFeedback(kind,input){try{await importFile(kind,input);}catch(e){$('#import-file-status').textContent=e.message;}}
function loadZxing(){if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(zxingPromise)return zxingPromise;zxingPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../../shared/zxing-browser.min.js';s.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error('Leitor de câmera indisponível.'));s.onerror=()=>reject(Error('Não foi possível carregar o leitor local.'));document.head.append(s);});return zxingPromise;}
function stopCamera(close=true){cameraGeneration++;cameraActive=false;cameraLookup=false;if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=0;try{cameraControls?.stop();}catch(_){}cameraControls=null;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const video=$('#camera-video');if(video)video.srcObject=null;if(close&&$('#camera-dialog')?.open)$('#camera-dialog').close();}
function clearCameraCandidate(){cameraCandidate=null;$('#camera-product').hidden=true;$('#camera-launch').disabled=true;}
function renderCameraRecent(){
 const rows=current?.recentCamera||[];$('#camera-recent').hidden=!rows.length;
 $('#camera-recent-list').innerHTML=rows.slice(0,3).map(r=>'<li><strong>'+esc(r.description)+'</strong><span>'+esc(r.brand)+' · '+esc(subgroupOf(r)||'Não informado')+' · '+esc(r.ean)+' · '+esc(r.mode==='defects'?'DEFEITOS':'CONTAGEM')+' · '+esc(new Date(r.at).toLocaleTimeString('pt-BR'))+'</span></li>').join('');
}
function cameraEanCandidates(value){
 const ean=String(value||'').trim();if(!/^\d{8,14}$/.test(ean))return[];
 if(ean.length===12)return[ean,'0'+ean];
 if(ean.length===13&&ean.startsWith('0'))return[ean,ean.slice(1)];
 return[ean];
}
async function findCameraProduct(value){
 for(const code of cameraEanCandidates(value)){
  let product=catalog.get(code);
  if(!product&&!catalogComplete&&navigator.onLine){const result=await api('catalog',{ean:code}),row=result.data;if(row)product={ean:String(row[0]),description:row[1],brand:row[2],subgroup:row[3]||''};}
  if(product){const canonical=String(product.ean||code),resolved={...product,ean:canonical};for(const alias of cameraEanCandidates(canonical))catalog.set(alias,resolved);return resolved;}
 }
 return null;
}
async function cameraDetected(value){
 if(!cameraActive||cameraLookup||cameraCandidate)return;
 const candidates=cameraEanCandidates(value);if(!candidates.length)return;const detected=candidates[0];
 if(candidates.includes(cameraLastEan)&&Date.now()-cameraLastAt<1800)return;cameraLastEan=detected;cameraLastAt=Date.now();cameraLookup=true;const session=current?.id,generation=cameraGeneration;
 try{
  const product=await findCameraProduct(detected);
  if(!cameraActive||generation!==cameraGeneration||current?.id!==session)return;
  if(!product){$('#camera-status').textContent='Código lido ('+detected+'), mas não localizado no cadastro. Confira a loja ou use “Bipar ou digitar EAN”.';scanSound(false);return;}
  cameraLastEan=product.ean;
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===product.ean)){ $('#camera-status').textContent='Código '+product.ean+' lido, mas não faz parte desta solicitação de recontagem.';scanSound(false);return;}
  cameraCandidate={...product,session,mode};$('#camera-product-name').textContent=product.description;$('#camera-product-meta').textContent=product.brand+' · '+(product.subgroup||'Não informado')+' · '+product.ean;$('#camera-product').hidden=false;$('#camera-launch').disabled=false;$('#camera-status').textContent='Confira o produto e toque em LANÇAR para registrar uma unidade.';
 }catch(_){if(cameraActive){$('#camera-status').textContent='Código detectado, mas não foi possível consultar o cadastro. Verifique a conexão e tente novamente.';scanSound(false);}}finally{if(generation===cameraGeneration)cameraLookup=false;}
}
function launchCameraProduct(){
 const candidate=cameraCandidate;if(!candidate||candidate.session!==current?.id||!cameraActive)return;
 $('#camera-launch').disabled=true;const row=addScan(candidate.ean,false,'CÂMERA');if(!row)return;
 renderCameraRecent();clearCameraCandidate();
 cameraLastEan=candidate.ean;cameraLastAt=Date.now();$('#camera-status').textContent='Lançado. Aponte para o próximo produto.';
}
async function startZxingFallback(generation){
 if(cameraFallbackStarted||!cameraActive||generation!==cameraGeneration)return;cameraFallbackStarted=true;
 if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=0;$('#camera-status').textContent='Usando o leitor alternativo. Mantenha o código focado na câmera.';
 try{
  const ZX=await loadZxing();if(!cameraActive||generation!==cameraGeneration)return;
  const Reader=ZX.BrowserMultiFormatOneDReader||ZX.BrowserMultiFormatReader,reader=new Reader();
  const controls=await reader.decodeFromStream(cameraStream,$('#camera-video'),result=>{if(result&&cameraActive&&generation===cameraGeneration)cameraDetected(result.getText());});
  if(generation!==cameraGeneration||!cameraActive){controls?.stop();return;}cameraControls=controls;
 }catch(_){if(cameraActive&&generation===cameraGeneration)$('#camera-status').textContent='Não foi possível ler o código. Limpe a lente, aproxime a etiqueta e mantenha o EAN dentro da imagem.';}
}
async function startCamera(){
  stopCamera(false);const generation=cameraGeneration;cameraFallbackStarted=false;clearCameraCandidate();renderCameraRecent();cameraLastEan='';$('#camera-status').textContent='Solicitando acesso à câmera…';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});if(generation!==cameraGeneration||!$('#camera-dialog').open){stream.getTracks().forEach(t=>t.stop());return;}cameraStream=stream;const video=$('#camera-video');video.srcObject=stream;await video.play();if(generation!==cameraGeneration||!$('#camera-dialog').open){stream.getTracks().forEach(t=>t.stop());return;}cameraActive=true;$('#camera-status').textContent='Aponte a câmera para o código de barras.';
    let detector=null,formats=[];if('BarcodeDetector'in window){try{formats=await BarcodeDetector.getSupportedFormats();const supported=['ean_13','ean_8','upc_a','upc_e'].filter(f=>formats.includes(f));if(supported.length)detector=new BarcodeDetector({formats:supported});}catch(_){}}
    if(detector){let busy=false,last=0,misses=0;const tick=async now=>{if(!cameraActive||generation!==cameraGeneration)return;cameraFrame=requestAnimationFrame(tick);if(busy||now-last<220||video.readyState<2)return;last=now;busy=true;try{const found=await detector.detect(video);if(found.length){misses=0;await cameraDetected(found[0].rawValue);}else if(++misses>=14){await startZxingFallback(generation);}}catch(_){if(++misses>=14)await startZxingFallback(generation);}finally{busy=false;}};cameraFrame=requestAnimationFrame(tick);}
    else await startZxingFallback(generation);
  }catch(e){if(generation!==cameraGeneration)return;stopCamera(false);$('#camera-status').textContent=e.name==='NotAllowedError'?'Permita o acesso à câmera nas configurações do Chrome e tente novamente.':e.name==='NotFoundError'?'Não encontramos uma câmera disponível neste dispositivo.':e.message||'Não foi possível iniciar a câmera.';}
}
async function loadRecounts(){
  if(!user||loadingRecounts)return;loadingRecounts=true;$('#refresh-recounts').disabled=true;$('#recount-inbox-status').textContent='Buscando solicitações…';
  try{const r=await api('recountInbox');recounts=r.data||[];if(current?.kind==='RECONTAGEM'&&current.status!=='FINALIZADA'&&serial===saved&&!recounts.some(item=>item.id===current.id)){remoteUnavailable('A recontagem não está disponível no Drive.');}$('#recount-inbox-list').innerHTML=recounts.map(r=>'<article class="recount-inbox-item"><div><strong>'+esc(r.store)+' · '+esc(r.label)+'</strong><span>Recontagem solicitada para esta contagem</span></div><button class="button button-primary" data-open-recount="'+esc(r.id)+'">ABRIR RECONTAGEM</button></article>').join('');$('#recount-inbox-status').textContent=recounts.length?recounts.length+' solicitação(ões) pendente(s).':'Nenhuma recontagem pendente.';}
  catch(e){$('#recount-inbox-status').textContent='Não foi possível buscar solicitações. Toque em Atualizar solicitações.';}
  finally{loadingRecounts=false;$('#refresh-recounts').disabled=false;}
}
function renderRecount(){
  const active=current?.kind==='RECONTAGEM';$('#recount-targets').hidden=!active;if(!active)return;
  const scanned=new Set(current.counts.concat(current.defects).map(r=>r.ean)),zeros=new Set(current.zeroEans||[]),included=current.targets.filter(r=>scanned.has(r.ean)||zeros.has(r.ean)).length,done=current.status==='FINALIZADA'||current.localFinished;
  $('#recount-progress').textContent=included+' de '+current.targets.length+' EANs incluídos';
  const query=$('#recount-search').value.trim().toLowerCase(),targets=query?current.targets.filter(r=>r.ean.includes(query)||r.description.toLowerCase().includes(query)):current.targets,pages=Math.max(1,Math.ceil(targets.length/80));recountPage=Math.max(0,Math.min(recountPage,pages-1));
  $('#recount-page').textContent='Página '+(recountPage+1)+' de '+pages;$('#recount-prev').disabled=recountPage===0;$('#recount-next').disabled=recountPage>=pages-1;
  $('#recount-target-list').innerHTML=targets.slice(recountPage*80,(recountPage+1)*80).map(r=>'<article class="recount-target '+(scanned.has(r.ean)||zeros.has(r.ean)?'included':'')+'"><div><strong>'+esc(r.ean)+'</strong><span>'+esc(r.description)+'</span><span>'+esc(subgroupOf(r)||'Não informado')+'</span><small>'+(scanned.has(r.ean)?'INCLUÍDO NA RECONTAGEM':zeros.has(r.ean)?'NÃO LOCALIZADO · 0':'AGUARDANDO BIPAGEM')+'</small></div>'+(!scanned.has(r.ean)?'<button type="button" class="button button-quiet" data-zero-ean="'+esc(r.ean)+'" '+(done||current.deleteStatus==='PENDENTE'?'disabled':'')+'>'+(zeros.has(r.ean)?'DESFAZER':'NÃO LOCALIZADO (0)')+'</button>':'')+'</article>').join('');
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
  const context=!user?'inventory-login':activeDeletionReviewId&&current?.id===activeDeletionReviewId?'inventory-delete-review':!$('#analysis-view').hidden?'inventory-analysis':current?.deleteStatus==='PENDENTE'?'inventory-delete-pending':current?.localFinished&&current.status!=='FINALIZADA'?'inventory-local-finished':current?.status==='FINALIZADA'?(current.kind==='RECONTAGEM'?'inventory-recount-finished':'inventory-finished'):current?.kind==='RECONTAGEM'?'inventory-recount':!current?(user.allStores?'inventory-admin-start':'inventory-start'):mode==='defects'?'inventory-defects':'inventory-count';
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
$('#recount-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-open-recount]');if(b){b.disabled=true;$('#recount-inbox-status').textContent='Abrindo recontagem…';openCount(b.dataset.openRecount,'openRecount').then(()=>{$('#recount-inbox-status').textContent='Recontagem aberta. Confira os produtos solicitados abaixo.';}).catch(e=>{$('#recount-inbox-status').textContent=e.message;}).finally(()=>{b.disabled=false;});}});
$('#refresh-deletions').addEventListener('click',loadDeletionRequests);
$('#deletion-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-review-delete]');if(b)reviewDeletion(b.dataset.reviewDelete);});
$('#request-delete-session').addEventListener('click',requestDeletion);
$('#approve-delete').addEventListener('click',()=>resolveDeletion(true));$('#reject-delete').addEventListener('click',()=>resolveDeletion(false));
$('#recount-target-list').addEventListener('click',event=>{const b=event.target.closest('[data-zero-ean]');if(!b||!current||current.status==='FINALIZADA'||current.localFinished||current.deleteStatus==='PENDENTE')return;const ean=b.dataset.zeroEan;current.zeroEans=current.zeroEans||[];current.zeroEans=current.zeroEans.includes(ean)?current.zeroEans.filter(e=>e!==ean):current.zeroEans.concat(ean);changed();});
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
 try{await persistDraft();await TPInventoryLocal.drain();await TPInventoryLocal.setting('profile',{user,stores,enabled:false});stopCamera();releaseTeamLock();saveAuth(null);user=null;current=null;recounts=[];$('#recount-inbox-list').innerHTML='';$('#app-main').hidden=true;$('#login-panel').hidden=false;$('#recover-local').hidden=true;$('#logout').hidden=true;$('#account-label').textContent='ACESSO TENNIS PLACE';}catch(e){note(e.message,true);}
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
$('#history-store-filter').addEventListener('change',event=>{historyStoreFilter=event.target.value;sessions=[];sessionsLoaded=false;picker();loadSessions();});
$('#load-sessions').addEventListener('click',loadSessions);
$('#delete-session').addEventListener('click',deleteSession);
$('#scan-form').addEventListener('submit',event=>{event.preventDefault();scan();});
$('#import-count').addEventListener('click',()=>$('#import-count-file').click());$('#import-defects').addEventListener('click',()=>$('#import-defects-file').click());
$('#import-count-file').addEventListener('change',event=>importWithFeedback('counts',event.target));$('#import-defects-file').addEventListener('change',event=>importWithFeedback('defects',event.target));
$('#import-unknown-form').addEventListener('submit',event=>{event.preventDefault();sendImport(true).then(()=>{if(!pendingImport)$('#import-unknown-dialog').close();}).catch(e=>$('#import-file-status').textContent=e.message);});
$('#import-cancel-unknown').addEventListener('click',()=>{$('#import-unknown-dialog').close();pendingImport=null;$('#import-file-status').textContent='Importação cancelada para corrigir os EANs.';});
$('#import-unknown-dialog').addEventListener('close',()=>{$('#import-confirm-unknown').disabled=false;updateInventoryHelp();});
$('#open-camera').addEventListener('click',()=>{if(!current||current.status==='FINALIZADA')return;$('#camera-dialog').showModal();window.dispatchEvent(new CustomEvent('tp-help',{detail:'inventory-camera'}));startCamera();});
$('#camera-close').addEventListener('click',()=>stopCamera());$('#camera-dialog').addEventListener('close',()=>{stopCamera(false);updateInventoryHelp();});
$('#correct-ean').addEventListener('click',()=>{$('#unknown-dialog').close();unknown=null;$('#ean-input').focus();$('#ean-input').select();});
$('#unknown-form').addEventListener('submit',event=>{event.preventDefault();const description=$('#unknown-description').value.trim(),brand=$('#unknown-brand').value.trim();if(!description||!brand){$('#unknown-description').value=description;$('#unknown-brand').value=brand;$('#unknown-form').reportValidity();return;}const row=addScan(unknown,true,unknownOrigin,{description,brand});if(row){$('#unknown-dialog').close();unknown=null;}});
document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render();updateInventoryHelp();document.querySelectorAll('.mode-button').forEach(x=>x.classList.toggle('active',x===b));$('#ean-input').focus();}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('click',event=>{
  const b=event.target.closest('[data-delta],[data-remove]');if(!b||!editableTeam())return;
  const list=current[b.dataset.kind],row=list.find(r=>r.ean===b.dataset.ean);if(!row)return;
  row.quantity=b.dataset.remove?0:row.quantity+Number(b.dataset.delta);row.origin='AJUSTE MANUAL';row.lastScannedAt=new Date().toISOString();current[b.dataset.kind]=list.filter(r=>r.quantity>0);changed();
}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('change',event=>{
  const input=event.target.closest('[data-quantity]');if(!input||!editableTeam())return;
  const value=Number(input.value),list=current[input.dataset.list],row=list.find(r=>r.ean===input.dataset.ean);if(!row)return;
  if(!Number.isInteger(value)||value<1||value>1000000){input.value=String(row.quantity);note('Informe uma quantidade inteira entre 1 e 1.000.000.',true);return;}
  if(value!==row.quantity){row.quantity=value;row.origin='AJUSTE MANUAL';row.lastScannedAt=new Date().toISOString();changed();}
}));
$('#reload-count').addEventListener('click',()=>openCount(current?.id).catch(e=>note(e.message,true)));
$('#finish-count').addEventListener('click',finishCount);$('#export-txt').addEventListener('click',exportCsv);$('#export-xlsx').addEventListener('click',exportExcel);
$('#analysis-filters').addEventListener('submit',analyze);
$('#filter-brand').addEventListener('change',renderAnalysis);$('#filter-subgroup').addEventListener('change',renderAnalysis);
function showTab(analysis){$('#count-view').hidden=analysis;$('#analysis-view').hidden=!analysis;$('#tab-count').classList.toggle('active',!analysis);$('#tab-analysis').classList.toggle('active',analysis);render();updateInventoryHelp();}
$('#tab-count').addEventListener('click',()=>showTab(false));$('#tab-analysis').addEventListener('click',()=>{showTab(true);analyze();});
window.addEventListener('pagehide',()=>stopCamera(false));
window.addEventListener('beforeunload',event=>{if((localError||localWrites>0)&&current){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>{updateOfflineStatus();flush();});window.addEventListener('offline',updateOfflineStatus);
let lastReturnCheck=0;
async function refreshAfterReturn(){
 if(!navigator.onLine||document.hidden||!user||Date.now()-lastReturnCheck<1500)return;lastReturnCheck=Date.now();
 if(user.allStores&&!$('#analysis-view').hidden)analyze();
 if((user.allStores||user.multiStore)&&(sessionsLoaded||current))loadSessions();
 else if(current&&current.kind!=='RECONTAGEM'){
  const target=current;
  try{const result=await api('checkCount',{id:target.id});if(!result.data.exists&&current===target){remoteUnavailable('Esta contagem foi excluída da planilha.');}}catch(_){}
 }
 loadRecounts();
}
document.addEventListener('visibilitychange',refreshAfterReturn);window.addEventListener('focus',refreshAfterReturn);
window.tpPrepareClose=async()=>{await persistDraft();await TPInventoryLocal.drain();if(localError)throw Error(localError);};
try{auth=JSON.parse(sessionStorage.getItem(AUTH_KEY)||'null');}catch(_){}
initializeDevice().then(async()=>{if(auth?.access_token)try{await boot();}catch(e){if(!e.status||e.status>=500){if(await recoverLocal())return;}$('#login-error').textContent=e.message;} });


$('#prepare-offline').addEventListener('click',prepareOffline);
$('#recover-local').addEventListener('click',()=>recoverLocal().catch(e=>$('#login-error').textContent=e.message));
$('#sync-now').addEventListener('click',()=>{if(!auth?.access_token){$('#login-panel').hidden=false;$('#app-main').hidden=true;$('#login-error').textContent='Entre novamente para enviar as bipagens locais ao Drive.';}else flush();});
for(const kind of ['counts','defects'])for(const direction of ['prev','next'])$('#'+kind+'-'+direction).addEventListener('click',()=>{listPage[kind]+=direction==='next'?1:-1;render();});
$('#export-count-txt').addEventListener('click',()=>{if(current){warnTeamExport();TPInventoryExport.txt(teamExportState().counts,'CONTAGEM_'+current.label+'.txt');}});
$('#export-defects-txt').addEventListener('click',()=>{if(current){warnTeamExport();TPInventoryExport.txt(teamExportState().defects,'DEFEITOS_'+current.label+'.txt');}});

$('#camera-launch').addEventListener('click',launchCameraProduct);
$('#camera-rescan').addEventListener('click',()=>{clearCameraCandidate();cameraLastEan='';$('#camera-status').textContent='Aponte para o código de barras.';});
$('#back-inventory-home').addEventListener('click',()=>showInventoryHome().catch(e=>$('#app-error').textContent=e.message));
$('#device-draft-list').addEventListener('click',event=>{const b=event.target.closest('[data-resume-draft]');if(b)resumeDeviceDraft(b.dataset.resumeDraft).catch(e=>$('#app-error').textContent=e.message);});


$('#team-refresh').addEventListener('click',loadTeamCounts);
$('#store-code').addEventListener('change',loadTeamCounts);
$('#team-open-list').addEventListener('click',event=>{const b=event.target.closest('[data-team-join]');if(b)joinTeamCount(b.dataset.teamJoin).catch(e=>$('#team-open-status').textContent=e.message);});
$('#team-own').addEventListener('click',()=>{teamScope='own';listPage.counts=0;listPage.defects=0;render();});
$('#team-total').addEventListener('click',()=>{teamScope='total';listPage.counts=0;listPage.defects=0;render();});
$('#team-own-export').addEventListener('click',()=>{if(current)TPInventoryExport.download(TPInventoryExport.workbook(withSubgroups({...current,collaborative:false,counts:current.counts,defects:current.defects})),'MINHA_PARTE_'+current.responsible+'_'+current.label+'.xlsx');});
$('#count-responsible').addEventListener('input',()=>{const input=$('#count-responsible');input.setCustomValidity(validResponsible(input.value)?'':'Informe pelo menos 4 letras, sem números.');});
setInterval(()=>{if(user&&auth&&navigator.onLine&&!document.hidden){loadTeamCounts();if(current?.collaborative&&!inventoryHome)refreshTeam();}},10000);
