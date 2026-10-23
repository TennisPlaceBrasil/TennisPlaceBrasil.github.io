import {handleTeam,teamRPC,teamRecord,scheduleTeamMirror,reconcileTeamMirrors,validResponsible} from './team.ts';
const cors = {
  "Access-Control-Allow-Origin": "https://tennisplacebrasil.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const project=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
function verifiedClaims(token:string){
  const part=token.split(".")[1];
  if(!part)throw new Error("Sessão inválida.");
  const base64=part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=");
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const claims=JSON.parse(new TextDecoder().decode(bytes));
  if(typeof claims.sub!=="string"||!claims.sub)throw new Error("Sessão inválida.");
  return {id:claims.sub,email:typeof claims.email==="string"?claims.email:null};
}
async function rows(table:string,query:string){
  const response=await fetch(project+"/rest/v1/"+table+"?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!response.ok)throw new Error("Não foi possível verificar as permissões.");
  return response.json();
}

const shareTokenHash=async(token:string)=>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
};
const shareToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
async function bridge(config:{endpoint:string;secret:string},payload:Record<string,unknown>){
  return fetch(config.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,secret:config.secret}),redirect:"follow",signal:AbortSignal.timeout(55000)});
}
async function createSharedCount(id:string,store:string,userId:string,config:{endpoint:string;secret:string}){
  if(!id||!store)throw new Error("Não foi possível identificar esta contagem.");
  const response=await bridge(config,{action:"read",id,store,allStores:true,userId});
  if(!response.ok)throw new Error("Não foi possível validar a contagem no Google Drive.");
  const result=await response.json(),count=result?.data;
  if(!result.ok||!count||count.id!==id||count.store!==store)throw new Error("Esta contagem não está mais disponível.");
  const token=shareToken(),digest=await shareTokenHash(token),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+30*24*60*60*1000);
  const revoke=await fetch(project+"/rest/v1/stockcount_share_links?count_id=eq."+encodeURIComponent(id)+"&revoked_at=is.null",{method:"PATCH",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({revoked_at:createdAt.toISOString()})});
  if(!revoke.ok)throw new Error("Não foi possível renovar o link anterior.");
  const insert=await fetch(project+"/rest/v1/stockcount_share_links",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({token_hash:digest,count_id:id,store,created_by:userId,expires_at:expiresAt.toISOString()})});
  if(!insert.ok)throw new Error("Não foi possível criar o link de acompanhamento.");
  return {url:"https://tennisplacebrasil.github.io/hub/apps/contagem-estoque/acompanhamento/?token="+token,expiresAt:expiresAt.toISOString(),label:count.label,store:count.store};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"Método inválido."},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!/^Bearer \S+$/.test(auth))return reply({error:"Entre para continuar."},401);
    let user:{id:string,email:string|null};
    try{user=verifiedClaims(auth.slice(7));}catch{return reply({error:"Sessão expirada. Entre novamente."},401);}
    const input=await req.json();
    const actions=new Set(["teamList","teamJoin","teamRead","shareCreate","bootstrap","catalog","list","create","read","save","finish","analysis","delete","recountInbox","requestRecount","openRecount","checkCount","discardEmpty","importRows","requestDelete","deletionInbox","resolveDelete"]);
    if(!actions.has(input.action))return reply({error:"Ação inválida."},400);
    const userId=encodeURIComponent(user.id);
    const [members,mapping,extraAccess]=await Promise.all([
      rows("manual_portal_members","select=profiles,active&user_id=eq."+userId),
      rows("manual_portal_store_logins","select=sigla&user_id=eq."+userId),
      rows("stockcount_user_store_access","select=sigla&user_id=eq."+userId),
    ]);
    const member=members[0];
    if(!member?.active)return reply({error:"Acesso não autorizado."},403);
    const analysts=new Set(["adb6a08e-1a28-4b41-8dde-addd9c06f915","42eb08bc-5fa7-4d74-8be5-cbe5c909ef30"]);
    const allStores=analysts.has(user.id);
    const allowedStores=Array.from(new Set([...mapping,...extraAccess].map((s:{sigla:string})=>s.sigla).filter(Boolean)));
    const store=allowedStores.length===1?allowedStores[0]:undefined;
    const multiStore=!allStores&&allowedStores.length>1;
    if(!allStores&&!allowedStores.length)return reply({error:"Sua conta não possui loja liberada nesta ferramenta."},403);

    const stores=input.action==="bootstrap"&&allStores
      ? await rows("manual_portal_store_logins","select=sigla&order=sigla")
      : [...mapping,...extraAccess];
    if(input.action==="bootstrap")return reply({user:{id:user.id,email:allStores?user.email:null,store,allStores,multiStore},stores:Array.from(new Set(stores.map((s:{sigla:string})=>s.sigla))),sessions:[]});
    let createStores:{sigla:string}[]=[];
    if(input.action==="create"&&allStores)createStores=await rows("manual_portal_store_logins","select=sigla&order=sigla");
    if(input.action==="create"&&allStores&&!createStores.some(s=>s.sigla===input.store))return reply({error:"Loja inválida."},400);
    if(input.action==="create"&&!allStores&&!allowedStores.includes(input.store))return reply({error:"Loja inválida ou sem acesso."},403);
    const config=await rows("stockcount_bridge_config","select=endpoint,secret&id=eq.1");
    if(!config[0]?.endpoint)return reply({error:"A integração com o Google Drive está aguardando a autorização inicial."},503);
    if(input.action==='create'&&input.collaborative&&(!validResponsible(input.responsible)||!input.participantId))return reply({error:'RESPONSÁVEL: informe pelo menos 4 letras, sem números.'},400);
    if(input.action==='create'&&input.collaborative){
      const recovered=await teamRPC('stockcount_team',{p_action:'find',p_user:user.id,p_person:input.participantId});
      if(recovered)return reply({data:recovered});
    }
    if(['teamList','list','deletionInbox','recountInbox','analysis'].includes(input.action))await reconcileTeamMirrors(config[0],allStores?null:allowedStores);
    const team=await handleTeam(input,user,allStores,store,config[0],allowedStores);
    if(team.handled)return reply({data:team.data});
    if(["list","read"].includes(input.action)&&!allStores&&!allowedStores.length)return reply({error:"Histórico sem loja autorizada."},403);
    if(["analysis","delete","requestRecount","deletionInbox","resolveDelete"].includes(input.action)&&!allStores)return reply({error:"Ação restrita aos administradores."},403);
    if(input.action==="shareCreate"){
      if(!allStores)return reply({error:"Somente administradores podem gerar links de acompanhamento."},403);
      return reply({data:await createSharedCount(String(input.id||""),String(input.store||""),user.id,config[0])});
    }
    const requestedStore=typeof input.filterStore==="string"&&input.filterStore?input.filterStore:null;
    if(requestedStore&&!allStores&&!allowedStores.includes(requestedStore))return reply({error:"Loja fora do acesso autorizado."},403);
    const response=await fetch(config[0].endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      ...input,secret:config[0].secret,userId:user.id,allStores,allowedStores:allStores?undefined:allowedStores,store:allStores?input.store:input.action==="create"?input.store:store,filterStore:requestedStore
    }),redirect:"follow",signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw new Error("O Google Drive não respondeu. Sua contagem permanece pendente no navegador.");
    const result=await response.json();
    if(!result.ok&&input.action==='deletionInbox'){result.ok=true;result.data=[];}
    if(!result.ok)return reply({error:result.error||"Não foi possível salvar no Drive."},result.error?.startsWith("CONFLICT:")?409:/permissão|restrit|não autorizado/i.test(result.error||"")?403:400);
    if(input.action==="create"&&result.data?.id){
      let shared:Record<string,unknown>={};
      try{
        const share=await createSharedCount(String(result.data.id),String(result.data.store||input.store||store),user.id,config[0]);
        shared={shareUrl:share.url,shareExpiresAt:share.expiresAt};
      }catch(error){
        shared={shareError:error instanceof Error?error.message:"Link não gerado."};
      }
      if(input.collaborative){
        const data=await teamRPC('stockcount_team',{p_action:'init',p_user:user.id,p_id:result.data.id,p_person:input.participantId,p_payload:{...result.data,...shared,responsible:input.responsible.trim(),auditSession:input.auditSession}});
        return reply({data});
      }
      return reply({data:{...result.data,...shared}});
    }
    if(input.action==='list'){
      const live=await teamRPC('stockcount_team',{p_action:'list',p_user:user.id,p_payload:{history:true,store:requestedStore}});
      const known=await rows('stockcount_team_counts','select=id,deleted,meta,store,revision,mirrored_revision,mirror_error');
      // Remove every central ID from the Sheets list before adding authorized live rows.
      // Hidden pending requests must not reappear from an older Sheets projection.
      const centralIds=new Set(known.map((r:any)=>r.id));
      const deletedIds=new Set(known.filter((r:any)=>r.deleted).map((r:any)=>r.id));
      const sheetIds=new Set((result.data||[]).map((r:any)=>r.id));
      const mapped=new Map((result.data||[]).filter((r:any)=>!centralIds.has(r.id)&&!deletedIds.has(r.sourceId)).map((r:any)=>[r.id,r]));
      for(const row of live)mapped.set(row.id,{...row,sheetMissing:!sheetIds.has(row.id)});
      result.data=Array.from(mapped.values());
      result.deletionSync=known.filter((r:any)=>r.deleted&&r.mirrored_revision<r.revision&&(allStores||allowedStores.includes(r.store))).map((r:any)=>({id:r.id,label:r.meta?.label,store:r.store,mirrorError:r.mirror_error}));

    }
    if(input.action==='recountInbox'){
      const known=await rows('stockcount_team_counts','select=id,deleted');
      const deletedIds=new Set(known.filter((r:any)=>r.deleted).map((r:any)=>r.id));
      result.data=(result.data||[]).filter((r:any)=>!deletedIds.has(r.id)&&!deletedIds.has(r.sourceId));
    }
    if(input.action==='analysis'){
      const live=await teamRPC('stockcount_team',{p_action:'list',p_user:user.id,p_payload:{history:true}});
      const relevant=live.filter((r:any)=>r.status==='FINALIZADA'&&(!input.filterStore||r.store===input.filterStore)&&r.date>=input.startDate&&r.date<=input.endDate);
      const known=await rows('stockcount_team_counts','select=id');
      const ids=new Set(known.map((r:any)=>r.id));result.data.data=(result.data.data||[]).filter((r:any)=>!ids.has(r.id));
      if(!input.offset)for(const row of relevant)result.data.data.push(await teamRPC('stockcount_team_snapshot',{p_id:row.id}));
    }
    if(input.action==='deletionInbox'){
      const live=await teamRPC('stockcount_team',{p_action:'list',p_user:user.id,p_payload:{history:true}});
      const known=await rows('stockcount_team_counts','select=id');
      const ids=new Set(known.map((r:any)=>r.id));
      const requests=[...(result.data||[]).filter((r:any)=>!ids.has(r.id)),...live.filter((r:{deleteStatus:string})=>r.deleteStatus==='PENDENTE')];
      result.data=Array.from(new Map(requests.map((r:any)=>[r.id,r])).values());
    }
    if(input.action==='finish'&&result.data?.kind==='RECONTAGEM'&&result.data?.sourceId){
      const source=await teamRecord(result.data.sourceId);
      if(source&&!source.deleted){
        const r=await bridge(config[0],{action:'read',id:source.id,store:source.store,allStores:true,userId:user.id});const original=await r.json();
        if(!original.ok)throw Error('Recontagem salva; aguarde a consolidação e tente sincronizar novamente.');
        await teamRPC('stockcount_team',{p_action:'adjustRecount',p_user:user.id,p_id:source.id,p_payload:original.data});
      }
    }
    return reply({data:result.data,...(result.deletionSync?{deletionSync:result.deletionSync}:{})});
  }catch(error){const message=error instanceof Error?error.message:"Não foi possível concluir a operação.";return reply({error:message},message.startsWith('CONFLICT:')?409:/permissão|restrit|inativo/.test(message)?403:/RESPONSÁVEL|inválid|finaliz|bloquead|Aguarde|Reabra|Atualize|Use ENTRAR|Identifica/.test(message)?400:500);}
});

