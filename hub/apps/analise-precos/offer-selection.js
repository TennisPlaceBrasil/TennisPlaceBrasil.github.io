(function(root){
  'use strict';
  function adId(value){
    try{const u=new URL(value);if(u.protocol!=='https:')return null;u.hash='';
      for(const name of [...u.searchParams.keys()])if(/^utm_/i.test(name)||['gclid','fbclid','msclkid'].includes(name.toLowerCase()))u.searchParams.delete(name);
      u.searchParams.sort();return u.href;
    }catch{return null}
  }
  function limitOffers(offers){
    const seen=new Map(),counts=new Map(),out=[];
    for(const o of [...(offers||[])].filter(o=>o&&Number.isFinite(Number(o.price))&&Number(o.price)>0).sort((a,b)=>Number(a.price)-Number(b.price))){
      const cap={official:1,marketplace:2,competitor:1}[o.category],ad=adId(o.url);
      if(!cap||!ad||!o.source)continue;
      const source=String(o.source).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const bucket=o.category==='official'?'official':o.category+'|'+source;
      if(!seen.has(bucket))seen.set(bucket,new Set());
      if(seen.get(bucket).has(ad)||(counts.get(bucket)||0)>=cap)continue;
      seen.get(bucket).add(ad);counts.set(bucket,(counts.get(bucket)||0)+1);out.push(o);
    }
    return out;
  }
  if(typeof module==='object'&&module.exports)module.exports={limitOffers,adId};else root.limitOffers=limitOffers;
})(globalThis);
