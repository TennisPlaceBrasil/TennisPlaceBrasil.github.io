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
    const actions=new Set(["shareCreate","bootstrap","catalog","list","create","read","save","finish","analysis","delete","recountInbox","requestRecount","openRecount","checkCount","discardEmpty","importRows","requestDelete","deletionInbox","resolveDelete"]);
    if(!actions.has(input.action))return reply({error:"Ação inválida."},400);
    const userId=encodeURIComponent(user.id);
    const [members,mapping]=await Promise.all([
      rows("manual_portal_members","select=profiles,active&user_id=eq."+userId),
      rows("manual_portal_store_logins","select=sigla&user_id=eq."+userId),
    ]);
    const member=members[0];
    if(!member?.active)return reply({error:"Acesso não autorizado."},403);
    const analysts=new Set(["adb6a08e-1a28-4b41-8dde-addd9c06f915","42eb08bc-5fa7-4d74-8be5-cbe5c909ef30"]);
    const allStores=analysts.has(user.id);
    const store=mapping[0]?.sigla;
    if(!allStores&&!store)return reply({error:"Sua conta não possui loja liberada nesta ferramenta."},403);
    if(["list","read","analysis","delete","requestRecount","deletionInbox","resolveDelete"].includes(input.action)&&!allStores)return reply({error:"Histórico restrito aos administradores."},403);
    const stores=input.action==="bootstrap"&&allStores
      ? await rows("manual_portal_store_logins","select=sigla&order=sigla")
      : mapping;
    if(input.action==="bootstrap")return reply({user:{id:user.id,email:allStores?user.email:null,store,allStores},stores:stores.map((s:{sigla:string})=>s.sigla),sessions:[]});
    let createStores:{sigla:string}[]=[];
    if(input.action==="create"&&allStores)createStores=await rows("manual_portal_store_logins","select=sigla&order=sigla");
    if(input.action==="create"&&allStores&&!createStores.some(s=>s.sigla===input.store))return reply({error:"Loja inválida."},400);
    const config=await rows("stockcount_bridge_config","select=endpoint,secret&id=eq.1");
    if(!config[0]?.endpoint)return reply({error:"A integração com o Google Drive está aguardando a autorização inicial."},503);
    if(input.action==="shareCreate"){
      if(!allStores)return reply({error:"Somente administradores podem gerar links de acompanhamento."},403);
      return reply({data:await createSharedCount(String(input.id||""),String(input.store||""),user.id,config[0])});
    }
    const response=await fetch(config[0].endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      ...input,secret:config[0].secret,userId:user.id,allStores,store:allStores?input.store:store
    }),redirect:"follow",signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw new Error("O Google Drive não respondeu. Sua contagem permanece pendente no navegador.");
    const result=await response.json();
    if(!result.ok)return reply({error:result.error||"Não foi possível salvar no Drive."},result.error?.startsWith("CONFLICT:")?409:400);
    if(input.action==="create"&&result.data?.id){
      try{
        const share=await createSharedCount(String(result.data.id),String(result.data.store||input.store||store),user.id,config[0]);
        return reply({data:{...result.data,shareUrl:share.url,shareExpiresAt:share.expiresAt}});
      }catch(error){
        return reply({data:{...result.data,shareError:error instanceof Error?error.message:"Link não gerado."}});
      }
    }
    return reply({data:result.data});
  }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível concluir a operação."},500);}
});
