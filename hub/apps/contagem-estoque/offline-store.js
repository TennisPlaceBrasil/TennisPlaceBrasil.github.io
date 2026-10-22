/* Durable device-only inventory records. No passwords or tokens are stored here. */
'use strict';
window.TPInventoryLocal=(()=>{
 let opening,queue=Promise.resolve();
 function db(){return opening||(opening=new Promise((resolve,reject)=>{const r=indexedDB.open('tp-inventory-device-v1',1);r.onupgradeneeded=()=>{for(const name of ['counts','rows','settings'])r.result.createObjectStore(name,{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error);};r.onblocked=()=>reject(Error('Feche outras abas antigas do Inventário e tente novamente.'));}));}
 const key=(owner,id)=>owner+'|'+id;
 function transaction(names,run){return db().then(d=>new Promise((resolve,reject)=>{const t=d.transaction(names,'readwrite');let value;try{value=run(t);}catch(e){t.abort();reject(e);return;}t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Gravação local interrompida.'));}));}
 function ordered(run){const p=queue.then(run);queue=p.catch(()=>{});return p;}
 async function read(store,k){await queue;const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(k);r.onsuccess=()=>resolve(r.result?.value);r.onerror=()=>reject(r.error);});}
 function setting(k,value){return ordered(()=>transaction(['settings'],t=>t.objectStore('settings').put({key:k,value})));}
 function save(owner,state,info,hint){
  // Capture synchronously, before another scan can change the referenced row.
  const k=key(owner,state.id),meta={...state};delete meta.counts;delete meta.defects;
  if(hint)delete meta.targets;
  const record={...structuredClone(meta),...structuredClone(info),owner};
  const rows=hint?[{kind:hint.kind,row:state[hint.kind].find(r=>r.ean===hint.ean),position:state[hint.kind].findIndex(r=>r.ean===hint.ean)}]:['counts','defects'].flatMap(kind=>state[kind].map((row,position)=>({kind,row,position})));
  const snapshot=structuredClone(rows);
  return ordered(()=>transaction(['counts','rows','settings'],t=>{
   const counts=t.objectStore('counts'),items=t.objectStore('rows');
   if(hint){const get=counts.get(k);get.onsuccess=()=>counts.put({key:k,value:{...(get.result?.value||{}),...record}});}else counts.put({key:k,value:record});
   if(!hint)items.delete(IDBKeyRange.bound(k+'|',k+'|\uffff'));write();
   function write(){for(const item of snapshot){const ean=hint?hint.ean:item.row.ean,rk=k+'|'+item.kind+'|'+ean;if(item.row)items.put({key:rk,value:{...item.row,kind:item.kind,position:item.position}});else items.delete(rk);}}
   t.objectStore('settings').put({key:'active:'+owner,value:state.id});
  }));
 }
 async function restore(owner,id){
  id=id||await read('settings','active:'+owner);if(!id)return null;
  const meta=await read('counts',key(owner,id));if(!meta)return null;
  const d=await db(),prefix=key(owner,id)+'|';
  const records=await new Promise((resolve,reject)=>{const r=d.transaction('rows').objectStore('rows').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const state={...meta,counts:[],defects:[]};for(const entry of records.sort((a,b)=>a.value.position-b.value.position)){const row={...entry.value};delete row.kind;delete row.position;state[entry.value.kind].push(row);}
  return state;
 }
 function remove(owner,id){return ordered(()=>transaction(['counts','rows','settings'],t=>{const k=key(owner,id);t.objectStore('counts').delete(k);t.objectStore('rows').delete(IDBKeyRange.bound(k+'|',k+'|\uffff'));const p=t.objectStore('settings').get('active:'+owner);p.onsuccess=()=>{if(p.result?.value===id)t.objectStore('settings').delete('active:'+owner);};}));}
 async function list(owner){await queue;const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('counts').objectStore('counts').getAll();r.onsuccess=()=>resolve(r.result.map(r=>r.value).filter(r=>r.owner===owner).sort((a,b)=>String(b.localUpdatedAt).localeCompare(String(a.localUpdatedAt))));r.onerror=()=>reject(r.error);});}
 return {list,ready:db,save,restore,remove,read,setting,drain:()=>queue};
})();
