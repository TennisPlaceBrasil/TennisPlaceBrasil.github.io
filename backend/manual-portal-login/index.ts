import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const allowedOrigin="https://tennisplacebrasil.github.io";
const cors={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
Deno.serve(async req=>{
 if(req.headers.get("origin")&&req.headers.get("origin")!==allowedOrigin)return reply({error:"Origem não permitida."},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido."},405);
 try{
  const body=await req.json();
  const raw=typeof body.login==="string"?body.login:(typeof body.cnpj==="string"?body.cnpj:"");
  const cnpj=raw.replace(/\D/g,"");
  const sigla=raw.trim().toUpperCase();
  const isStore=/^[A-Z]{4}$/.test(sigla);
  if((!isStore&&(!/^[0-9.\/\s-]+$/.test(raw)||cnpj.length!==14))||typeof body.password!=="string"||!body.password||body.password.length>512)return reply({error:"Informe a sigla da loja e a senha."},400);
  const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const key=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("manual-login:"+(isStore?sigla:cnpj))))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const [limitResult,aliasResult]=await Promise.all([
   admin.rpc("manual_portal_login_limit",{attempt_key:key}),
   isStore
    ? admin.from("manual_portal_store_logins").select("user_id").eq("sigla",sigla).maybeSingle()
    : admin.from("manual_portal_login_aliases").select("user_id").eq("cnpj",cnpj).maybeSingle()
  ]);
  const {data:withinLimit,error:limitError}=limitResult;
  if(limitError)return reply({error:"Não foi possível validar o acesso. Tente novamente."},503);
  if(!withinLimit)return reply({error:"Muitas tentativas. Aguarde 15 minutos para tentar novamente."},429);
  const alias=aliasResult.data;
  let email="login-not-found-"+(isStore?sigla.toLowerCase():cnpj)+"@invalid.example";
  let member:null|{active:boolean;profiles:string[]}=null;
  if(alias){
   const [userResult,memberResult]=await Promise.all([
    admin.auth.admin.getUserById(alias.user_id),
    admin.from("manual_portal_members").select("active,profiles").eq("user_id",alias.user_id).maybeSingle()
   ]);
   if(userResult.data?.user?.email)email=userResult.data.user.email;
   member=memberResult.data;
  }
  const auth=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.signInWithPassword({email,password:body.password});
  if(error||!data.session||!alias)return reply({error:"Login ou senha inválidos, ou acesso ainda não liberado."},401);
  if(!member?.active||!member.profiles?.length){await auth.auth.signOut({scope:"local"});return reply({error:"Login ou senha inválidos, ou acesso ainda não liberado."},401);}
  return reply({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return reply({error:"Não foi possível entrar. Verifique os dados e tente novamente."},400)}
});
