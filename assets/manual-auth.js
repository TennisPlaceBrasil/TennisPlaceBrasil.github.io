'use strict';
(() => {
 const URL='https://rihvnshexilakojnltox.supabase.co';
 const KEY='sb_publishable_7coOHeG2tOc9XfS0qeKvPg_z2fh0KWz';
 const client=window.supabase.createClient(URL,KEY,{auth:{storage:window.sessionStorage,storageKey:'tp-manuais-supabase-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const $=id=>document.getElementById(id);
 const profiles=['adm','loja','franqueado'];
 let selected='adm',member=null,viewerPortal=null,loadVersion=0;
 const titles={adm:'Portal de Manuais do Administrativo',loja:'Portal de Manuais da Loja',franqueado:'Portal de Manuais do Franqueado'};
 const desired=new URLSearchParams(location.search).get('portal');
 try{sessionStorage.removeItem('tp-manuais-session-v1')}catch{}
 function clearViewer(){loadVersion++;viewerPortal=null;$('secure-frame').srcdoc='';$('secure-viewer').hidden=true;document.body.classList.remove('viewing-manual');}
 function showLogin(message=''){
  member=null;clearViewer();$('login-form').hidden=false;$('profile-toggle').hidden=false;$('portal-selection').hidden=true;
  document.querySelector('.login-subtitle').textContent='Entre com seu e-mail ou CNPJ e sua senha';$('login-error').textContent=message;
 }
 function canOpen(profile){return member?.active&&(member.profiles.includes('adm')||member.profiles.includes(profile));}
 async function readMember(){
  const {data:user,error:authError}=await client.auth.getUser();
  if(authError||!user.user)return null;
  const {data,error}=await client.from('manual_portal_members').select('profiles,active').eq('user_id',user.user.id).maybeSingle();
  if(error)throw new Error('Não foi possível verificar sua permissão. Tente novamente.');
  return data;
 }
 function showPortals(){
  if(!member?.active||!profiles.some(canOpen)){showLogin('Sua conta não possui portais liberados. Solicite a liberação ao escritório.');return;}
  $('login-form').hidden=true;$('profile-toggle').hidden=true;$('portal-selection').hidden=false;
  for(const p of profiles)$('link-'+p).hidden=!canOpen(p);
  document.querySelector('.login-subtitle').textContent='Selecione um dos portais liberados para sua conta';$('user-password').value='';
 }
 window.setLoginType=type=>{
  if(!profiles.includes(type))return;selected=type;document.querySelector('.login-card').dataset.profile=type;
  for(const p of profiles){$('btn-'+p).classList.toggle('active',p===type);$('btn-'+p).setAttribute('aria-pressed',String(p===type))}
  $('login-error').textContent='';
 };
 async function openPortal(profile){
  if(!profiles.includes(profile))return;
  const version=++loadVersion;
  $('login-error').textContent='';$('viewer-status').textContent='Carregando manual…';$('viewer-title').textContent=titles[profile];
  $('secure-frame').srcdoc='';$('secure-viewer').hidden=false;document.body.classList.add('viewing-manual');viewerPortal=profile;
  try{
   member=await readMember();
   if(!canOpen(profile))throw new Error('Sua conta não tem autorização para este portal.');
   // RLS validates membership and profile for every chunk returned by Supabase.
   const {data,error}=await client.from('manual_portal_chunks').select('part,html').eq('portal',profile).order('part',{ascending:true});
   if(error)throw new Error('Não foi possível carregar o portal. Verifique sua conexão e tente novamente.');
   if(!data?.length||data.some((p,i)=>p.part!==i))throw new Error('O portal não está disponível para sua conta.');
   if(version!==loadVersion)return;
   $('secure-frame').srcdoc=data.map(row=>row.html).join('');$('viewer-status').textContent='';
  }catch(e){if(version!==loadVersion)return;clearViewer();if(member)showPortals();else showLogin();$('login-error').textContent=e.message;}
 }
 $('secure-frame').addEventListener('load',()=>{if(viewerPortal)$('viewer-status').textContent='';});
 $('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');
  button.disabled=true;button.textContent='Entrando…';$('login-error').textContent='';
  try{
   const identifier=$('user-login').value.trim();const password=$('user-password').value;let error;
   if(identifier.includes('@')){
    ({error}=await client.auth.signInWithPassword({email:identifier.toLowerCase(),password}));
   }else{
    const cnpj=identifier.replace(/\D/g,'');
    if(!/^[0-9.\/\s-]+$/.test(identifier)||cnpj.length!==14)throw new Error('Informe um e-mail ou CNPJ com 14 dígitos.');
    const response=await fetch(URL+'/functions/v1/manual-portal-login',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({cnpj,password}),cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Não foi possível entrar com este CNPJ.');
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
 async function checkAccess(){if(!member||checking)return;checking=true;try{const fresh=await readMember();if(!fresh||!fresh.active||(viewerPortal&&!fresh.profiles.includes('adm')&&!fresh.profiles.includes(viewerPortal))){await logout();$('login-error').textContent='Acesso encerrado. Entre novamente ou solicite a liberação ao escritório.';}else{member=fresh;showPortals()}}catch{showLogin('Não foi possível validar sua sessão. Entre novamente.')}finally{checking=false}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkAccess()});setInterval(checkAccess,60000);
 setLoginType(profiles.includes(desired)?desired:'adm');
 (async()=>{try{member=await readMember();if(member?.active&&profiles.some(canOpen)){showPortals();}else showLogin();}catch{showLogin('Não foi possível conectar ao serviço de acesso. Tente novamente.')}})();
})();
