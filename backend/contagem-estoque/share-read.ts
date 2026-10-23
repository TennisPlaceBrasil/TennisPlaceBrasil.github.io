import {teamRecord,teamRPC,scheduleTeamMirror} from './team.ts';
const cors={"Access-Control-Allow-Origin":"https://tennisplacebrasil.github.io","Access-Control-Allow-Headers":"apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const project=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rows(table:string,query:string){const r=await fetch(project+"/rest/v1/"+table+"?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});if(!r.ok)throw new Error("Não foi possível validar o link.");return r.json();}
async function bridge(config:{endpoint:string;secret:string},payload:Record<string,unknown>){return fetch(config.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,secret:config.secret}),redirect:"follow",signal:AbortSignal.timeout(55000)});}
async function hash(token:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método inválido."},405);
 try{
  const body=await req.json(),token=String(body.token||"");
  if(body.action!=="read"||!/^[a-f0-9]{64}$/.test(token))return reply({error:"Link inválido ou expirado."},404);
  const digest=await hash(token),links=await rows("stockcount_share_links","select=count_id,store,expires_at,revoked_at&token_hash=eq."+digest+"&limit=1"),link=links[0];
  if(!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())return reply({error:"Este link expirou ou foi revogado."},404);
  const configs=await rows("stockcount_bridge_config","select=endpoint,secret&id=eq.1"),config=configs[0];
  if(!config?.endpoint)return reply({error:"A contagem está temporariamente indisponível."},503);
  const record=await teamRecord(link.count_id);let count;
  if(record){
    if(record.deleted||record.store!==link.store)return reply({error:"Esta contagem não está mais disponível."},404);
    count=await teamRPC('stockcount_team_snapshot',{p_id:record.id});count.shareParticipants=await teamRPC('stockcount_team_share_people',{p_id:record.id});scheduleTeamMirror(record.id,config);
  }else{
    const response=await bridge(config,{action:"read",id:link.count_id,store:link.store,allStores:true,userId:"share"});
    if(!response.ok)return reply({error:"Esta contagem não está mais disponível."},404);
    const result=await response.json();count=result?.data;
    if(!result.ok||!count||count.id!==link.count_id||count.store!==link.store)return reply({error:"Esta contagem não está mais disponível."},404);
  }
  if(count.collaborative){count.device=count.participants.map((p:{responsible:string;device:string})=>p.responsible+' · '+(p.device||'Não informado')).join(' / ');count.ip=count.participants.map((p:{responsible:string;ip:string})=>p.responsible+': '+(p.ip||'IP não capturado')).join(' / ');}
  const products=[...(Array.isArray(count.defects)?count.defects.map((r:Record<string,unknown>)=>({...r,kind:"DEFEITOS"})):[]),...(Array.isArray(count.counts)?count.counts.map((r:Record<string,unknown>)=>({...r,kind:"CONTAGEM"})):[])];
  return reply({data:{id:count.id,label:count.label,store:count.store,date:count.date,status:count.status,updatedAt:count.updatedAt,device:count.device||"Não registrado",ip:count.ip||"Não registrado",counts:count.counts||[],defects:count.defects||[],products,participants:count.shareParticipants||[]}});
 }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível carregar esta contagem."},500);}
});
