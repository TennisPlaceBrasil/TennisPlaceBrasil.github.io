const cors = {
  "Access-Control-Allow-Origin": "https://tennisplacebrasil.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const project=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rows(table:string,query:string){
  const response=await fetch(project+"/rest/v1/"+table+"?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!response.ok)throw new Error("Não foi possível verificar as permissões.");
  return response.json();
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"Método inválido."},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!/^Bearer \S+$/.test(auth))return reply({error:"Entre para continuar."},401);
    const userResponse=await fetch(project+"/auth/v1/user",{headers:{apikey:service,Authorization:auth}});
    if(!userResponse.ok)return reply({error:"Sessão expirada. Entre novamente."},401);
    const user=await userResponse.json();
    const input=await req.json();
    const actions=new Set(["bootstrap","catalog","list","create","read","save","finish","analysis","delete"]);
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
    if(["list","read","analysis","delete"].includes(input.action)&&!allStores)return reply({error:"Histórico restrito aos administradores."},403);
    const stores=input.action==="bootstrap"&&allStores
      ? await rows("manual_portal_store_logins","select=sigla&order=sigla")
      : mapping;
    if(input.action==="bootstrap")return reply({user:{id:user.id,email:allStores?user.email:null,store,allStores},stores:stores.map((s:{sigla:string})=>s.sigla),sessions:[]});
    let createStores:{sigla:string}[]=[];
    if(input.action==="create"&&allStores)createStores=await rows("manual_portal_store_logins","select=sigla&order=sigla");
    if(input.action==="create"&&allStores&&!createStores.some(s=>s.sigla===input.store))return reply({error:"Loja inválida."},400);
    const config=await rows("stockcount_bridge_config","select=endpoint,secret&id=eq.1");
    if(!config[0]?.endpoint)return reply({error:"A integração com o Google Drive está aguardando a autorização inicial."},503);
    const response=await fetch(config[0].endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      ...input,secret:config[0].secret,userId:user.id,allStores,store:allStores?input.store:store
    }),redirect:"follow",signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw new Error("O Google Drive não respondeu. Sua contagem permanece pendente no navegador.");
    const result=await response.json();
    if(!result.ok)return reply({error:result.error||"Não foi possível salvar no Drive."},result.error?.startsWith("CONFLICT:")?409:400);
    return reply({data:result.data});
  }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível concluir a operação."},500);}
});
