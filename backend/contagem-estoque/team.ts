const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
type Config={endpoint:string;secret:string};
export async function teamRPC(name:string,body:Record<string,unknown>){
 const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)}),data=await r.json();
 if(!r.ok)throw new Error(data.message||'Não foi possível sincronizar a contagem.');return data;
}
export async function teamRecord(id:string){
 const r=await fetch(url+'/rest/v1/stockcount_team_counts?id=eq.'+encodeURIComponent(id)+'&select=id,store,deleted,meta,revision,mirrored_revision,mirror_error',{headers});
 if(!r.ok)throw Error('Não foi possível conferir a contagem colaborativa.');return (await r.json())[0];
}
export function validResponsible(value:unknown){return typeof value==='string'&&value.length<=80&&/^[\p{L} ]+$/u.test(value.trim())&&value.replace(/ /g,'').length>=4;}
async function bridge(config:Config,payload:Record<string,unknown>){
 const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,secret:config.secret}),redirect:'follow',signal:AbortSignal.timeout(55000)});
 if(!r.ok)throw Error('Planilha temporariamente indisponível.');let result;try{result=JSON.parse(await r.text());}catch{throw Error('A integração da planilha respondeu em formato inválido. Os dados permanecem no Hub.');}if(!result.ok)throw Error(result.error||'Falha na planilha.');return result.data;
}
export async function mirrorTeam(id:string,config:Config){
 const lease=crypto.randomUUID();const snapshot=await teamRPC('stockcount_team_mirror',{p_id:id,p_action:'claim',p_lease:lease});if(!snapshot)return false;
 let error:string|null=null;
 try{
  if(snapshot.deleted){
   // The tombstone is durable. A timeout or lost response is retried under the same lease.
   const before=await bridge(config,{action:'checkCount',id,store:snapshot.store,allStores:true,userId:'team-mirror'});
   if(before.exists)await bridge(config,{action:'delete',id,store:snapshot.store,allStores:true,userId:'team-mirror'});
   const after=await bridge(config,{action:'checkCount',id,store:snapshot.store,allStores:true,userId:'team-mirror'});
   if(after.exists)throw Error('Exclusão registrada no Hub; remoção da aba ainda pendente.');
  }else{
  const current=await bridge(config,{action:'read',id,store:snapshot.store,allStores:true,userId:'team-mirror'});
  const requestId='team-'+id+'-'+snapshot.version;
  if(current.lastRequestId===requestId){
   await bridge(config,{action:'syncAttribution',id,store:snapshot.store,allStores:true,userId:'team-mirror',version:current.version,counts:snapshot.counts,defects:snapshot.defects});
  }
  if(current.lastRequestId!==requestId){
   // CAS in Apps Script prevents a delayed older HTTP request overwriting a newer projection.
   if(current.status==='FINALIZADA'){
     if(snapshot.status==='EM ANDAMENTO'){
       const reopened=await bridge(config,{action:'reopen',id,store:snapshot.store,allStores:true,userId:'team-mirror'});
       await bridge(config,{action:'save',id,store:snapshot.store,allStores:true,userId:'team-mirror',version:reopened.version,requestId,counts:snapshot.counts,defects:snapshot.defects});
       await teamRPC('stockcount_team_mirror',{p_id:id,p_action:'complete',p_lease:lease,p_revision:snapshot.version,p_error:null});return true;
     }
     const quantities=(rows:any[])=>JSON.stringify(rows.map(r=>[r.ean,Number(r.quantity)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
     if(snapshot.status==='FINALIZADA'&&quantities(current.counts)===quantities(snapshot.counts)&&quantities(current.defects)===quantities(snapshot.defects)){
       await bridge(config,{action:'syncAttribution',id,store:snapshot.store,allStores:true,userId:'team-mirror',version:current.version,counts:snapshot.counts,defects:snapshot.defects});
       await teamRPC('stockcount_team_mirror',{p_id:id,p_action:'complete',p_lease:lease,p_revision:snapshot.version,p_error:null});return true;
     }
     throw Error('A planilha foi finalizada fora da sincronização; cópia central preservada.');
   }
   // Empty finalized sessions stay auditable instead of invoking the legacy empty-tab deletion.
   const action=snapshot.status==='FINALIZADA'?'finish':'save';
   await bridge(config,{action,id,store:snapshot.store,allStores:true,userId:'team-mirror',version:current.version,requestId,counts:snapshot.counts,defects:snapshot.defects,
    auditSession:{device:'Responsáveis: '+snapshot.participants.map((p:{responsible:string})=>p.responsible).join(', ').slice(0,80),ip:'Consulte o painel por responsável'}});
  }
  }
 }catch(e){error=e instanceof Error?e.message:'Espelhamento pendente.';}
 await teamRPC('stockcount_team_mirror',{p_id:id,p_action:'complete',p_lease:lease,p_revision:snapshot.version,p_error:error});return true;
}
export function scheduleTeamMirror(id:string,config:Config){
 const task=(async()=>{for(let i=0;i<3;i++){if(!await mirrorTeam(id,config))return;const record=await teamRecord(id);if(!record||record.mirrored_revision>=record.revision||record.mirror_error)return;}})().catch(()=>{});
 const runtime=(globalThis as unknown as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime;
 if(runtime)runtime.waitUntil(task);return task;
}
export async function reconcileTeamMirrors(config:Config,stores:string[]|null){
 const pending=await teamRPC('stockcount_team_pending_mirrors',{p_stores:stores,p_limit:3});
 for(const row of pending||[])scheduleTeamMirror(row.id,config);
}
async function deletionResult(id:string,config:Config){
 await mirrorTeam(id,config);
 const record=await teamRecord(id);
 return {id,deleted:true,deletionPending:!!record&&record.mirrored_revision<record.revision,mirrorError:record?.mirror_error||null};
}
export async function handleTeam(input:Record<string,any>,user:{id:string},allStores:boolean,store:string|undefined,config:Config,allowedStores:string[]=[]){
 const call=(action:string,id=input.id,person=input.participantId||null,payload:Record<string,unknown>=input)=>teamRPC('stockcount_team',{p_action:action,p_user:user.id,p_id:id||null,p_person:person,p_payload:payload});
 if(input.action==='teamList'){
  const selected=input.store||null;
  if(selected&&!allStores&&!allowedStores.includes(selected))throw Error('Contagem sem permissão.');
  return {handled:true,data:await call('list',null,null,{store:selected,allowedStores:allStores?null:allowedStores})};
 }
 const record=input.id?await teamRecord(String(input.id)):null;
 if(!record){if(['teamJoin','teamRead'].includes(input.action))throw Error('Esta contagem não está disponível para participação.');return {handled:false};}
 if(!allStores&&!allowedStores.includes(record.store))throw Error('Contagem sem permissão.');
 if(input.action==='checkCount')return {handled:true,data:{exists:!record.deleted}};
 if(record.deleted&&allStores&&(input.action==='delete'||input.action==='resolveDelete'&&input.approve===true))return {handled:true,data:await deletionResult(input.id,config)};
 if(record.deleted)throw Error('Esta contagem já não existe. A cópia local permanece disponível.');
 if(input.action==='discardEmpty')return {handled:true,data:{retained:true,empty:false}};
 if(input.action==='reopen'){
  if(!allStores)throw Error('Ação restrita aos administradores.');
  const data=await teamRPC('stockcount_team_reopen',{p_id:String(input.id),p_user:user.id});
  scheduleTeamMirror(input.id,config);return {handled:true,data};
 }
 const mapping:Record<string,string>={teamJoin:'join',teamRead:'read',save:'save',finish:'finish',requestDelete:'requestDelete',resolveDelete:'resolveDelete',delete:'delete'};
 if(input.action==='read'){
  if(!allStores&&!allowedStores.includes(record.store))throw Error('Contagem sem permissão.');
  if(!allStores&&record.meta?.status!=='FINALIZADA')throw Error('Contagem em andamento: Use ENTRAR NA CONTAGEM e informe seu responsável.');
  scheduleTeamMirror(input.id,config);return {handled:true,data:await call('read',input.id,null,{})};
 }
 if(input.action==='requestRecount'&&record.mirrored_revision<record.revision){scheduleTeamMirror(input.id,config);throw Error('Aguarde a atualização da planilha antes de solicitar recontagem.');}
 const action=mapping[input.action];if(!action)return {handled:false,record};
 if(['save','finish','teamJoin'].includes(input.action)&&!input.participantId)throw Error('Atualize a página e entre com o nome do responsável.');
 if(['teamJoin'].includes(input.action)&&!validResponsible(input.responsible))throw Error('RESPONSÁVEL: informe pelo menos 4 letras, sem números.');
 if(['save','finish'].includes(input.action)){
  // Validate in both layers; SQL also checks under the same transaction as the write.
  for(const kind of ['counts','defects'])if(!Array.isArray(input[kind])||input[kind].length>40000)throw Error('Lista de produtos inválida.');
 }
 if(input.auditSession)input.auditSession={id:String(input.auditSession.id||'').slice(0,80),device:String(input.auditSession.device||'').slice(0,100),ip:String(input.auditSession.ip||'IP não capturado').slice(0,80)};
 const data=await call(action);
 if(action==='delete'||action==='resolveDelete'&&input.approve){
  return {handled:true,data:await deletionResult(input.id,config)};
 }else scheduleTeamMirror(input.id,config);
 return {handled:true,data};
}
