/* Administrative inventory: snapshots are never added across different dates. */
'use strict';
window.TPInventoryDashboard=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Number(n||0).toLocaleString('pt-BR'),pct=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 const date=s=>String(s||'').split('-').reverse().join('/');
 function latest(data,byDay=false){
  const map=new Map();for(const c of data){if(c.kind==='RECONTAGEM'||c.status!=='FINALIZADA')continue;
   const key=c.store+(byDay?'|'+c.date:''),old=map.get(key),order=c.date+'|'+(c.updatedAt||c.createdAt||'')+'|'+c.id,prev=old&&(old.date+'|'+(old.updatedAt||old.createdAt||'')+'|'+old.id);
   if(!old||order>prev)map.set(key,c);
  }return [...map.values()];
 }
 function model(data,metadata=[],options={}){
  const item=r=>({...r,subgroup:r.subgroup||'Não informado'});
  const accept=r=>(!options.brand||r.brand===options.brand)&&(!options.subgroup||(r.subgroup||'Não informado')===options.subgroup);
  const final=data.filter(c=>c.status==='FINALIZADA'&&c.kind!=='RECONTAGEM');
  const snapshots=latest(final),byStore=new Map(),byGroup=new Map(),byBrand=new Map(),products=new Map(),eans=new Set(),unknown=new Set();let counted=0,defects=0,rows=0;
  const add=(map,name,kind,q)=>{const a=map.get(name)||{name,counted:0,defects:0,total:0};a[kind]+=q;a.total+=q;map.set(name,a);};
  for(const c of snapshots)for(const kind of ['counts','defects'])for(const raw of c[kind]||[]){const r=item(raw);if(!accept(r))continue;const q=Number(r.quantity)||0;if(q<=0)continue;const k=kind==='counts'?'counted':'defects';if(k==='counted')counted+=q;else defects+=q;rows++;eans.add(r.ean);if(r.unknown)unknown.add(r.ean);add(byStore,c.store,k,q);add(byGroup,r.subgroup,k,q);add(byBrand,r.brand||'Não informada',k,q);const key=c.store+'|'+r.ean,p=products.get(key)||{store:c.store,...r,counted:0,defects:0,total:0};p[k]+=q;p.total+=q;products.set(key,p);}
  const series=new Map();for(const c of latest(final,true))for(const r of (c.counts||[]).concat(c.defects||[])){if(!accept(r))continue;const v=series.get(c.date)||{date:c.date,total:0,stores:new Set()};v.total+=Number(r.quantity)||0;v.stores.add(c.store);series.set(c.date,v);}
  const active=metadata.filter(c=>c.kind!=='RECONTAGEM'&&c.status==='EM ANDAMENTO'&&(!options.store||c.store===options.store)&&(!options.start||c.date>=options.start)&&(!options.end||c.date<=options.end));
  const rank=map=>[...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  return {snapshots,counted,defects,total:counted+defects,eans:eans.size,unknown:unknown.size,rows,stores:snapshots.length,active:active.length,finalized:final.length,coverage:options.store?1:options.storeCount||0,rate:counted+defects?defects/(counted+defects)*100:0,byStore:rank(byStore),byGroup:rank(byGroup),byBrand:rank(byBrand),series:[...series.values()].sort((a,b)=>a.date.localeCompare(b.date)),defectProducts:[...products.values()].filter(p=>p.defects>0).sort((a,b)=>b.defects-a.defects||a.store.localeCompare(b.store))};
 }
 function bars(items,limit=8){const max=Math.max(1,...items.map(x=>x.total));return items.length?items.slice(0,limit).map(x=>'<li><div><span>'+esc(x.name)+'</span><strong>'+number(x.total)+'</strong></div><div class="dash-track"><span style="width:'+Math.max(1,x.total/max*100).toFixed(2)+'%"></span></div><small>'+number(x.counted)+' contadas · '+number(x.defects)+' defeitos</small></li>').join(''):'<li class="dash-empty">Sem dados neste filtro.</li>';}
 function render(target,m,options={}){
  const card=(label,value,detail,warning=false)=>'<article class="dash-kpi'+(warning?' dash-warning':'')+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+detail+'</small></article>';
  const chart=(title,detail,items,limit)=>'<article class="dash-chart"><h3>'+title+'</h3><p>'+detail+'</p><ol class="dash-bars">'+bars(items,limit)+'</ol></article>';
  const top=m.defectProducts.slice(0,15),series=m.series.slice(-30),max=Math.max(1,...series.map(d=>d.total));
  target.innerHTML='<div class="dash-heading"><div><p class="eyebrow">VISÃO ADMINISTRATIVA</p><h2>Painel do inventário</h2></div><span class="dash-period">'+esc(date(options.start))+' — '+esc(date(options.end))+'</span></div>'+
   '<p class="dash-basis">Posição: última contagem finalizada de cada loja dentro do período. Unidades de datas diferentes não são somadas. '+(options.brand?'Marca: '+esc(options.brand)+'. ':'')+(options.subgroup?'Subgrupo: '+esc(options.subgroup)+'.':'')+'</p>'+
   (!m.total?'<p class="dash-empty">Não há lançamentos finalizados para estes filtros. As contagens em andamento aparecem no acompanhamento abaixo.</p>':'')+
   '<div class="dash-kpis">'+card('UNIDADES FÍSICAS',number(m.total),'Contadas + defeitos')+card('UNIDADES CONTADAS',number(m.counted),'Sem os defeitos lançados separadamente')+card('DEFEITOS',number(m.defects),'Unidades separadas para conferência',true)+card('TAXA DE DEFEITOS',pct(m.rate),'Defeitos ÷ unidades físicas',true)+card('EANS DISTINTOS',number(m.eans),'Códigos únicos na posição selecionada')+card('SEM CADASTRO',number(m.unknown),'EANs identificados como inexistentes',m.unknown>0)+'</div>'+
   '<div class="dash-operations"><div><b>'+number(m.stores)+' / '+number(m.coverage)+'</b><span>lojas com contagem finalizada no período</span></div><div><b>'+number(m.active)+'</b><span>contagens em andamento</span></div><div><b>'+number(m.finalized)+'</b><span>contagens finalizadas consultadas</span></div><p>O acompanhamento considera loja e período. Marca e subgrupo filtram os produtos dos indicadores e gráficos.</p></div>'+
   '<div class="dash-chart-grid">'+chart('Unidades por loja','Posição mais recente de cada loja',m.byStore,30)+chart('Composição por subgrupo','Até 12 subgrupos com maior volume',m.byGroup,12)+chart('Marcas com maior volume','Até 8 marcas na posição selecionada',m.byBrand,8)+
   '<article class="dash-chart"><h3>Volume contado por data</h3><p>Última contagem de cada loja por dia. As lojas participantes podem variar; não representa crescimento do estoque.</p><div class="dash-timeline">'+(series.length?series.map(d=>'<div><span>'+esc(date(d.date))+'</span><div class="dash-track"><span style="width:'+(d.total/max*100).toFixed(2)+'%"></span></div><strong>'+number(d.total)+'</strong><small>'+d.stores.size+' loja(s)</small></div>').join(''):'<p class="dash-empty">Nenhuma data com produtos neste filtro.</p>')+'</div><small>Últimas 30 datas com lançamentos no período.</small></article></div>'+
   '<article class="dash-chart"><h3>Produtos que exigem atenção</h3><p>Até 15 combinações loja/EAN com maior quantidade de defeitos na posição mais recente.</p><div class="dash-table-wrap"><table><thead><tr><th>LOJA</th><th>PRODUTO / EAN</th><th>SUBGRUPO</th><th>CONTADAS</th><th>DEFEITOS</th><th>TAXA</th></tr></thead><tbody>'+(top.length?top.map(r=>'<tr><td>'+esc(r.store)+'</td><td>'+esc(r.description)+'<small>'+esc(r.ean)+'</small></td><td>'+esc(r.subgroup)+'</td><td>'+number(r.counted)+'</td><td>'+number(r.defects)+'</td><td>'+pct(r.defects/r.total*100)+'</td></tr>').join(''):'<tr><td colspan="6">Nenhum defeito lançado neste filtro.</td></tr>')+'</tbody></table></div></article>'+
   '<details class="dash-chart dash-sources"><summary>Datas usadas na posição por loja</summary><ul>'+m.snapshots.map(c=>'<li><strong>'+esc(c.store)+'</strong> · '+esc(date(c.date))+' · '+esc(c.label)+'</li>').join('')+'</ul><p>Ausência de uma loja ou EAN não significa estoque zero. Sem uma base de estoque esperado, o painel não calcula divergências ou acuracidade.</p></details>';
 }
 return {latest,model,render};
})();
