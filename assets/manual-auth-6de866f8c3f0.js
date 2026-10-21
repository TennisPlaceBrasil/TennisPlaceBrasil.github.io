'use strict';
(() => {
 const URL='https://rihvnshexilakojnltox.supabase.co';
 const KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz';
 const client=window.supabase.createClient(URL,KEY,{auth:{storage:window.sessionStorage,storageKey:'tp-manuais-supabase-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const $=id=>document.getElementById(id);
 const profiles=['adm','loja','franqueado'];
 // Cache protected content only in memory. Every visit still goes through RLS.
 const resourceCache=new Map();let cacheBytes=0,cacheEpoch=0,bridgeToken=null;
 const CACHE_LIMIT=24*1024*1024;
 function clearResourceCache(){cacheEpoch++;resourceCache.clear();cacheBytes=0;bridgeToken=null;}
 function remember(key,html){
  const bytes=html.length*2;if(bytes>CACHE_LIMIT)return;
  const prefix=key.slice(0,key.lastIndexOf(':')+1);
  for(const old of resourceCache.keys())if(old.startsWith(prefix)){cacheBytes-=resourceCache.get(old).length*2;resourceCache.delete(old);}
  while(cacheBytes+bytes>CACHE_LIMIT&&resourceCache.size){const oldest=resourceCache.keys().next().value;cacheBytes-=resourceCache.get(oldest).length*2;resourceCache.delete(oldest);}
  resourceCache.set(key,html);cacheBytes+=bytes;
 }
 async function loadResource(portal,resource,progress=()=>{}){
  const epoch=cacheEpoch,prefix=portal+':'+resource+':';
  const priorKey=Array.from(resourceCache.keys()).find(key=>key.startsWith(prefix));
  const {data:saved,error}=await client.auth.getSession();
  if(error||!saved.session)throw new Error('A sessão foi encerrada. Entre novamente.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
  progress('Carregando conteúdo…');
  try{
   // SECURITY INVOKER RPC validates current membership and session through RLS.
   // An unchanged revision returns metadata only, so cached HTML is never downloaded twice.
   const response=await fetch(URL+'/rest/v1/rpc/manual_portal_load_resource',{
    method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+saved.session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({requested_portal:portal,requested_resource:resource,known_revision:priorKey?priorKey.slice(prefix.length):null}),cache:'no-store',signal:controller.signal
   });
   if(!response.ok)throw new Error('Não foi possível carregar o conteúdo. Verifique sua conexão ou entre novamente.');
   let data;
   if(response.body?.getReader){
    const reader=response.body.getReader(),decoder=new TextDecoder();let text='',received=0,last=0;
    for(;;){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});received+=value.byteLength;
     if(Date.now()-last>200){progress('Carregando conteúdo… '+Math.ceil(received/1024)+' KB');last=Date.now();}}
    text+=decoder.decode();data=JSON.parse(text);
   }else data=await response.json();
   if(epoch!==cacheEpoch)throw new Error('A sessão foi encerrada.');
   const item=data?.[0];if(!item)throw new Error('Conteúdo indisponível ou sem autorização para sua conta.');
   const key=prefix+item.revision;
   if(item.html===null){
    if(!resourceCache.has(key))throw new Error('O conteúdo precisa ser carregado novamente. Tente outra vez.');
    const html=resourceCache.get(key);resourceCache.delete(key);resourceCache.set(key,html);return html;
   }
   if(typeof item.html!=='string'||!item.html)throw new Error('O carregamento ficou incompleto. Tente novamente.');
   remember(key,item.html);return item.html;
  }catch(e){if(e.name==='AbortError')throw new Error('O carregamento demorou mais que o esperado. Tente novamente.');throw e;}
  finally{clearTimeout(timeout);}
 }
 window.addEventListener('message',async event=>{
  const frame=$('secure-frame');if(event.source!==frame.contentWindow||!viewerPortal)return;
  const m=event.data;if(m?.type==='tp-manual-ready'){
   if(!frame.srcdoc||!bridgeToken)return;
   viewerReady=true;stopMountTimer();frame.style.visibility='visible';$('viewer-status').textContent='';$('viewer-retry').hidden=true;
   frame.contentWindow.postMessage({type:'tp-manual-init',token:bridgeToken},'*');return;
  }
  if(m?.type!=='tp-manual-request'||m.token!==bridgeToken||!/^manual_[0-9]+\.html$/.test(m.resource)||!Number.isSafeInteger(m.id))return;
  const token=bridgeToken,portal=viewerPortal;
  const send=data=>{if(viewerPortal===portal&&bridgeToken===token)frame.contentWindow.postMessage({...data,token,id:m.id},'*');};
  try{const html=await loadResource(portal,m.resource,text=>send({type:'tp-manual-progress',text}));send({type:'tp-manual-content',html});}
  catch(e){send({type:'tp-manual-error',text:e.message});}
 });
 let member=null,viewerPortal=null,loadVersion=0;
 let viewerReady=false,mountTimer=null;
 function stopMountTimer(){clearTimeout(mountTimer);mountTimer=null;}
 function mountPortalHtml(html,version,attempt=0){
  if(version!==loadVersion||!viewerPortal)return;
  stopMountTimer();viewerReady=false;
  $('viewer-status').textContent=attempt?'Preparando o portal novamente…':'Preparando portal…';
  $('viewer-retry').hidden=true;
  const previous=$('secure-frame'),frame=previous.cloneNode(false);
  frame.removeAttribute('src');frame.removeAttribute('srcdoc');
  frame.style.visibility='hidden';
  // Set the document BEFORE insertion: no competing about:blank navigation on first open.
  frame.srcdoc=html;
  previous.replaceWith(frame);
  mountTimer=setTimeout(()=>{
   if(version!==loadVersion||viewerReady||!viewerPortal)return;
   if(attempt===0){mountPortalHtml(html,version,1);return;}
   $('viewer-status').textContent='Não foi possível exibir o portal. Tente abrir novamente.';
   $('viewer-retry').hidden=false;
  },10000);
 }

 const titles={adm:'Portal de Manuais do Administrativo',loja:'Portal de Manuais da Loja',franqueado:'Portal de Manuais do Franqueado'};
 const loading=$('auth-loading');
 const reveal=()=>{if(loading)loading.hidden=true;document.querySelector('main.login-card').hidden=false;};
 try{sessionStorage.removeItem('tp-manuais-session-v1')}catch{}
 function clearViewer(){loadVersion++;viewerPortal=null;viewerReady=false;bridgeToken=null;stopMountTimer();$('viewer-retry').hidden=true;$('secure-frame').srcdoc='';$('secure-viewer').hidden=true;document.body.classList.remove('viewing-manual');}
 function showLogin(message=''){
  reveal();
  member=null;clearResourceCache();clearViewer();$('login-form').hidden=false;$('portal-selection').hidden=true;
  document.querySelector('.login-subtitle').textContent='Entre com a sigla da loja ou seu e-mail';$('login-error').textContent=message;
 }
 function canOpen(profile){return member?.active&&(member.profiles.includes('adm')||member.profiles.includes(profile));}
 async function readMember(){
  const {data:saved,error:savedError}=await client.auth.getSession();
  if(savedError){if([401,403].includes(savedError.status)||['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used','refresh_token_expired'].includes(savedError.code))return null;throw new Error('Não foi possível restaurar a sessão. Tente novamente.');}
  if(!saved.session)return null;
  // Membership RLS validates the signed session against Auth on the server.
  const {data,error}=await client.from('manual_portal_members').select('profiles,active').maybeSingle();
  if(error)throw new Error('Não foi possível verificar sua permissão. Tente novamente.');
  return data;
 }
 function showPortals(){
  reveal();
  if(!member?.active||!profiles.some(canOpen)){showLogin('Sua conta não possui portais liberados. Solicite a liberação ao escritório.');return;}
  $('login-form').hidden=true;$('portal-selection').hidden=false;
  for(const p of profiles)$('link-'+p).hidden=!canOpen(p);
  document.querySelector('.login-subtitle').textContent='Selecione um dos portais liberados para sua conta';$('user-password').value='';
 }
 async function openPortal(profile){
  if(!profiles.includes(profile))return;
  const version=++loadVersion;stopMountTimer();viewerReady=false;bridgeToken=null;$('viewer-retry').hidden=true;
  $('login-error').textContent='';$('viewer-status').textContent='Carregando manual…';$('viewer-title').textContent=titles[profile];
  const emptyFrame=$('secure-frame').cloneNode(false);emptyFrame.removeAttribute('srcdoc');emptyFrame.removeAttribute('src');emptyFrame.style.visibility='hidden';$('secure-frame').replaceWith(emptyFrame);$('secure-viewer').hidden=false;document.body.classList.add('viewing-manual');viewerPortal=profile;
  try{
   if(!canOpen(profile))throw new Error('Sua conta não tem autorização para este portal.');
   const html=await loadResource(profile,'shell',text=>{if(version===loadVersion)$('viewer-status').textContent=text;});
   if(version!==loadVersion)return;
   bridgeToken=crypto.randomUUID();
   mountPortalHtml(html,version);

  }catch(e){if(version!==loadVersion)return;clearViewer();if(member)showPortals();else showLogin();$('login-error').textContent=e.message;}
 }
 $('viewer-retry').addEventListener('click',()=>{if(viewerPortal)openPortal(viewerPortal);});
 $('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');
  button.disabled=true;button.textContent='Entrando…';$('login-error').textContent='';
  try{
   const identifier=$('user-login').value.trim();const password=$('user-password').value;let error;
   if(identifier.includes('@')){
    ({error}=await client.auth.signInWithPassword({email:identifier.toLowerCase(),password}));
   }else{
    const sigla=identifier.toUpperCase();
    if(!/^[A-Z]{4}$/.test(sigla))throw new Error('Informe a sigla da loja com 4 letras ou seu e-mail.');
    const response=await fetch(URL+'/functions/v1/manual-portal-login',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({login:sigla,password}),cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Não foi possível entrar com esta sigla.');
    ({error}=await client.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token}));
   }
   $('user-password').value='';if(error)throw new Error('Login ou senha inválidos, ou conta ainda não confirmada.');
   member=await readMember();
   if(!member?.active||!profiles.some(canOpen)){await client.auth.signOut({scope:'local'});throw new Error('Sua conta não possui portais liberados. Solicite a liberação ao escritório.');}
   showPortals();
  }catch(e){showLogin(e.message||'Não foi possível entrar. Tente novamente.');}
  finally{button.disabled=false;button.textContent='Entrar no Portal';}
 });
 for(const p of profiles)$('link-'+p).addEventListener('click',e=>{e.preventDefault();openPortal(p)});
 async function logout(){showLogin();$('user-password').value='';await client.auth.signOut({scope:'local'});$('user-login').focus()}
 $('logout').addEventListener('click',logout);$('viewer-logout').addEventListener('click',logout);
 $('viewer-back').addEventListener('click',()=>{clearViewer();showPortals()});
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showLogin();});
 // Recheck authorization after returning to the tab and while viewing. Revocations clear loaded content.
 let checking=false;
 async function checkAccess(){if(!member||checking)return;checking=true;try{const fresh=await readMember();if(!fresh||!fresh.active||(viewerPortal&&!fresh.profiles.includes('adm')&&!fresh.profiles.includes(viewerPortal))){await logout();$('login-error').textContent='Acesso encerrado. Entre novamente ou solicite a liberação ao escritório.';}else{member=fresh;if(!viewerPortal)showPortals();else if(viewerReady)$('viewer-status').textContent='';}}catch{if(viewerPortal)$('viewer-status').textContent='Conexão interrompida. A sessão será verificada novamente.';else $('login-error').textContent='Conexão interrompida. Tentaremos validar sua sessão novamente.';}finally{checking=false}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkAccess()});setInterval(checkAccess,60000);
 async function restoreSession(){
  try{member=await readMember();if(member?.active&&profiles.some(canOpen)){showPortals();}else showLogin();}
  catch{if(loading){loading.hidden=false;loading.querySelector('p').textContent='Não foi possível validar sua sessão. Verifique a conexão e tente novamente.';loading.querySelector('button').hidden=false;}else showLogin('Não foi possível conectar ao serviço de acesso. Tente novamente.');}
 }
 if($('auth-retry'))$('auth-retry').addEventListener('click',restoreSession);
 restoreSession();
})();



