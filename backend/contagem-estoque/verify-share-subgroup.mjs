import assert from 'node:assert/strict';
let handler,revoked=false,store='APAR',bridgeReads=0;
globalThis.Deno={env:{get:n=>n==='SUPABASE_URL'?'https://db.test':'test-secret'},serve:fn=>handler=fn};
globalThis.EdgeRuntime={waitUntil:p=>p.catch(()=>{})};
globalThis.fetch=async(url,options={})=>{
 const path=new URL(url).pathname;
 if(url==='https://bridge.test'){bridgeReads++;const input=JSON.parse(options.body);assert.equal(input.action,'read');return Response.json({ok:true,data:{id:'count',store:'APAR',counts:[{ean:'001',quantity:999,subgroup:'TENIS'}],defects:[]}});}
 if(path.endsWith('/stockcount_share_links'))return Response.json([{count_id:'count',store:'APAR',expires_at:'2099-01-01',revoked_at:revoked?'2026-10-23':null}]);
 if(path.endsWith('/stockcount_bridge_config'))return Response.json([{endpoint:'https://bridge.test',secret:'private-bridge'}]);
 if(path.endsWith('/stockcount_team_counts'))return Response.json([{id:'count',store,deleted:false,revision:1,mirrored_revision:1}]);
 if(path.endsWith('/stockcount_team_snapshot'))return Response.json({id:'count',store:'APAR',collaborative:true,counts:[{ean:'001',quantity:2}],defects:[],participants:[{responsible:'Maria'}]});
 if(path.endsWith('/stockcount_team_share_people'))return Response.json([{responsible:'Maria',counts:[{ean:'001',quantity:2}],defects:[]}]);
 if(path.endsWith('/stockcount_team_mirror'))return Response.json(null);
 throw Error('Unexpected URL '+url);
};
await import('./share-read.ts');
const request=()=>new Request('https://api.test',{method:'POST',body:JSON.stringify({action:'read',token:'a'.repeat(64)})});
let response=await handler(request());assert.equal(response.status,200);let result=(await response.json()).data;
assert.equal(result.counts[0].quantity,2,'Projection must never replace authoritative quantities');assert.equal(result.counts[0].subgroup,'TENIS');assert.equal(result.participants[0].counts[0].subgroup,'TENIS');assert.equal(result.products[0].subgroup,'TENIS');assert.equal(bridgeReads,1);
revoked=true;response=await handler(request());assert.equal(response.status,404);assert.equal(bridgeReads,1,'Revoked link cannot query bridge');
revoked=false;store='OUTR';response=await handler(request());assert.equal(response.status,404);
console.log('PASS: historical shared counts/participants include subgroup without replacing quantities; revoked and cross-store links stay blocked');
