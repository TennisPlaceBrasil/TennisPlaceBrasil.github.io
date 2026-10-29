'use strict';
const $=s=>document.querySelector(s),BASE='https://rihvnshexilakojnltox.supabase.co',KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz',AUTH_KEY='tp-manuais-supabase-v1';
let auth=null,user=null,stores=[],sessions=[],sessionsLoaded=false,loadingSessions=false,historyStoreFilter='',current=null,catalog=new Map(),mode='count',unknown=null,lookingUp=false,deleteConfirmAction=null,largeQuantityEnabled=false,pendingScanQuantity=1;
let inventoryHome=false,openingCount=false,cameraCandidate=null,cameraLookup=false,cameraGeneration=0,cameraLastEan='',cameraLastAt=0,cameraFallbackStarted=false,scanAudio=null;
let analysisCache=null,analysisRequest=0,subgroupCatalogReady=false,divergenceRequest=0;
let accessUsers=[],accessStores=[],accessAudit=[];
let teamScope='own',teamBusy=false,teamListBusy=false,teamLockId=null,teamUnlock=null,teamAdminActionBusy=false,selectedSessionId='';
let serial=0,saved=0,inflight=null,timer=null,retry=null,conflict=false,xlsxPromise,recounts=[],loadingRecounts=false,recountSourceId=null,recountPage=0,pendingImport=null,cameraStream=null,cameraControls=null,cameraFrame=0,cameraActive=false,zxingPromise=null,deletionRequests=[],loadingDeletions=false,activeDeletionReviewId=null,unknownOrigin='LEITOR / DIGITAÇÃO',auditSessionPromise=null;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const MAX_EAN_LENGTH=15,MAX_PRODUCT_QUANTITY=1000,MAX_STORE_QUANTITY=10000;
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
  const breakdown=new Map((old?.responsibleBreakdown||[]).map(p=>[p.responsible,p.quantity]));if(name)breakdown.set(name,(breakdown.get(name)||0)+row.quantity);
  map.set(row.ean,{...latest,quantity:(old?.quantity||0)+row.quantity,responsible:[...names].join(', '),responsibleBreakdown:old&&!old.responsibleBreakdown?.length?[]:[...breakdown].map(([responsible,quantity])=>({responsible,quantity}))});
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
 $('#team-people').innerHTML=(current.participants||[]).map(p=>'<div class="team-person"><div class="team-person-info"><strong>'+esc(p.responsible)+'</strong> · '+(p.done?'PARTE FINALIZADA':'CONTANDO / AGUARDANDO FINALIZAÇÃO')+' · '+Number(p.units||0)+' unidades · '+Number(p.defects||0)+' defeitos<br><span>Último envio: '+esc(new Date(p.updatedAt).toLocaleString('pt-BR'))+' · '+esc(p.device||'Dispositivo não informado')+' · '+esc(p.ip||'IP não capturado')+'</span></div>'+(user?.allStores&&p.id?'<div class="team-person-actions"><button class="button button-quiet" type="button" data-person-action="finish" data-person-id="'+esc(p.id)+'" '+(p.done||teamAdminActionBusy?'disabled':'')+'>FINALIZAR</button><button class="button button-quiet" type="button" data-person-action="clear" data-person-id="'+esc(p.id)+'" '+(teamAdminActionBusy?'disabled':'')+'>LIMPAR</button></div>':'')+'</div>').join('');
 $('#team-own').disabled=!!current.collabViewOnly;$('#team-total').disabled=false;
}
async function loadTeamCounts(){
 if(!auth||!user||!navigator.onLine||teamListBusy)return;teamListBusy=true;
 try{const r=await api('teamList',{store:$('#store-code').value||undefined});const counts=(r.data||[]).filter(c=>c.deleteStatus!=='PENDENTE');
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
  if(remote.deleteStatus==='PENDENTE'&&!user?.allStores){
   clearTimeout(timer);timer=null;inventoryHome=true;current=null;teamScope='own';render();await renderDeviceDrafts();loadTeamCounts();
   $('#app-error').textContent='Esta contagem entrou em revisão e foi ocultada da loja. A cópia local permanece preservada.';
   return;
  }
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
function findUnknownProduct(ean){
 return [...(current?.counts||[]),...(current?.defects||[]),...(current?.peers?.counts||[]),...(current?.peers?.defects||[])].find(r=>r.ean===ean&&r.unknown);
}
function showUnknown(ean,origin,reason){
 const previous=findUnknownProduct(ean);
 unknown=ean;unknownOrigin=origin;$('#unknown-ean').textContent=ean;$('#unknown-reason').textContent=reason;
 $('#unknown-description').value=previous?.description==='PRODUTO INEXISTENTE'?'':previous?.description||'';
 $('#unknown-brand').value=previous?.brand||'';
 $('#unknown-gender').value=previous?.gender||'';$('#unknown-color').value=previous?.color||'';$('#unknown-size').value=previous?.size||'';
 $('#unknown-quantity').value=String(Math.max(1,Math.min(MAX_PRODUCT_QUANTITY,Number(pendingScanQuantity)||1)));
 scanSound(false);$('#unknown-dialog').showModal();
}
function countTotals(state=current){
 const byEan=new Map();let total=0;
 for(const row of [...(state?.counts||[]),...(state?.defects||[]),...(state?.peers?.counts||[]),...(state?.peers?.defects||[])]){
  const quantity=Number(row.quantity)||0;total+=quantity;byEan.set(row.ean,(byEan.get(row.ean)||0)+quantity);
 }
 return {byEan,total};
}
function cleanUnknownText(value,max){return String(value||'').toLocaleUpperCase('pt-BR').replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').slice(0,max).trimStart();}
function validUnknownText(value,max){const text=String(value||'').trim();return text.length>0&&text.length<=max&&/^[\p{L}\p{N} ]+$/u.test(text);}
async function showInventoryHome(){
 stopCamera();await persistDraft();await TPInventoryLocal.drain();inventoryHome=true;loadTeamCounts();$('#recount-inbox').hidden=false;render();await renderDeviceDrafts();
 $('#count-view').scrollIntoView({block:'start'});if(navigator.onLine&&auth)loadRecounts();
}
async function renderDeviceDrafts(){
 const list=await TPInventoryLocal.list(user.id);const drafts=list.filter(r=>r.deleteStatus!=='PENDENTE'&&(r.status!=='FINALIZADA'||r.serial!==r.saved));
 $('#device-drafts').hidden=!inventoryHome||!drafts.length;
 $('#device-draft-list').innerHTML=drafts.map(r=>'<article class="recount-inbox-item"><div><strong>'+esc(r.label)+'</strong><span>'+(r.orphaned?'Cópia local preservada · indisponível no servidor':r.serial!==r.saved?'Há dados locais aguardando envio':'Contagem em andamento neste dispositivo')+'</span></div><button class="button button-primary" data-resume-draft="'+esc(r.id)+'">'+(r.orphaned?'VER CÓPIA LOCAL':'CONTINUAR')+'</button></article>').join('');
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
  let data;try{data=JSON.parse(await r.text());}catch{throw Error('O servidor respondeu em formato inválido. Tente novamente; seus dados locais estão preservados.');}if(!r.ok){const e=Error(data.error||'Falha de comunicação.');e.status=r.status;throw e;}return data;
}
async function adminApi(action,params={},again=false){
 const response=await fetch(BASE+'/functions/v1/manual-portal-access-admin',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+auth?.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...params}),signal:AbortSignal.timeout(30000)});
 if(response.status===401&&!again){await refresh();return adminApi(action,params,true);}
 let result;try{result=await response.json();}catch{throw Error('O servidor respondeu em formato inválido.');}
 if(!response.ok){const error=Error(result.error||'Falha ao administrar acessos.');error.status=response.status;throw error;}
 return result;
}
function accessRole(account){return account.master?'MASTER':account.administrator?'ADMINISTRATIVO':'LOJA';}
function renderAccessSettings(){
 const root=$('#access-user-list');if(!root)return;
 const query=$('#access-user-search').value.trim().toLocaleLowerCase('pt-BR');
 const visible=accessUsers.filter(account=>!query||account.email.toLocaleLowerCase('pt-BR').includes(query));
 const createStoreRoot=$('#access-create-store-list');
 if(createStoreRoot){
  const selected=new Set([...createStoreRoot.querySelectorAll('[data-new-store]:checked')].map(input=>input.dataset.newStore));
  createStoreRoot.innerHTML=accessStores.map(store=>'<label class="access-store-option"><input type="checkbox" data-new-store="'+esc(store)+'" '+(selected.has(store)?'checked ':'')+'><span>'+esc(store)+'</span></label>').join('');
 }
 root.innerHTML=visible.map(account=>{
  const fullAccess=account.master||account.administrator;
  const storeOptions=accessStores.map(store=>{
   const checked=account.stores.includes(store),fixed=fullAccess||account.homeStores.includes(store)||!account.active;
   const detail=account.homeStores.includes(store)?' · principal':'';
   return '<label class="access-store-option"><input type="checkbox" data-access-store="'+esc(store)+'" '+(checked?'checked ':'')+(fixed?'disabled':'')+'><span>'+esc(store)+detail+'</span></label>';
  }).join('');
  const storeHelp=account.homeStores.length?'A loja principal fica fixa. Marque outras lojas para liberar acesso compartilhado.':'Esta conta não tem loja principal; marque as lojas às quais ela terá acesso.';
  return '<article class="access-user-card" data-access-user="'+esc(account.id)+'"><header><div><strong>'+esc(account.name?account.name+' · ':'')+esc(account.email||'Conta sem e-mail')+'</strong><small>'+esc(account.id)+'</small></div><span class="access-state '+(account.active?'active':'inactive')+'">'+(account.active?'ATIVO':'INATIVO')+'</span></header><div class="access-role-row"><label class="access-master-toggle"><input type="checkbox" data-access-master '+(account.master?'checked ':'')+(!account.active||!account.administrator?'disabled':'')+'><span>MASTER</span></label><span class="access-current-role">Perfil atual: '+accessRole(account)+'</span></div><fieldset class="access-store-set"><legend>LOJAS COM ACESSO</legend>'+(fullAccess?'<p class="access-all-stores">Acesso a todas as lojas pelo perfil '+accessRole(account)+'.</p>':'<div class="access-store-grid">'+storeOptions+'</div><small>'+storeHelp+'</small>')+'</fieldset><div class="access-card-actions"><button class="button button-primary" type="button" data-save-access>SALVAR ACESSO</button></div></article>';
 }).join('');
 if(!visible.length)root.innerHTML='<p class="access-empty">Nenhum usuário encontrado.</p>';
 const auditRoot=$('#access-audit-list');
 auditRoot.innerHTML=accessAudit.length?accessAudit.map(row=>{
  const beforeRole=row.previous_master?'MASTER':'sem MASTER',afterRole=row.new_master?'MASTER':'sem MASTER';
  const beforeStores=(row.previous_stores||[]).join(', ')||'nenhuma loja específica';
  const afterStores=(row.new_stores||[]).join(', ')||'nenhuma loja específica';
  return '<article class="access-audit-row"><strong>'+esc(row.target_email||'Conta')+'</strong><span>'+esc(beforeRole)+' · '+esc(beforeStores)+' → '+esc(afterRole)+' · '+esc(afterStores)+'</span><small>'+esc(row.actor_email||'MASTER')+' · '+esc(new Date(row.created_at).toLocaleString('pt-BR'))+'</small></article>';
 }).join(''):'<p class="access-empty">Ainda não há alterações de acesso registradas.</p>';
}
async function loadAccessSettings(keepStatus=false){
 if(!user?.master)return;
 const refresh=$('#access-refresh');if(refresh)refresh.disabled=true;
 if(!keepStatus)$('#access-status').textContent='Carregando usuários e lojas…';
 try{const result=await adminApi('list');accessUsers=result.users||[];accessStores=result.stores||[];accessAudit=result.audit||[];renderAccessSettings();$('#access-status').textContent='Acessos atualizados. As alterações são aplicadas imediatamente e ficam registradas.';}
 catch(error){$('#access-status').textContent=error.message;}
 finally{if(refresh)refresh.disabled=false;}
}
async function saveAccess(card){
 const targetId=card.dataset.accessUser,account=accessUsers.find(item=>item.id===targetId);
 if(!account||!account.active)return;
 const master=card.querySelector('[data-access-master]').checked;
 const stores=account.administrator?accessStores:[...card.querySelectorAll('[data-access-store]:checked')].map(input=>input.dataset.accessStore);
 const summary=(master?'MASTER':'sem MASTER')+(account.master===master?'':' · perfil alterado')+' · '+(stores.length?stores.join(', '):'sem lojas específicas');
 if(!window.confirm('Aplicar este acesso para '+(account.email||'a conta')+'?\\n\\n'+summary+'\\n\\nA mudança será aplicada imediatamente e registrada no histórico.'))return;
 const button=card.querySelector('[data-save-access]');button.disabled=true;$('#access-status').textContent='Salvando acesso…';
 try{await adminApi('save',{userId:targetId,master,stores});await loadAccessSettings(true);$('#access-status').textContent='Acesso salvo e registrado no histórico.';}
 catch(error){$('#access-status').textContent=error.message;}
 finally{button.disabled=false;}
}

async function createAccessUser(event){
 event.preventDefault();if(!user?.master)return;
 const form=$('#access-create-form'),submit=$('#access-create-submit');
 const name=$('#new-user-name').value.trim(),email=$('#new-user-email').value.trim().toLowerCase(),password=$('#new-user-password').value;
 const stores=[...form.querySelectorAll('[data-new-store]:checked')].map(input=>input.dataset.newStore);
 if(!stores.length){$('#access-status').textContent='Selecione pelo menos uma loja.';return;}
 const summary='Usuário LOJA · '+email+' · '+stores.join(', ');
 if(!window.confirm('Criar esta conta?\n\n'+summary+'\n\nA senha inicial será definida agora.'))return;
 submit.disabled=true;$('#access-status').textContent='Criando conta e liberando as lojas…';
 try{
  await adminApi('create',{name,email,password,stores});
  form.reset();form.hidden=true;$('#access-create-toggle').setAttribute('aria-expanded','false');
  await loadAccessSettings(true);$('#access-status').textContent='Usuário criado e acessos registrados. Compartilhe a senha inicial por canal seguro.';
 }catch(error){$('#access-status').textContent=error.message;}
 finally{submit.disabled=false;}
}

function picker(){
   $('#session-picker-wrap').hidden=!(user?.allStores||user?.multiStore);
   const filter=$('#history-store-filter');
   if(filter){filter.hidden=!(user?.allStores||user?.multiStore);filter.value=historyStoreFilter||'';}
   const pickerEl=$('#session-picker'),prior=selectedSessionId||pickerEl.value;
   const selected=sessions.find(s=>s.id===prior)||sessions.find(s=>s.id===current?.id)||null;
   selectedSessionId=selected?.id||'';
   pickerEl.hidden=!sessions.length;
   pickerEl.innerHTML='<option value="">Selecione uma contagem</option>'+sessions.slice().reverse().map(s=>'<option value="'+esc(s.id)+'">'+esc(s.label)+' · '+esc(s.status)+(s.sheetMissing?' · ABA AUSENTE':'')+'</option>').join('');
   pickerEl.value=selectedSessionId;
   const chosen=sessions.find(s=>s.id===pickerEl.value)||null;
   $('#view-session').hidden=!chosen;
   $('#view-session').disabled=loadingSessions||openingCount||!chosen;
   $('#reopen-session').hidden=!user?.allStores||!chosen||chosen.status!=='FINALIZADA'||chosen.kind==='RECONTAGEM'||chosen.deleteStatus==='PENDENTE';
   $('#reopen-session').disabled=loadingSessions||openingCount||teamAdminActionBusy;
   $('#load-sessions').disabled=loadingSessions;
   $('#load-sessions').textContent=loadingSessions?'CARREGANDO…':sessionsLoaded?'ATUALIZAR CONTAGENS':'CARREGAR CONTAGENS';
   $('#delete-session').hidden=!user?.allStores||!pickerEl.value;
   $('#delete-session').disabled=loadingSessions;
   $('#request-recount').hidden=!user?.allStores||!chosen||chosen.kind==='RECONTAGEM'||chosen.status!=='FINALIZADA';
   $('#request-delete-session').hidden=!!user?.allStores||!current||current.deleteStatus==='PENDENTE';
   $('#share-count').hidden=!user?.allStores||!chosen;
   $('#share-count').disabled=loadingSessions||!chosen;
 }
function render(){
  const compactCounting=!!current&&!inventoryHome&&!$('#count-view').hidden;
  document.body?.classList.toggle('is-counting',compactCounting);
  if(document.body)document.body.dataset.countMode=mode;
  $('#count-options-toggle').hidden=true;
  const offlinePanel=$('.offline-panel'),offlineTarget=compactCounting?$('#offline-panel-count'):$('#offline-panel-home');
  if(offlinePanel&&offlineTarget&&offlinePanel.parentElement!==offlineTarget)offlineTarget.append(offlinePanel);

  $('#empty-state').hidden=!!current&&!inventoryHome;$('#counting').hidden=!current||inventoryHome;$('#back-inventory-home').hidden=!current||inventoryHome;$('#device-drafts').hidden=!inventoryHome;$('#counting').dataset.localFinished=String(!!current?.localFinished&&current.status!=='FINALIZADA');$('#share-link-panel').hidden=inventoryHome||!(current&&current.shareUrl);if(current?.shareUrl)$('#share-link-value').value=current.shareUrl;renderRecount();if(!current){renderTeam();$('#delete-review-actions').hidden=true;$('#request-delete-session').hidden=true;$('#delete-current-session').hidden=true;return;}
  renderTeam();$('#session-title').textContent=current.label;
  $('#delete-current-session').hidden=!user?.allStores;
  $('#delete-current-session').disabled=loadingSessions;
  const view=current.collaborative&&teamScope==='total'?teamExportState():current,counts=view.counts,defects=view.defects,done=current.status==='FINALIZADA'||current.localFinished||current.collabViewOnly||current.collabReadOnly||current.collaborative&&teamScope==='total',deletePending=current.deleteStatus==='PENDENTE';
  $('#count-total').textContent=(current.collaborative?teamExportState().counts:counts).reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#defect-total').textContent=(current.collaborative?teamExportState().defects:defects).reduce((n,r)=>n+r.quantity,0).toLocaleString('pt-BR');
  $('#count-rows').textContent=counts.length+' ITENS';$('#defect-rows').textContent=defects.length+' ITENS';
  $('#count-empty').hidden=!!counts.length;$('#defect-empty').hidden=!!defects.length;
  function table(rows,kind){listPage[kind]=Math.min(listPage[kind],Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1));return rows.slice(listPage[kind]*PAGE_SIZE,(listPage[kind]+1)*PAGE_SIZE).map(r=>'<tr><td>'+esc(r.ean)+'</td><td><span class="product-name">'+esc(r.description)+'</span><span class="mobile-ean">'+esc(r.ean)+'</span><span class="mobile-subgroup">'+esc(subgroupOf(r)||'Não informado')+'</span>'+(r.gender||r.color||r.size?'<span class="product-sub">'+(r.gender?'GÊNERO '+esc(r.gender):'')+(r.color?' · COR '+esc(r.color):'')+(r.size?' · TAMANHO '+esc(r.size):'')+'</span>':'')+(r.unknown?'<span class="product-sub">Lançado mesmo assim</span>':'')+'</td><td>'+esc(r.brand||'')+'</td><td>'+esc(subgroupOf(r)||'Não informado')+'</td><td><div class="qty-actions"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="-1" aria-label="Diminuir">−</button><input class="quantity-input" type="number" min="1" max="1000" step="1" inputmode="numeric" value="'+r.quantity+'" data-quantity="1" data-list="'+kind+'" data-ean="'+esc(r.ean)+'" aria-label="Quantidade"><button type="button" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-delta="1" aria-label="Aumentar">+</button></div></td><td><button type="button" class="remove-row" data-kind="'+kind+'" data-ean="'+esc(r.ean)+'" data-remove="1" aria-label="Remover">×</button></td></tr>').join('');}
  $('#count-body').innerHTML=table(counts,'counts');$('#defect-body').innerHTML=table(defects,'defects');renderRecentScans(view);
  $('#large-quantity-toggle').setAttribute('aria-checked',String(largeQuantityEnabled));$('#large-quantity-state').textContent=largeQuantityEnabled?'LIGADO':'DESLIGADO';$('#large-quantity-field').hidden=!largeQuantityEnabled;$('#large-quantity-input').required=largeQuantityEnabled;$('#large-quantity-input').disabled=done||deletePending||!largeQuantityEnabled;
  for(const kind of ['counts','defects']){const pages=Math.max(1,Math.ceil(view[kind].length/PAGE_SIZE));$('#'+kind+'-page').textContent=(listPage[kind]+1)+' / '+pages;$('#'+kind+'-prev').disabled=listPage[kind]===0;$('#'+kind+'-next').disabled=listPage[kind]>=pages-1;}
  $('#ean-input').disabled=done||lookingUp||deletePending;
  ['#open-camera','#import-count','#import-defects'].forEach(id=>{if($(id))$(id).disabled=done||deletePending;});
  $('#finish-count').disabled=current.status==='FINALIZADA'||current.localFinished||current.collabViewOnly||current.collabReadOnly||deletePending;$('#finish-count').textContent=done?(current.localFinished&&current.status!=='FINALIZADA'?'FINALIZADA · ENVIO PENDENTE':'CONTAGEM FINALIZADA'):deletePending?'AGUARDANDO ADM':'FINALIZAR CONTAGEM';
  if(current.collaborative)$('#finish-count').textContent=current.participantDone?'CONTAGEM FINALIZADA':current.localFinished?'FINALIZADA · ENVIO PENDENTE':current.status==='FINALIZADA'?'CONTAGEM FINALIZADA':'FINALIZAR CONTAGEM';
  $('#reopen-count').hidden=!user?.allStores||current.status!=='FINALIZADA'||current.kind==='RECONTAGEM'||deletePending;
  $('#reopen-count').disabled=openingCount||loadingSessions;
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
  $('#account-label').textContent=user.master?'ACESSO MASTER':user.allStores?'ACESSO ADMINISTRATIVO':user.multiStore?'ACESSO A VÁRIAS LOJAS':user.store;
  $('#store-code').innerHTML=((user.allStores||user.multiStore)?'<option value="">Selecione a loja</option>':'')+stores.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');$('#store-code').value=user.store||'';$('#store-code').disabled=!user.allStores&&!user.multiStore;$('#count-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('#tab-analysis').hidden=!user.allStores;$('#tab-divergence').hidden=!user.allStores;
  const today=$('#count-date').value,from=new Date(today+'T12:00:00-03:00');from.setDate(from.getDate()-89);$('#filter-end').value=today;$('#filter-start').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(from);
  $('#filter-store').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option>'+esc(s)+'</option>').join('');
  $('#history-store-filter').innerHTML='<option value="">Todas as lojas</option>'+stores.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 $('#count-responsible').value=current?.responsible||$('#count-responsible').value;
 $('#filter-brand').innerHTML='<option value="">Todas as marcas</option>';$('#register-gama').hidden=!user.allStores||(stores.includes('UBRA')&&stores.includes('TESTE'));$('#tab-settings').hidden=!user.master;
}
async function boot(){
 const r=await api('bootstrap');user=r.user;stores=r.stores;
 if(user.allStores){try{const access=await adminApi('list');user.master=true;accessUsers=access.users||[];accessStores=access.stores||[];accessAudit=access.audit||[];}catch{user.master=false;}}
 sessions=[];sessionsLoaded=false;auditSession();
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
    const r=await api('list',{filterStore:historyStoreFilter||undefined});
    const latest=current;
    sessions=r.data||[];
    if(latest&&!sessions.some(s=>s.id===latest.id)&&(!historyStoreFilter||latest.store===historyStoreFilter)){remoteUnavailable('Esta contagem não está na lista disponível. A cópia local foi preservada.');}
    else if(latest){const metadata=sessions.find(s=>s.id===latest.id);latest.label=metadata.label;sessions=sessions.map(s=>s.id===latest.id?latest:s);render();}
    if(r.deletionSync?.length)$('#app-error').textContent=r.deletionSync.length+' exclusão(ões) aguardando confirmação da planilha. A sincronização será repetida automaticamente ao atualizar as contagens.';
    else if(sessions.some(s=>s.sheetMissing))$('#app-error').textContent='Há contagem com a aba ausente na planilha. Os dados centrais foram preservados; nenhuma exclusão automática foi feita.';
    sessionsLoaded=true;picker();renderDivergenceOptions();
  }catch(e){$('#app-error').textContent=e.message;}
  finally{loadingSessions=false;picker();}
}
function openDeleteConfirm(action){
  const id=action==='history'?$('#session-picker').value:current?.id;if(!id)return;
  const item=sessions.find(s=>s.id===id)||(current?.id===id?current:null);
  deleteConfirmAction=action;
  $('#delete-confirm-title').textContent=action==='request'?'Solicitar exclusão?':'Excluir contagem?';
  $('#delete-confirm-message').textContent=action==='request'
    ?'Deseja solicitar a exclusão de '+(item?.label||'esta contagem')+'? Ela será ocultada da loja e ficará preservada para revisão do ADM.'
    :'Deseja excluir '+(item?.label||'esta contagem')+' do histórico e apagar apenas a aba desta contagem no Drive? Esta ação não pode ser desfeita.';
  $('#delete-confirm-yes').textContent=action==='request'?'SIM, SOLICITAR':'SIM, EXCLUIR';
  $('#delete-confirm-dialog').showModal();
}
async function deleteSession(idOverride){
  const id=idOverride||$('#session-picker').value;
  if(!user?.allStores||!id)return;
  try{
    const deletion=(await api('delete',{id})).data;await TPInventoryLocal.remove(user.id,id);
    sessions=sessions.filter(s=>s.id!==id);
    if(current?.id===id){localStorage.removeItem(draftKey());current=null;serial=0;saved=0;retry=null;conflict=false;}
    picker();render();$('#app-error').textContent='';sync(deletion?.deletionPending?'Exclusão registrada no Hub. Remoção da aba pendente; o sistema tentará novamente ao sincronizar.':'Contagem excluída do Hub e da planilha.');loadRecounts();
  }catch(e){if(/já não existe|excluída da planilha/.test(e.message)){sessions=sessions.filter(s=>s.id!==id);if(current?.id===id){clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;}picker();render();$('#app-error').textContent='Esta contagem já foi excluída da planilha.';}else $('#app-error').textContent=e.message;}
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
  if(!current||user?.allStores||current.deleteStatus==='PENDENTE'||current.collabReadOnly||current.collabViewOnly)return;
  $('#request-delete-session').disabled=true;
  try{
    await ensureSaved();
    const target=current;
    const result=(await api('requestDelete',{id:target.id,participantId:target.participantId,auditSession:await auditSession()})).data;
    Object.assign(target,result);await persistDraft();clearTimeout(timer);timer=null;
    sessions=sessions.filter(s=>s.id!==target.id);current=null;inventoryHome=true;teamScope='own';picker();render();await renderDeviceDrafts();loadTeamCounts();
    $('#app-error').textContent='Solicitação enviada. A contagem foi ocultada da loja e está aguardando a análise do ADM. Os dados ficam preservados até a decisão.';
  }catch(e){$('#app-error').textContent=e.message;}
  finally{$('#request-delete-session').disabled=false;}
}
async function resolveDeletion(approve){
  if(!user?.allStores||!current||activeDeletionReviewId!==current.id||current.deleteStatus!=='PENDENTE')return;
  const id=current.id;if(approve&&!confirm('Os produtos da contagem foram revisados? Aprovar excluirá a aba e removerá a contagem do Inventário.'))return;
  $('#approve-delete').disabled=true;$('#reject-delete').disabled=true;
  try{const result=(await api('resolveDelete',{id,approve,reviewVersion:current.version,reason:$('#delete-review-reason').value.trim(),auditSession:await auditSession()})).data;
    if(approve){await TPInventoryLocal.remove(user.id,id);sessions=sessions.filter(item=>item.id!==id);localStorage.removeItem('tp-stockcount-draft-'+user.id+'-'+id);clearTimeout(timer);current=null;serial=0;saved=0;retry=null;conflict=false;activeDeletionReviewId=null;$('#app-error').textContent=result?.deletionPending?'Solicitação aprovada. A contagem saiu do Hub; a remoção da aba está pendente e será tentada novamente ao sincronizar.':'Solicitação aprovada. A contagem e a aba da planilha foram excluídas.';}
    else{current=Object.assign(current,result);activeDeletionReviewId=null;$('#app-error').textContent='Solicitação recusada. A contagem foi liberada para a loja.';}
    picker();render();loadDeletionRequests();if(sessionsLoaded)loadSessions();
  }catch(e){$('#app-error').textContent=e.message;}
  finally{render();}
}
function draftKey(){return 'tp-stockcount-draft-'+user.id+'-'+current.id;}
function persistDraft(hint){return localCheckpoint(hint);}
function changed(hint){
 serial++;persistDraft(hint);sync(navigator.onLine?'Salvo localmente · envio pendente…':'Sem conexão · salvando neste dispositivo','pending');render();
 if(!timer&&navigator.onLine)timer=setTimeout(()=>{timer=null;flush();},5000);
}
async function forgetEmpty(target){
 if(target&&current===target)remoteUnavailable('A contagem não está disponível no servidor. A cópia local foi preservada para exportação.');
}
let retryDelay=5000;
async function flush(){
 if(inflight)return inflight;if(!current||serial===saved||conflict||current.collaborative&&(current.collabReadOnly||current.collabViewOnly))return;
 if(!navigator.onLine||!auth?.access_token){sync(!navigator.onLine?'Sem conexão · cópia local preservada':'Entre novamente para enviar ao Drive. A cópia local está preservada.','pending');updateOfflineStatus();return;}
 const target=current;
 retry=retry||{serial,action:target.localFinished?'finish':'save',body:{id:target.id,version:target.version,requestId:uuid(),counts:structuredClone(target.counts),defects:structuredClone(target.defects),zeroEans:structuredClone(target.zeroEans||[]),...(target.collaborative?{participantId:target.participantId,participantVersion:target.participantVersion}:{}),responsible:target.responsible||$('#count-responsible').value.trim()}};
 const packet=retry;
 inflight=(async()=>{try{
  await persistDraft(); // Commit the exact request ID and payload before sending it.
  sync('Salvo neste dispositivo · enviando ao Drive…','pending');packet.body.auditSession=await auditSession();
  const response=await api(packet.action||'save',packet.body),result=response.data;
  if(result.empty){throw Error('A rotina da planilha sinalizou uma contagem vazia como removida. A cópia local foi preservada; não será apagada automaticamente.');}
  if(target.collaborative)applyTeamResult(target,result);
  target.version=result.version;target.updatedAt=result.updatedAt;target.status=result.status||target.status;
  saved=packet.serial;retry=null;retryDelay=5000;
  await persistDraft();if(serial===saved){localStorage.removeItem(draftKey());sync(target.collaborative?(target.participantDone?'Sua parte está salva · aguardando os demais responsáveis':'Lançamentos recebidos no servidor'):target.status==='FINALIZADA'?'Contagem finalizada no Google Drive':'Salvo no Google Drive');}else sync('Salvo localmente · alterações pendentes','pending');if(target.collaborative||packet.action==='finish')render();
 }catch(e){
  if(/sem permissão|não foi encontrada|original foi excluída|já não existe/.test(e.message)){
   remoteUnavailable('A contagem não está disponível no Drive. Os dados locais foram preservados para exportação.');return;}
  conflict=e.status===409;if(!conflict&&e.status&&e.status<500)note(e.message+' Os dados locais continuam disponíveis.',true);sync(conflict?'Drive alterado em outro acesso. Continue localmente e exporte para conferência.':'Salvo localmente · envio ao Drive pendente','error');if(conflict)note('As bipagens locais foram preservadas. O Drive não será sobrescrito.',true);retryDelay=Math.min(60000,retryDelay*2);
 }finally{inflight=null;updateOfflineStatus();if(current&&serial!==saved&&!conflict&&navigator.onLine&&auth?.access_token){clearTimeout(timer);timer=setTimeout(()=>{timer=null;flush();},retryDelay);}}})();return inflight;
}

async function ensureSaved(){
  clearTimeout(timer);
  while(serial!==saved){
    const previous=saved;await flush();clearTimeout(timer);
    if(serial===saved)return;
    if(saved===previous)throw Error('Aguarde o salvamento no Google Drive antes de continuar.');
  }
}
async function openCount(id,requestedAction){
  if(!id||openingCount)return;openingCount=true;stopCamera();
  try{
  // Persist the outgoing session independently; another draft must not block a recount.
  await persistDraft();await TPInventoryLocal.drain();if(inflight)await inflight;
  const action=requestedAction||(recounts.some(r=>r.id===id)||current?.id===id&&current.kind==='RECONTAGEM'?'openRecount':'read');
  const local=await TPInventoryLocal.restore(user.id,id);let remote;
  try{remote=(await api(local?.collaborative?'teamRead':action,{id,...(local?.collaborative?{participantId:local.participantId}:{})})).data;}catch(e){if(local&&(!navigator.onLine||!e.status||e.status>=500)){clearTimeout(timer);timer=null;adoptLocal(local);await activateTeamLock();inventoryHome=false;picker();render();sync('Cópia local preservada · envio pendente','pending');return;}throw e;}
  clearTimeout(timer);timer=null;
  if(local&&local.serial!==local.saved){adoptLocal(local);await activateTeamLock();if(!remote.collaborative&&remote.version!==local.version&&remote.lastRequestId!==local.retry?.body?.requestId){conflict=true;current.orphaned=true;}inventoryHome=false;picker();render();sync(conflict?'Drive alterado. Exporte a cópia local para conferência.':'Cópia local recuperada · sincronizando','pending');if(!conflict)flush();return;}
  current=remote;await activateTeamLock();teamScope=current.collabViewOnly?'total':'own';inventoryHome=false;recountPage=0;$('#recount-search').value='';serial=0;saved=0;retry=null;conflict=false;
  let restored=false;
  try{
    const draft=JSON.parse(localStorage.getItem(draftKey())||'null');
    const sameVersion=draft&&draft.version===current.version;
    const ownRetry=draft?.inflightId&&current.lastRequestId===draft.inflightId&&current.version===draft.version+1;
    if(draft&&(sameVersion||ownRetry)&&current.status!=='FINALIZADA'){current.counts=draft.counts;current.defects=draft.defects;current.zeroEans=draft.zeroEans||[];changed();restored=true;}
    else if(draft)note('Há um rascunho de outra versão neste navegador. A versão do Drive foi preservada.',true);
  }catch(_){}
  await persistDraft();picker();render();if(!restored)sync(current.status==='FINALIZADA'?'Contagem finalizada no Drive':'Salvo no Google Drive');$('#ean-input').focus();$('#counting').scrollIntoView({block:'start'});
  }finally{openingCount=false;}
}
async function createCount(){
  if(openingCount)return;openingCount=true;stopCamera();$('#new-count').disabled=true;
  try{
    const responsible=readResponsible();
    if(!navigator.onLine)throw Error('Para criar outra contagem, conecte à internet. A contagem preparada neste dispositivo pode continuar normalmente.');
    if(current){await persistDraft();await TPInventoryLocal.drain();if(inflight)await inflight;}
    const store=$('#store-code').value.trim().toUpperCase();
    if(!stores.includes(store))throw Error('Informe uma sigla de loja válida.');
    const date=$('#count-date').value;if(!date||!$('#count-date').checkValidity())throw Error('Selecione uma data válida para a contagem.');
    const creationKey='team-creating:'+user.id+':'+store+':'+date;
    const pendingCreate=await TPInventoryLocal.read('settings',creationKey);
    if(pendingCreate&&pendingCreate.responsible!==responsible)throw Error('Há uma criação pendente com '+pendingCreate.responsible+'. Use esse nome para recuperar.');
    const participantId=pendingCreate?.participantId||uuid();
    await TPInventoryLocal.setting(creationKey,{participantId,responsible});
    inventoryHome=false;current=(await api('create',{store,date,responsible,collaborative:true,participantId,auditSession:await auditSession()})).data;sessions.push(current);serial=0;saved=0;retry=null;conflict=false;teamScope='own';await activateTeamLock();await TPInventoryLocal.setting('responsible:'+user.id,responsible);loadTeamCounts();
    await persistDraft();await TPInventoryLocal.setting(creationKey,null);listPage.counts=0;listPage.defects=0;picker();render();sync(current.shareUrl?'Nova contagem criada · link de acompanhamento disponível':'Nova contagem criada no Drive');if(current.shareError)note('Contagem criada, mas não foi possível gerar o link: '+current.shareError,true);$('#ean-input').focus();
  }catch(e){alert(e.message);}finally{openingCount=false;$('#new-count').disabled=false;}
}
function readScanQuantity(){if(!largeQuantityEnabled)return 1;const raw=$('#large-quantity-input').value.trim(),value=Number(raw);return raw&&Number.isInteger(value)&&value>=1&&value<=MAX_PRODUCT_QUANTITY?value:null;}
function renderRecentScans(state=current){const rows=['counts','defects'].flatMap(kind=>(state?.[kind]||[]).map(r=>({...r,_kind:kind}))).sort((a,b)=>Date.parse(b.lastScannedAt||0)-Date.parse(a.lastScannedAt||0)).slice(0,3);$('#recent-scans').hidden=!rows.length;$('#recent-scans-list').innerHTML=rows.map(r=>'<li><span class="recent-scan-kind">'+(r._kind==='defects'?'DEFEITO':'CONTAGEM')+'</span><strong>'+esc(r.description||'Produto')+'</strong><span>'+esc(r.ean)+' · '+Number(r.quantity).toLocaleString('pt-BR')+' un.</span></li>').join('');}
function addScan(ean,allowUnknown=false,origin='LEITOR / DIGITAÇÃO',metadata=null,requestedQuantity=null){
  if(!editableTeam())return;
  const quantity=requestedQuantity??readScanQuantity();if(!Number.isInteger(quantity)||quantity<1||quantity>MAX_PRODUCT_QUANTITY){note('Informe uma quantidade inteira entre 1 e 1.000.',true);return;}const totals=countTotals(),productTotal=totals.byEan.get(ean)||0;if(productTotal+quantity>MAX_PRODUCT_QUANTITY){note('O EAN ultrapassaria o limite de 1.000 unidades.',true);return;}if(totals.total+quantity>MAX_STORE_QUANTITY){note('A loja atingiu o limite total de 10.000 unidades contadas.',true);return;}
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===ean)){note('Este EAN não está na solicitação de recontagem.',true);return;}
  current.zeroEans=(current.zeroEans||[]).filter(e=>e!==ean);
  if(current.kind==='RECONTAGEM'){recountPage=Math.floor(current.targets.findIndex(r=>r.ean===ean)/80);$('#recount-search').value='';}
  const kind=mode==='count'?'counts':'defects',p=catalog.get(ean);
  let row=current[kind].find(r=>r.ean===ean);
  if(!row){row={ean,quantity:0,description:p?.description||metadata?.description||'PRODUTO INEXISTENTE',brand:allowUnknown?String(metadata?.brand||''):p?.brand||metadata?.brand||'NÃO CADASTRADA',gender:metadata?.gender||'',color:metadata?.color||'',size:metadata?.size||'',subgroup:p?.subgroup||'',unknown:allowUnknown,origin,lastScannedAt:new Date().toISOString()};current[kind].push(row);}else{row.subgroup=row.subgroup||p?.subgroup||'';row.origin=origin;row.lastScannedAt=new Date().toISOString();}
  if(allowUnknown&&metadata){for(const existing of [...current.counts,...current.defects])if(existing.ean===ean&&existing.unknown)Object.assign(existing,{description:metadata.description,brand:metadata.brand,gender:metadata.gender,color:metadata.color,size:metadata.size,unknown:true});row.description=metadata.description;row.brand=metadata.brand;row.gender=metadata.gender;row.color=metadata.color;row.size=metadata.size;row.unknown=true;}
  row.quantity+=quantity;if(origin==='CÂMERA')current.recentCamera=[{ean:row.ean,description:row.description,brand:row.brand,subgroup:subgroupOf(row),mode,at:row.lastScannedAt},...(current.recentCamera||[])].slice(0,3);listPage[kind]=Math.floor(current[kind].indexOf(row)/PAGE_SIZE);changed({kind,ean});note(row.description);scanSound(true);$('#ean-input').value='';if(largeQuantityEnabled)$('#large-quantity-input').value='';if(!$('#camera-dialog').open)$('#ean-input').focus();return row;
}
async function scan(origin='LEITOR / DIGITAÇÃO'){
  if(!editableTeam()||lookingUp)return;
  const quantity=readScanQuantity();if(quantity===null){note('Informe uma quantidade inteira entre 1 e 1.000.',true);$('#large-quantity-input').focus();return;}pendingScanQuantity=quantity;
  const ean=$('#ean-input').value.trim();
  if(!new RegExp('^\\d{1,'+MAX_EAN_LENGTH+'}$').test(ean)){note('Confira o EAN informado: use apenas números e até '+MAX_EAN_LENGTH+' caracteres.',true);scanSound(false);$('#ean-input').select();return;}
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===ean)){note('Este EAN não está na solicitação de recontagem.',true);scanSound(false);$('#ean-input').select();return;}
  const existingUnknown=findUnknownProduct(ean);
  if(existingUnknown?.description&&existingUnknown?.brand&&existingUnknown?.gender&&existingUnknown?.color&&existingUnknown?.size){addScan(ean,true,origin,{description:existingUnknown.description,brand:existingUnknown.brand,gender:existingUnknown.gender,color:existingUnknown.color,size:existingUnknown.size},quantity);return;}
  if(existingUnknown){showUnknown(ean,origin,'Este EAN já foi lançado como produto inexistente. Complete ou confirme os dados antes de continuar.');return;}
  if(catalogComplete||catalog.has(ean)||!navigator.onLine){
    if(catalog.get(ean)){addScan(ean,false,origin,null,quantity);return;}
    showUnknown(ean,origin,catalogComplete?'O EAN não foi encontrado no cadastro. Informe os dados para lançamento provisório.':'Sem acesso ao cadastro offline. O lançamento será provisório até a sincronização.');return;
  }
  lookingUp=true;$('#catalog-status').textContent='Consultando EAN…';
  try{
    const result=await api('catalog',{ean}),product=result.data;cacheCatalog(ean,product?{ean:String(product[0]),description:product[1],brand:product[2],subgroup:product[3]||''}:null);
    if(!catalog.get(ean)){showUnknown(ean,origin,'O código não foi encontrado no cadastro de produtos.');return;}
    addScan(ean,false,origin,null,quantity);
  }catch(e){note('Não foi possível consultar o cadastro agora. Verifique a conexão e tente novamente.',true);scanSound(false);}
  finally{lookingUp=false;updateOfflineStatus();}
}
async function reopenCount(target=current){
 if(!target||!user?.allStores||target.status!=='FINALIZADA'||target.kind==='RECONTAGEM'||target.deleteStatus==='PENDENTE'||openingCount)return;
 if(!confirm('Reabrir '+target.label+'? A contagem ficará disponível para edição novamente. Se uma recontagem havia ajustado o total, esse ajuste será removido e poderá ser refeito depois.'))return;
 const buttons=[$('#reopen-count'),$('#reopen-session')];buttons.forEach(button=>button.disabled=true);
 try{
  await api('reopen',{id:target.id});
  if(current?.id===target.id){current.status='EM ANDAMENTO';current.localFinished=false;current.participantDone=false;}
  sessions=sessions.map(item=>item.id===target.id?{...item,status:'EM ANDAMENTO'}:item);
  selectedSessionId=target.id;
  await openCount(target.id,'read');
  sessions=sessions.map(item=>item.id===target.id?{...item,status:'EM ANDAMENTO'}:item);
  $('#app-error').textContent='Contagem reaberta. Os responsáveis podem continuar os lançamentos.';
 }catch(e){note(e.message,true);}
 finally{buttons.forEach(button=>button.disabled=false);picker();render();}
}
async function manageTeamPerson(personId,operation){
 if(!current?.collaborative||!user?.allStores||!personId||!['finish','clear'].includes(operation)||teamAdminActionBusy)return;
 const person=(current.participants||[]).find(p=>p.id===personId);if(!person)return;
 const message=operation==='finish'
  ?'Finalizar a parte de '+person.responsible+' agora? Somente os dados já sincronizados serão considerados. O responsável não poderá continuar lançando até que a parte seja reaberta.'
  :'Limpar todos os produtos e defeitos de '+person.responsible+'? Apenas os lançamentos sincronizados desta pessoa serão apagados; os demais responsáveis serão preservados.';
 if(!confirm(message))return;
 teamAdminActionBusy=true;renderTeam();picker();
 try{
  const response=await api('teamManage',{id:current.id,participantId:personId,operation});
  const snapshot=response.data;
  Object.assign(current,snapshot);
  current.collaborative=true;current.collabViewOnly=true;current.collabReadOnly=false;current.participantId=null;current.participantDone=false;current.peers=null;
  current.counts=snapshot.counts||[];current.defects=snapshot.defects||[];current.teamFetchedAt=new Date().toISOString();teamScope='total';
  sessions=sessions.map(item=>item.id===current.id?{...item,status:current.status}:item);
  render();sync(operation==='finish'?'Responsável finalizado e contagem sincronizada':'Parte do responsável limpa; demais partes preservadas');
 }catch(error){note(error.message,true);}
 finally{teamAdminActionBusy=false;renderTeam();picker();}
}
async function finishCount(){
 try{
  if(!current||current.localFinished||current.status==='FINALIZADA')return;
  if(current.kind==='RECONTAGEM'){const included=new Set(current.counts.concat(current.defects).map(r=>r.ean).concat(current.zeroEans||[]));if(current.targets.some(r=>!included.has(r.ean)))throw Error('Bipe ou marque como não localizado cada EAN solicitado.');}
  if(current.collabReadOnly||current.collabViewOnly)return;if(!confirm(current.collaborative?'Finalizar sua parte? Aguarde terminar todas as suas áreas. A contagem geral só encerra depois que todos os participantes finalizarem e sincronizarem.':'Finalizar a contagem neste dispositivo? O envio será concluído quando houver conexão.'))return;
  current.localFinished=true;changed();await persistDraft();await TPInventoryLocal.drain();sync('Finalizada neste dispositivo · envio pendente','pending');render();if(navigator.onLine)flush();
 }catch(e){note(e.message,true);}
}

function pivotAnalysis(data,brand='',subgroup=''){
  const selected=window.TPInventoryDashboard.latest(data,true),dates=[...new Set(selected.map(s=>s.date))].sort(),rows=new Map();
  selected.forEach(s=>s.counts.concat(s.defects).forEach(item=>{
    const key=s.store+'|'+item.ean,p={...item,subgroup:subgroupOf(item)||'Não informado'};if(brand&&p.brand!==brand||subgroup&&p.subgroup!==subgroup)return;
    const row=rows.get(key)||{store:s.store,ean:item.ean,description:p.description,brand:p.brand,subgroup:p.subgroup,values:{}};
    row.values[s.date]=(row.values[s.date]||0)+item.quantity;rows.set(key,row);
  }));
  return {dates,rows:[...rows.values()].sort((a,b)=>a.store.localeCompare(b.store)||a.description.localeCompare(b.description))};
}
function renderAnalysis(){
 if(!user?.allStores||!analysisCache)return;
 const {data,metadata,scope}=analysisCache,brand=$('#filter-brand').value,subgroup=$('#filter-subgroup').value;
 const result=pivotAnalysis(data,brand,subgroup),model=window.TPInventoryDashboard.model(data,metadata,{...scope,brand,subgroup,storeCount:stores.length});
 window.TPInventoryDashboard.render($('#analysis-dashboard'),model,{...scope,brand,subgroup});
 $('#analysis-head').innerHTML='<tr><th>LOJA</th><th>EAN</th><th>PRODUTO</th><th>MARCA</th><th>SUBGRUPO</th>'+result.dates.map(d=>'<th>'+esc(d.split('-').reverse().join('/'))+'</th>').join('')+'</tr>';
 $('#analysis-body').innerHTML=result.rows.map(r=>'<tr><td>'+esc(r.store)+'</td><td>'+esc(r.ean)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.brand)+'</td><td>'+esc(r.subgroup)+'</td>'+result.dates.map(d=>'<td class="'+(r.values[d]?'':'zero')+'">'+(r.values[d]||0)+'</td>').join('')+'</tr>').join('');
 $('#analysis-status').textContent=result.rows.length+' combinações loja/EAN · '+result.dates.length+' datas · '+data.length+' contagens finalizadas consultadas. Tabela: última contagem finalizada de cada loja por data; zeros indicam ausência de lançamento naquela data.';
}
async function analyze(event){
 event?.preventDefault();if(!user?.allStores)return;const request=++analysisRequest;
 const scope={store:$('#filter-store').value,start:$('#filter-start').value,end:$('#filter-end').value};
 if(!scope.start||!scope.end||scope.end<scope.start){$('#analysis-status').textContent='Informe um período válido.';return;}
 $('#analysis-status').textContent='Carregando contagens finalizadas…';$('#analysis-dashboard').setAttribute?.('aria-busy','true');
 try{
  const all=[];let offset=0,total=0;do{const r=await api('analysis',{filterStore:scope.store,startDate:scope.start,endDate:scope.end,offset,limit:40});if(request!==analysisRequest)return;all.push(...r.data.data);total=r.data.total;offset=r.data.nextOffset??0;$('#analysis-status').textContent='Carregando contagens… '+all.length+' de '+total;}while(offset);
  const metadata=(await api('list')).data||[];if(request!==analysisRequest)return;
  if(!subgroupCatalogReady&&all.some(c=>c.counts.concat(c.defects).some(r=>!r.subgroup&&!r.unknown))){const result=await api('catalog');if(request!==analysisRequest)return;for(const row of result.data||[])catalog.set(String(row[0]),{ean:String(row[0]),description:row[1],brand:row[2],subgroup:row[3]||''});subgroupCatalogReady=(result.data||[]).some(row=>row.length>3);}
  const data=all.map(withSubgroups),items=data.flatMap(c=>c.counts.concat(c.defects)),brands=[...new Set(items.map(r=>r.brand).filter(Boolean))].sort(),groups=[...new Set(items.map(r=>r.subgroup||'Não informado'))].sort();
  for(const [selector,values,label] of [['#filter-brand',brands,'Todas as marcas'],['#filter-subgroup',groups,'Todos os subgrupos']]){const old=$(selector).value;$(selector).innerHTML='<option value="">'+label+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');$(selector).value=values.includes(old)?old:'';}
  analysisCache={data,metadata,scope};renderAnalysis();
 }catch(e){if(request===analysisRequest){$('#analysis-dashboard').innerHTML='';$('#analysis-body').innerHTML='';$('#analysis-status').textContent=e.message;}}
 finally{if(request===analysisRequest)$('#analysis-dashboard').setAttribute?.('aria-busy','false');}
}
function divergenceLabel(session){
 const source=session.kind==='RECONTAGEM'?sessions.find(s=>s.id===session.sourceId):null;
 const date=new Date(session.kind==='RECONTAGEM'?(session.updatedAt||session.createdAt):session.date+'T12:00:00').toLocaleDateString('pt-BR');
 return (source?.label||session.label)+' · '+(session.kind==='RECONTAGEM'?'RECONTAGEM':'CONTAGEM')+' · '+date;
}
function renderDivergenceOptions(){
 if(!user?.allStores)return;
 const eligible=sessions.filter(s=>s.status==='FINALIZADA'&&!s.sheetMissing&&s.deleteStatus!=='PENDENTE');
 const optionList='<option value="">Selecione uma contagem</option>'+eligible.slice().sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.store)+' · '+esc(divergenceLabel(s))+'</option>').join('');
 for(const id of ['#divergence-first','#divergence-second']){const el=$(id),old=el.value;el.innerHTML=(id==='#divergence-first'?optionList:'<option value="">Comparar com a primeira</option>'+eligible.slice().sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.store)+' · '+esc(divergenceLabel(s))+'</option>').join(''));if(eligible.some(s=>s.id===old))el.value=old;}
}
function sumRows(state){
 const quantities=new Map(),products=new Map();
 (state.counts||[]).concat(state.defects||[]).forEach(row=>{quantities.set(row.ean,(quantities.get(row.ean)||0)+Number(row.quantity||0));if(!products.has(row.ean))products.set(row.ean,row);});
 return {quantities,products};
}
async function compareDivergence(event){
 event?.preventDefault();if(!user?.allStores)return;
 const request=++divergenceRequest,first=sessions.find(s=>s.id===$('#divergence-first').value),second=sessions.find(s=>s.id===$('#divergence-second').value)||null;
 const status=$('#divergence-status');$('#divergence-body').innerHTML='';$('#divergence-head').innerHTML='';
 if(!first){status.textContent='Escolha uma contagem ou recontagem.';return;}
 try{
  status.textContent='Carregando dados para comparação…';
  let rows=[],leftLabel='',rightLabel='',note='';
  const recount=first.kind==='RECONTAGEM'?first:second?.kind==='RECONTAGEM'?second:null;
  if(recount){
   if(second){const other=first.id===recount.id?second:first;if(other.id!==recount.sourceId)throw Error('Selecione somente a contagem original junto com a recontagem.');}
   const source=sessions.find(s=>s.id===recount.sourceId);
   if(!source)throw Error('A contagem original desta recontagem não está disponível para este acesso.');
   const result=await api('read',{id:recount.id});if(request!==divergenceRequest)return;
   const state=result.data,targets=state.targets||[],baseline=Array.isArray(state.baseline)?new Map(state.baseline.map(r=>[r.ean,Number(r.quantity)||0])):null;
   const current=sumRows(state),scanned=new Set(current.quantities.keys()),zeros=new Set(state.zeroEans||[]);
   leftLabel=divergenceLabel(source);rightLabel=divergenceLabel(recount);
   if(!baseline)note='A quantidade original não foi preservada nesta recontagem; não é possível calcular a diferença histórica.';
   rows=targets.map(target=>({ean:target.ean,description:target.description||current.products.get(target.ean)?.description||'',brand:target.brand||current.products.get(target.ean)?.brand||'',subgroup:target.subgroup||current.products.get(target.ean)?.subgroup||'',left:baseline?.has(target.ean)?baseline.get(target.ean):null,right:scanned.has(target.ean)?current.quantities.get(target.ean):zeros.has(target.ean)?0:current.quantities.get(target.ean)||0})).sort((a,b)=>a.description.localeCompare(b.description)||a.ean.localeCompare(b.ean));
  }else{
   if(!second)throw Error('Escolha uma segunda contagem para comparar.');
   if(first.id===second.id)throw Error('Escolha duas contagens diferentes.');
   
   const [a,b]=await Promise.all([api('read',{id:first.id}),api('read',{id:second.id})]);if(request!==divergenceRequest)return;
   const aa=sumRows(a.data),bb=sumRows(b.data),eans=new Set([...aa.quantities.keys(),...bb.quantities.keys()]);
   leftLabel=divergenceLabel(first);rightLabel=divergenceLabel(second);
   rows=[...eans].map(ean=>{const product=aa.products.get(ean)||bb.products.get(ean);return {ean,description:product?.description||'',brand:product?.brand||'',subgroup:product?.subgroup||'',left:aa.quantities.get(ean)||0,right:bb.quantities.get(ean)||0};}).sort((a,b)=>a.description.localeCompare(b.description)||a.ean.localeCompare(b.ean));
  }
  $('#divergence-head').innerHTML='<tr><th>EAN</th><th>PRODUTO</th><th>MARCA</th><th>SUBGRUPO</th><th>'+esc(leftLabel)+'</th><th>'+esc(rightLabel)+'</th><th>DIFERENÇA</th></tr>';
  $('#divergence-body').innerHTML=rows.map(r=>{const delta=r.left===null?null:r.right-r.left;return '<tr><td>'+esc(r.ean)+'</td><td>'+esc(r.description)+'</td><td>'+esc(r.brand)+'</td><td>'+esc(r.subgroup)+'</td><td>'+(r.left===null?'—':r.left)+'</td><td>'+r.right+'</td><td class="delta '+(delta===null?'':delta>0?'positive':delta<0?'negative':'')+'">'+(delta===null?'—':delta>0?'+'+delta:String(delta))+'</td></tr>';}).join('');
  status.innerHTML=esc(rows.length+' produtos · valores representam contagem + defeitos.')+(note?' <span class="divergence-note">'+esc(note)+'</span>':'');
  if(!rows.length)status.textContent='Nenhum produto dentro do escopo selecionado.';
 }catch(error){if(request===divergenceRequest)status.textContent=error.message;}
}
$('#divergence-filters').addEventListener('submit',compareDivergence);
function imports(){const state=teamExportState();warnTeamExport();return state.defects.concat(state.counts).map(r=>({EAN:r.ean,QNTD:r.quantity,'CÓDIGO IMPORTAÇÃO':r.ean+','+r.quantity}));}
function exportCsv(){
  if(!current)return;const blob=new Blob([imports().map(r=>r.EAN+','+r.QNTD).join('\r\n')],{type:'text/plain;charset=utf-8'}),url=window.URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='CONTAGEM_E_DEFEITOS_'+current.label+'.txt';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);
}
async function exportExcel(){
 try{if(current){warnTeamExport();TPInventoryExport.download(TPInventoryExport.workbook(teamExportState()),current.label+'.xlsx');}}catch(e){note('Não foi possível gerar o Excel. Baixe os arquivos TXT. '+e.message,true);}
}

function parseRecountTxt(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),result=[],seen=new Set(),invalid=[];
  lines.forEach((line,index)=>{const value=line.trim();if(!value)return;if(index===0&&/^(EAN|CÓDIGO|CODIGO)([;,\t]|$)/i.test(value))return;const ean=value.split(/[;,\t]/)[0].trim().replace(/^"|"$/g,'');if(!new RegExp('^\\d{1,'+MAX_EAN_LENGTH+'}$').test(ean)){invalid.push(index+1);return;}if(!seen.has(ean)){seen.add(ean);result.push(ean);}});
  if(invalid.length)throw Error('Confira as linhas '+invalid.slice(0,8).join(', ')+'. Use um EAN por linha, sem descrição.');
  if(!result.length||result.length>40000)throw Error('O TXT deve conter entre 1 e 40.000 EANs.');return result;
}
function loadZxing(){if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(zxingPromise)return zxingPromise;zxingPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../../shared/zxing-browser.min.js';s.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error('Leitor de câmera indisponível.'));s.onerror=()=>reject(Error('Não foi possível carregar o leitor local.'));document.head.append(s);});return zxingPromise;}
function stopCamera(close=true){cameraGeneration++;cameraActive=false;cameraLookup=false;if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=0;try{cameraControls?.stop();}catch(_){}cameraControls=null;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const video=$('#camera-video');if(video)video.srcObject=null;if(close&&$('#camera-dialog')?.open)$('#camera-dialog').close();}
function clearCameraCandidate(){cameraCandidate=null;$('#camera-product').hidden=true;$('#camera-launch').disabled=true;}
function renderCameraRecent(){
 const rows=current?.recentCamera||[];$('#camera-recent').hidden=!rows.length;
 $('#camera-recent-list').innerHTML=rows.slice(0,3).map(r=>'<li><strong>'+esc(r.description)+'</strong><span>'+esc(r.brand)+' · '+esc(subgroupOf(r)||'Não informado')+' · '+esc(r.ean)+' · '+esc(r.mode==='defects'?'DEFEITOS':'CONTAGEM')+' · '+esc(new Date(r.at).toLocaleTimeString('pt-BR'))+'</span></li>').join('');
}
function cameraEanCandidates(value){
 const ean=String(value||'').trim();if(!new RegExp('^\\d{8,'+MAX_EAN_LENGTH+'}$').test(ean))return[];
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
  if(!product){
   if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===detected)){$('#camera-status').textContent='Código '+detected+' lido, mas não faz parte desta solicitação de recontagem.';scanSound(false);return;}
   const already=findUnknownProduct(detected);
   if(already?.description&&already?.brand&&already?.gender&&already?.color&&already?.size){const row=addScan(detected,true,'CÂMERA',{description:already.description,brand:already.brand,gender:already.gender,color:already.color,size:already.size});if(row){renderCameraRecent();$('#camera-status').textContent='Produto já identificado. Quantidade lançada. Aponte para o próximo produto.';}return;}
   if(already)pendingScanQuantity=readScanQuantity()||1;
   cameraCandidate={ean:detected,session,mode,unknownPending:true};unknownOrigin='CÂMERA';if(!already)pendingScanQuantity=readScanQuantity()||1;$('#ean-input').value=detected;showUnknown(detected,'CÂMERA','O EAN não foi encontrado no cadastro. Informe os dados para lançamento pela câmera.');return;
  }
  cameraLastEan=product.ean;
  if(current.kind==='RECONTAGEM'&&!current.targets.some(t=>t.ean===product.ean)){ $('#camera-status').textContent='Código '+product.ean+' lido, mas não faz parte desta solicitação de recontagem.';scanSound(false);return;}
  cameraCandidate={...product,session,mode};$('#camera-product-name').textContent=product.description;$('#camera-product-meta').textContent=product.brand+' · '+(product.subgroup||'Não informado')+' · '+product.ean;$('#camera-product').hidden=false;$('#camera-launch').disabled=false;$('#camera-status').textContent='Confira o produto e toque em LANÇAR para registrar uma unidade.';
 }catch(_){if(cameraActive){$('#camera-status').textContent='Código detectado, mas não foi possível consultar o cadastro. Verifique a conexão e tente novamente.';scanSound(false);}}finally{if(generation===cameraGeneration)cameraLookup=false;}
}
function launchCameraProduct(){
 const candidate=cameraCandidate;if(!candidate||candidate.session!==current?.id||!cameraActive)return;
 $('#camera-launch').disabled=true;const quantity=readScanQuantity();if(quantity===null){note('Informe uma quantidade inteira entre 1 e 1.000.000.',true);$('#large-quantity-input').focus();return;}const row=addScan(candidate.ean,false,'CÂMERA',null,quantity);if(!row)return;
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

$('#recount-search').addEventListener('input',()=>{recountPage=0;renderRecount();});
$('#recount-prev').addEventListener('click',()=>{recountPage--;renderRecount();});
$('#recount-next').addEventListener('click',()=>{recountPage++;renderRecount();});
$('#access-user-search').addEventListener('input',renderAccessSettings);
$('#access-refresh').addEventListener('click',()=>loadAccessSettings());
$('#access-create-toggle').addEventListener('click',()=>{const form=$('#access-create-form'),open=form.hidden;form.hidden=!open;$('#access-create-toggle').setAttribute('aria-expanded',String(open));if(open)$('#new-user-name').focus();});
$('#access-create-cancel').addEventListener('click',()=>{$('#access-create-form').reset();$('#access-create-form').hidden=true;$('#access-create-toggle').setAttribute('aria-expanded','false');});
$('#access-create-form').addEventListener('submit',createAccessUser);
$('#access-user-list').addEventListener('click',event=>{const button=event.target.closest('[data-save-access]');const card=event.target.closest('[data-access-user]');if(button&&card)saveAccess(card);});
$('#register-gama').addEventListener('click',async()=>{
 if(!user?.allStores)return;const button=$('#register-gama');button.disabled=true;
 try{
 const r=await fetch(BASE+'/functions/v1/register-gama-admin',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:'{}'}),result=await r.json();
 if(!r.ok||!result.ok)throw Error(result.error||'Não foi possível configurar as lojas.');
 stores=Array.from(new Set(stores.filter(s=>s!=='GAMA').concat(result.stores))).sort();
 displayAccount();picker();render();loadTeamCounts();
 $('#app-error').textContent='UBRA configurada com o mesmo cadastro e senha CNPJ. Loja TESTE cadastrada com acesso próprio.';
 }catch(e){$('#app-error').textContent=e.message;}finally{button.disabled=false;}
});
$('#request-recount').addEventListener('click',requestRecountDialog);
$('#recount-request-form').addEventListener('submit',submitRecount);
$('#cancel-recount').addEventListener('click',()=>$('#recount-dialog').close());
$('#refresh-recounts').addEventListener('click',loadRecounts);
$('#recount-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-open-recount]');if(b){b.disabled=true;$('#recount-inbox-status').textContent='Abrindo recontagem…';openCount(b.dataset.openRecount,'openRecount').then(()=>{$('#recount-inbox-status').textContent='Recontagem aberta. Confira os produtos solicitados abaixo.';}).catch(e=>{$('#recount-inbox-status').textContent=e.message;}).finally(()=>{b.disabled=false;});}});
$('#refresh-deletions').addEventListener('click',loadDeletionRequests);
$('#deletion-inbox-list').addEventListener('click',event=>{const b=event.target.closest('[data-review-delete]');if(b)reviewDeletion(b.dataset.reviewDelete);});
$('#request-delete-session').addEventListener('click',()=>openDeleteConfirm('request'));
$('#delete-current-session').addEventListener('click',()=>openDeleteConfirm('active'));
$('#delete-confirm-no').addEventListener('click',()=>$('#delete-confirm-dialog').close());
$('#delete-confirm-yes').addEventListener('click',async()=>{
  const action=deleteConfirmAction;deleteConfirmAction=null;$('#delete-confirm-dialog').close();
  if(action==='request')await requestDeletion();else if(action==='history')await deleteSession();else if(action==='active')await deleteSession(current?.id);
});
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
$('#session-picker').addEventListener('change',event=>{selectedSessionId=event.target.value;picker();});
 $('#view-session').addEventListener('click',()=>{const selected=sessions.find(s=>s.id===$('#session-picker').value);if(selected)openCount(selected.id).catch(e=>note(e.message,true));});
 $('#reopen-session').addEventListener('click',()=>{const selected=sessions.find(s=>s.id===$('#session-picker').value);if(selected)reopenCount(selected);});
 $('#team-people').addEventListener('click',event=>{const button=event.target.closest('[data-person-action]');if(button)manageTeamPerson(button.dataset.personId,button.dataset.personAction);});
$('#history-store-filter').addEventListener('change',event=>{historyStoreFilter=event.target.value;sessions=[];sessionsLoaded=false;picker();loadSessions();});
$('#load-sessions').addEventListener('click',loadSessions);
$('#delete-session').addEventListener('click',()=>openDeleteConfirm('history'));
$('#scan-form').addEventListener('submit',event=>{event.preventDefault();scan();});
$('#large-quantity-toggle').addEventListener('click',()=>{largeQuantityEnabled=!largeQuantityEnabled;$('#large-quantity-toggle').setAttribute('aria-checked',String(largeQuantityEnabled));$('#large-quantity-state').textContent=largeQuantityEnabled?'LIGADO':'DESLIGADO';$('#large-quantity-field').hidden=!largeQuantityEnabled;$('#large-quantity-input').required=largeQuantityEnabled;if(largeQuantityEnabled){$('#large-quantity-input').value='';$('#large-quantity-input').focus();}else{$('#large-quantity-input').value='';$('#ean-input').focus();}render();});
$('#open-camera').addEventListener('click',()=>{if(!current||current.status==='FINALIZADA')return;$('#camera-dialog').showModal();startCamera();});
$('#camera-close').addEventListener('click',()=>stopCamera());$('#camera-dialog').addEventListener('close',()=>{stopCamera(false);});
for(const [id,max] of [['unknown-description',180],['unknown-color',80]])$('#'+id).addEventListener('input',event=>{event.target.value=cleanUnknownText(event.target.value,max);});
$('#unknown-size').addEventListener('input',event=>{event.target.value=String(event.target.value||'').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g,'').slice(0,4);});
$('#correct-ean').addEventListener('click',()=>{$('#unknown-dialog').close();unknown=null;if(cameraCandidate?.unknownPending){clearCameraCandidate();cameraLastEan='';$('#camera-status').textContent='Aponte a câmera para o código de barras.';}$('#ean-input').focus();$('#ean-input').select();});
$('#unknown-form').addEventListener('submit',event=>{event.preventDefault();const description=cleanUnknownText($('#unknown-description').value,180),brand=cleanUnknownText($('#unknown-brand').value,80),gender=$('#unknown-gender').value,color=cleanUnknownText($('#unknown-color').value,80),size=String($('#unknown-size').value||'').toLocaleUpperCase('pt-BR'),quantity=Number($('#unknown-quantity').value);$('#unknown-description').value=description;$('#unknown-brand').value=brand;$('#unknown-color').value=color;$('#unknown-size').value=size;if(!validUnknownText(description,180)||!validUnknownText(brand,80)||!['MASCULINO','FEMININO','UNISSEX','INFANTIL'].includes(gender)||!validUnknownText(color,80)||!/^[A-Z0-9]{1,4}$/.test(size)||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PRODUCT_QUANTITY){$('#unknown-form').reportValidity();return;}const row=addScan(unknown,true,unknownOrigin,{description,brand,gender,color,size},quantity);if(row){$('#unknown-dialog').close();unknown=null;if(unknownOrigin==='CÂMERA'){clearCameraCandidate();renderCameraRecent();$('#camera-status').textContent='Produto identificado e lançado. Aponte para o próximo produto.';}}});
document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render();document.querySelectorAll('.mode-button').forEach(x=>x.classList.toggle('active',x===b));$('#ean-input').focus();}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('click',event=>{
  const b=event.target.closest('[data-delta],[data-remove]');if(!b||!editableTeam())return;
  const list=current[b.dataset.kind],row=list.find(r=>r.ean===b.dataset.ean);if(!row)return;
  const next=b.dataset.remove?0:row.quantity+Number(b.dataset.delta),delta=next-row.quantity,totals=countTotals(),productTotal=totals.byEan.get(row.ean)||0;if(next>MAX_PRODUCT_QUANTITY||productTotal+delta>MAX_PRODUCT_QUANTITY||totals.total+delta>MAX_STORE_QUANTITY){note(productTotal+delta>MAX_PRODUCT_QUANTITY?'O EAN ultrapassaria 1.000 unidades.':'A loja atingiu o limite total de 10.000 unidades contadas.',true);return;}
  row.quantity=next;row.origin='AJUSTE MANUAL';row.lastScannedAt=new Date().toISOString();current[b.dataset.kind]=list.filter(r=>r.quantity>0);changed();
}));
document.querySelectorAll('#count-body,#defect-body').forEach(body=>body.addEventListener('change',event=>{
  const input=event.target.closest('[data-quantity]');if(!input||!editableTeam())return;
  const value=Number(input.value),list=current[input.dataset.list],row=list.find(r=>r.ean===input.dataset.ean);if(!row)return;
  if(!Number.isInteger(value)||value<1||value>MAX_PRODUCT_QUANTITY){input.value=String(row.quantity);note('Informe uma quantidade inteira entre 1 e 1.000.',true);return;}
  const delta=value-row.quantity,totals=countTotals(),productTotal=totals.byEan.get(row.ean)||0;if(productTotal+delta>MAX_PRODUCT_QUANTITY||totals.total+delta>MAX_STORE_QUANTITY){input.value=String(row.quantity);note(productTotal+delta>MAX_PRODUCT_QUANTITY?'O EAN ultrapassaria 1.000 unidades.':'A loja atingiu o limite total de 10.000 unidades contadas.',true);return;}
  if(value!==row.quantity){row.quantity=value;row.origin='AJUSTE MANUAL';row.lastScannedAt=new Date().toISOString();changed();}
}));
$('#finish-count').addEventListener('click',finishCount);$('#reopen-count').addEventListener('click',reopenCount);$('#export-txt').addEventListener('click',exportCsv);
$('#analysis-filters').addEventListener('submit',analyze);
$('#filter-brand').addEventListener('change',renderAnalysis);$('#filter-subgroup').addEventListener('change',renderAnalysis);
function showTab(name){const count=name==='count',analysis=name==='analysis',divergence=name==='divergence',settings=name==='settings';$('#count-view').hidden=!count;$('#analysis-view').hidden=!analysis;$('#divergence-view').hidden=!divergence;$('#settings-view').hidden=!settings;$('#tab-count').classList.toggle('active',count);$('#tab-analysis').classList.toggle('active',analysis);$('#tab-divergence').classList.toggle('active',divergence);$('#tab-settings').classList.toggle('active',settings);render();if(analysis)analyze();if(divergence)renderDivergenceOptions();if(settings)loadAccessSettings();}
$('#tab-count').addEventListener('click',()=>showTab('count'));$('#tab-analysis').addEventListener('click',()=>showTab('analysis'));$('#tab-divergence').addEventListener('click',()=>showTab('divergence'));$('#tab-settings').addEventListener('click',()=>showTab('settings'));
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

$('#camera-launch').addEventListener('click',launchCameraProduct);
$('#camera-rescan').addEventListener('click',()=>{clearCameraCandidate();cameraLastEan='';$('#camera-status').textContent='Aponte para o código de barras.';});
$('#back-inventory-home').addEventListener('click',()=>showInventoryHome().catch(e=>$('#app-error').textContent=e.message));
$('#device-draft-list').addEventListener('click',event=>{const b=event.target.closest('[data-resume-draft]');if(b)resumeDeviceDraft(b.dataset.resumeDraft).catch(e=>$('#app-error').textContent=e.message);});


$('#team-refresh').addEventListener('click',loadTeamCounts);
$('#store-code').addEventListener('change',loadTeamCounts);
$('#team-open-list').addEventListener('click',event=>{const b=event.target.closest('[data-team-join]');if(b)joinTeamCount(b.dataset.teamJoin).catch(e=>$('#team-open-status').textContent=e.message);});
$('#team-own').addEventListener('click',()=>{teamScope='own';listPage.counts=0;listPage.defects=0;render();});
$('#team-total').addEventListener('click',()=>{teamScope='total';listPage.counts=0;listPage.defects=0;render();});
$('#count-responsible').addEventListener('input',()=>{const input=$('#count-responsible');input.setCustomValidity(validResponsible(input.value)?'':'Informe pelo menos 4 letras, sem números.');});
setInterval(()=>{if(user&&auth&&navigator.onLine&&!document.hidden){loadTeamCounts();if(current?.collaborative&&!inventoryHome)refreshTeam();}},10000);
