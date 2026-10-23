import assert from 'node:assert/strict';
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://db.test':'private-key'}};
const tasks=[];globalThis.EdgeRuntime={waitUntil:p=>tasks.push(p)};
let record={id:'fixture',store:'APAR',deleted:true,revision:4,mirrored_revision:3,mirror_error:null,meta:{}};
let lease=null,exists=true,mode='fail',deletes=0;
globalThis.fetch=async(url,options={})=>{
 const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};
 if(path.endsWith('stockcount_team_counts'))return Response.json([record]);
 if(path.endsWith('stockcount_team_pending_mirrors'))return Response.json(record.revision>record.mirrored_revision?[{id:record.id}]:[]);
 if(path.endsWith('stockcount_team_mirror')){
  if(body.p_action==='claim'){
   if(lease||record.mirrored_revision>=record.revision)return Response.json(null);
   lease=body.p_lease;return Response.json({id:record.id,store:record.store,version:record.revision,deleted:record.deleted});
  }
  if(lease===body.p_lease){if(!body.p_error)record.mirrored_revision=body.p_revision;record.mirror_error=body.p_error;lease=null;}
  return Response.json(null);
 }
 if(new URL(url).hostname==='bridge.test'){
  if(body.action==='checkCount')return Response.json({ok:true,data:{exists}});
  if(body.action==='delete'){
   deletes++;
   if(mode==='fail')throw Error('Drive unavailable');
   exists=false;
   if(mode==='lost')throw Error('Response lost after delete');
   return Response.json({ok:true,data:{deleted:true}});
  }
  throw Error('Unexpected bridge action '+body.action);
 }
 throw Error('Unexpected '+url);
};
const {mirrorTeam,handleTeam,reconcileTeamMirrors}=await import('./team.ts');
const config={endpoint:'https://bridge.test',secret:'secret'};
await mirrorTeam('fixture',config);assert.equal(record.mirrored_revision,3);assert.match(record.mirror_error,/Drive/);assert.equal(exists,true);
mode='lost';await mirrorTeam('fixture',config);assert.equal(record.mirrored_revision,3);assert.equal(exists,false);
await mirrorTeam('fixture',config);assert.equal(record.mirrored_revision,4);assert.equal(record.mirror_error,null);assert.equal(deletes,2,'Lost response retry confirms absence without deleting again');
assert.equal(await mirrorTeam('fixture',config),false,'Completed deletion cannot be replayed');
const repeat=await handleTeam({action:'delete',id:'fixture'},{id:'admin'},true,undefined,config,[]);assert.equal(repeat.data.deletionPending,false);
await assert.rejects(()=>handleTeam({action:'delete',id:'fixture'},{id:'store'},false,'APAR',config,['APAR']),/já não existe/);
record.revision=5;record.mirrored_revision=4;exists=true;mode='ok';
await reconcileTeamMirrors(config,['APAR']);await Promise.all(tasks);assert.equal(record.mirrored_revision,5);assert.equal(exists,false,'Pending tombstones retry on synchronization');
lease='busy';record.revision=6;const busy=await handleTeam({action:'delete',id:'fixture'},{id:'admin'},true,undefined,config,[]);assert.equal(busy.data.deletionPending,true,'In-flight mirror never reports a confirmed deletion');
console.log('PASS: Drive failure, lost deletion response, idempotent retry, pending work recovery, permission guard and truthful confirmation');
