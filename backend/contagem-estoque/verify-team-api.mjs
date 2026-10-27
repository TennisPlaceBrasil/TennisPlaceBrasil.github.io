import assert from 'node:assert/strict';
let handler;let currentStore='APAR',mappedStores=[{sigla:'APAR'}],extraStores=[],known=true,deleted=false,listData=null,liveList=[],lastRPC,lastBridge,lastCreate,calls=0;
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://db.test':'server-secret'},serve:fn=>handler=fn};
globalThis.EdgeRuntime={waitUntil:p=>p.catch(()=>{})};
const uid='7a23b121-c29c-4513-8a26-d7822f04149d';
globalThis.fetch=async(url,options={})=>{
 const parsed=new URL(url),path=parsed.pathname;
 if(path.includes('/rpc/')){
  if(path.endsWith('stockcount_team_mirror'))return Response.json(null);
  if(path.endsWith('stockcount_team_pending_mirrors'))return Response.json([]);
  lastRPC=JSON.parse(options.body);
  if(lastRPC.p_action==='list')return Response.json(liveList);
  if(lastRPC.p_action==='find')return Response.json(null);
  return Response.json({id:'c',store:'APAR',collaborative:true,counts:[],defects:[],participants:[],participantVersion:1,version:2,status:'EM ANDAMENTO'});
 }
 if(path.endsWith('manual_portal_members'))return Response.json([{active:true,profiles:['loja']}]);
 if(path.endsWith('manual_portal_store_logins'))return Response.json(mappedStores);
 if(path.endsWith('stockcount_user_store_access'))return Response.json(extraStores);
 if(path.endsWith('stockcount_bridge_config'))return Response.json([{endpoint:'https://bridge.test',secret:'bridge-secret'}]);
 if(path.endsWith('stockcount_team_counts'))return Response.json(known?[{id:'c',store:currentStore,deleted,meta:{},revision:0}]:[]);
 if(parsed.hostname==='bridge.test'){calls++;lastBridge=JSON.parse(options.body);if(lastBridge.action==='create')lastCreate=lastBridge;if(lastBridge.action==='read'&&lastBridge.id==='legacy-aras'&&!(lastBridge.allowedStores||[]).includes('ARAS'))return Response.json({ok:false,error:'Contagem sem permissão.'});if(['list','deletionInbox'].includes(lastBridge.action)&&listData)return Response.json({ok:true,data:listData});return Response.json({ok:true,data:{id:'legacy',store:'APAR',counts:[],defects:[],version:0}});}
 if(path.endsWith('stockcount_share_links'))return Response.json([]);
 throw Error('Unexpected '+url);
};
await import('./index.ts');
function req(body,id=uid){const encoded=Buffer.from(JSON.stringify({sub:id})).toString('base64url');return new Request('https://api.test',{method:'POST',headers:{Authorization:'Bearer e30.'+encoded+'.sig','Content-Type':'application/json'},body:JSON.stringify(body)});}
let r=await handler(req({action:'bootstrap'}));assert.equal(r.status,200);assert.equal(calls,0);
r=await handler(req({action:'teamJoin',id:'c',participantId:'12345678-1234-1234-1234-123456789012',responsible:'Ana1'}));assert.equal(r.status,400);
r=await handler(req({action:'teamJoin',id:'c',participantId:'12345678-1234-1234-1234-123456789012',responsible:'João'}));assert.equal(r.status,200);assert.equal(lastRPC.p_user,uid);assert.equal(lastRPC.p_action,'join');
currentStore='ARAS';r=await handler(req({action:'save',id:'c',participantId:'p',counts:[],defects:[],allStores:true,store:'ARAS'}));assert.equal(r.status,403,'Store spoof cannot reach other count');currentStore='APAR';
r=await handler(req({action:'save',id:'c',counts:[],defects:[]}));assert.equal(r.status,400,'Old client must not overwrite shared totals');
r=await handler(req({action:'save',id:'c',participantId:'p',counts:[],defects:[],participantVersion:0,requestId:'test-request-00001'}));assert.equal(r.status,200);assert.equal(lastRPC.p_action,'save');assert.equal(lastRPC.p_user,uid);
r=await handler(req({action:'read',id:'c'}));assert.equal(r.status,400);assert.match((await r.json()).error,/responsável/);
r=await handler(req({action:'teamManage',id:'c',participantId:'p',operation:'clear'}));assert.equal(r.status,403,'Regular users cannot clear another participant');
const adminId='adb6a08e-1a28-4b41-8dde-addd9c06f915';
r=await handler(req({action:'teamManage',id:'c',participantId:'p',operation:'clear'},adminId));assert.equal(r.status,200);assert.equal(lastRPC.p_action,'clear');assert.equal(lastRPC.p_user,adminId);assert.equal(lastRPC.p_person,'p');
r=await handler(req({action:'teamManage',id:'c',participantId:'p',operation:'finish'},adminId));assert.equal(r.status,200);assert.equal(lastRPC.p_action,'finish');
known=false;r=await handler(req({action:'read',id:'legacy'}));assert.equal(r.status,200,'Legacy history is available inside the mapped store');assert.equal(lastBridge.action,'read');
r=await handler(req({action:'create',store:'APAR',collaborative:true,responsible:'ABC',participantId:'p'}));assert.equal(r.status,400,'Validate before creating Sheets tab');
r=await handler(req({action:'create',store:'ARAS',allStores:true,secret:'spoof'}));assert.equal(r.status,403,'Client cannot select a store outside its assigned stores');
r=await handler(req({action:'create',store:'APAR',allStores:true,secret:'spoof'}));assert.equal(r.status,200);assert.equal(lastCreate.store,'APAR');assert.equal(lastCreate.allStores,false);assert.equal(lastCreate.secret,'bridge-secret');
mappedStores=[{sigla:'APAR'}];extraStores=[{sigla:'JOIN'}];r=await handler(req({action:'bootstrap'}));const bootstrap=await r.json();assert.equal(bootstrap.user.multiStore,true);assert.deepEqual(bootstrap.stores,['APAR','JOIN']);
known=false;currentStore='JOIN';r=await handler(req({action:'read',id:'legacy-join'}));assert.equal(r.status,200,'An explicitly granted second store is readable');
currentStore='ARAS';r=await handler(req({action:'read',id:'legacy-aras'}));assert.equal(r.status,403,'An unassigned store stays inaccessible');currentStore='APAR';
known=true;deleted=true;r=await handler(req({action:'checkCount',id:'c'}));assert.equal((await r.json()).data.exists,false);
console.log('PASS: authenticated routing, mandatory name, store isolation, no legacy overwrite of shared count, server identity/secret override, tombstones');

deleted=false;known=true;listData=[{id:'c',store:'APAR',deleteStatus:'PENDENTE'},{id:'legacy-keep',store:'APAR'}];liveList=[];
r=await handler(req({action:'list'}));assert.deepEqual((await r.json()).data.map(x=>x.id),['legacy-keep'],'Pending central request cannot be resurrected by stale Sheets metadata');
deleted=true;listData=[{id:'c',store:'APAR'},{id:'child',store:'APAR',sourceId:'c'},{id:'legacy-keep',store:'APAR'}];
r=await handler(req({action:'list'}));assert.deepEqual((await r.json()).data.map(x=>x.id),['legacy-keep'],'Tombstone suppresses stale parent and recount projection');
deleted=false;listData=[];liveList=[{id:'c',store:'APAR',status:'FINALIZADA'}];
r=await handler(req({action:'list'}));const missing=(await r.json()).data;assert.equal(missing[0].id,'c');assert.equal(missing[0].sheetMissing,true,'Missing Sheet never deletes valid central data');
listData=[{id:'c',store:'APAR',deleteStatus:'PENDENTE'}];liveList=[{id:'c',store:'APAR',deleteStatus:'PENDENTE'}];
r=await handler(req({action:'deletionInbox'},'adb6a08e-1a28-4b41-8dde-addd9c06f915'));assert.equal((await r.json()).data.length,1,'Admin inbox deduplicates central and Sheets metadata');
console.log('PASS: stale Sheets cannot resurrect pending/deleted counts; missing sheet preserves central data; deletion inbox deduplicates');
