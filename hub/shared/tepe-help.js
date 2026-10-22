(()=>{
'use strict';
if(window.TPHelp)return;
const script=document.currentScript,base=new URL('.',script.src).href;
const content={
 hub:['Central de ferramentas','Escolha a ferramenta que precisa usar. Quando quiser sair dela, toque em “Voltar à central”.'],
 login:['Entrar nos Manuais','Loja: use a sigla e o CNPJ, só com números. Acesso pessoal: use seu e-mail e senha. Depois toque em “Entrar no Portal”.'],
 'pricing-login':['Entrar no Precificador','Use seu e-mail e senha cadastrados. Toque em “Entrar” e aguarde a base de produtos carregar.'],
 'analysis-login':['Entrar na Análise de Preços','Use seu e-mail e senha cadastrados. Depois toque em “Entrar”.'],
 manuals:['Portal de Manuais','Escolha um dos portais liberados para seu acesso. Depois abra o manual do processo que vai fazer.'],
 'manual-step':['Consultar um manual','Escolha o processo no menu e siga os passos na ordem. Consulte as imagens para conferir a ação no sistema.'],
 pricing:['Precificador','Bipe o código ou digite o produto e toque em “Pesquisar” ou Enter. Para ver uma marca inteira, escolha a marca em “Por marca” e toque em “Filtrar todos da marca”.'],
 analysis:['Análise de Preços','Digite o modelo ou agrupador e toque em “Pesquisar”. Abra um dos modelos encontrados. “Atualizar base” atualiza os dados dos produtos.'],
 'analysis-detail':['Comparar os preços','Confira custo, venda e markup do modelo. Veja a data dos preços encontrados. “Recarregar resultados” busca os resultados já guardados; “Pesquisar este modelo na internet” faz uma nova consulta.'],
 inventory:['Estoque × Vendas','Toque em “Atualizar Planilha Excel” e importe a planilha. Confira primeiro a validação da importação. Depois escolha a loja, o período e o módulo que quer analisar.'],
 'dashboard-validacao':['Validar a planilha','Confira as pendências mostradas aqui. Corrija os dados na planilha e importe novamente. Dado faltando não deve ser tratado como zero.'],
 'dashboard-1':['Visão geral do estoque','Escolha a loja e o período no topo. Veja o saldo e a cobertura: quantos meses o estoque atende à média de vendas. Aqui aparecem valores de venda e de custo.'],
 'dashboard-2':['Saúde e produtos','Veja quais produtos estão com falta ou excesso de estoque. Use a busca para encontrar um item. O estoque em dinheiro é calculado pelo custo de compra.'],
 'dashboard-3':['Lojas e variações','Compare o estoque das lojas por agrupador. Use a busca para conferir modelo, cor e tamanho e identificar onde os produtos estão.'],
 'dashboard-4':['Vendas e curva ABC','Veja os produtos e marcas com maior participação nas vendas estimadas. A curva ABC destaca os itens que mais representam o total.'],
 'dashboard-5':['Preços e margens','Busque o produto e confira custo, preço de venda e markup. Os valores de rentabilidade são estimativas com os dados da planilha.'],
 'dashboard-6':['Remanejamento','Confira as transferências sugeridas entre lojas. Verifique a loja de origem, a de destino e a quantidade antes de decidir o que transferir.'],
 'dashboard-7':['Sugestões de compra','Ajuste os meses de cobertura e os prazos. Confira as quantidades sugeridas e use os filtros para escolher os produtos. Depois, se precisar, exporte as sugestões.'],
 'inventory-login':['Entrar no Inventário','Loja: digite a sigla e use o CNPJ, só com números, como senha. Administrativo: use seu e-mail e senha ou seu acesso habitual.'],
 'inventory-start':['Começar uma contagem','Confira a loja e a data e toque em “Nova contagem”. Se houver um pedido para sua loja, toque em “Abrir recontagem”.'],
 'inventory-admin-start':['Contagens e recontagens','Escolha a loja e a data para criar uma contagem. Para consultar uma já salva, toque em “Carregar contagens” e selecione a desejada. Em uma contagem finalizada, você pode solicitar a recontagem por TXT.'],
 'inventory-count':['Contar os produtos','Bipe, digite ou leia pela câmera. Cada bipagem soma uma unidade. Você também pode importar um TXT EAN,QNTDD; as quantidades são somadas ao que já foi lançado. Confira os EANs não cadastrados antes de confirmar. Aguarde “Salvo no Google Drive” e finalize quando terminar.'],
 'inventory-defects':['Registrar defeitos','Selecione “Defeitos” e bipe, digite, use a câmera ou importe um TXT EAN,QNTDD. Os valores importados se somam ao que já foi lançado. Conte cada unidade uma só vez: defeitos são somados à contagem na saída.'],
 'inventory-camera':['Ler pela câmera','Permita o acesso à câmera no Chrome e aponte para o código de barras. A leitura acontece neste dispositivo. Toque em “Fechar” para desligar a câmera.'],
 'inventory-import-unknown':['Conferir EANs importados','Estes códigos não aparecem no cadastro. Toque em “Corrigir arquivo” para cancelar e ajustar o TXT, ou em “Lançar mesmo assim” para incluir os itens como inexistentes.'],
 'inventory-recount':['Fazer a recontagem','Bipe os EANs solicitados. Amarelo significa apenas que o produto foi incluído; confira a quantidade por sua conta. Se não encontrar o item, marque “Não localizado (0)”. Finalize após conferir todos.'],
 'inventory-finished':['Contagem finalizada','Esta contagem está salva e não aceita novas bipagens. Você pode baixar o Excel ou o CSV. Para contar novamente os produtos, abra uma nova contagem.'],
 'inventory-delete-pending':['Solicitação de exclusão enviada','A contagem fica bloqueada enquanto o ADM confere os produtos. A loja não consegue apagar a contagem.'],
 'inventory-delete-review':['Revisar pedido de exclusão','Confira os produtos e as quantidades antes de decidir. Depois escolha “Aprovar exclusão” ou “Recusar pedido”.'],
 'inventory-delete-inbox':['Pedidos de exclusão','Abra um pedido em “Ver produtos”. Confira os itens da contagem antes de aprovar ou recusar.'],
 'inventory-recount-finished':['Recontagem finalizada','As quantidades dos EANs solicitados foram atualizadas na contagem original. Os outros produtos foram mantidos. Esta recontagem está salva e não aceita novas bipagens.'],
 'inventory-request':['Solicitar recontagem','Confira a loja e a contagem selecionada. Escolha um TXT com um EAN por linha e toque em “Enviar à loja”. A loja receberá os códigos, sem ver as quantidades anteriores.'],
 'inventory-unknown':['EAN não encontrado','Confira o código. Toque em “Corrigir” para tentar novamente. Se quiser registrar esse código mesmo sem cadastro, escolha “Lançar mesmo assim”.'],
 'inventory-analysis':['Analisar o estoque','Escolha a loja e o período e toque em “Analisar”. Depois, se quiser, filtre a marca e analise de novo. Cada coluna usa a última contagem finalizada da data. Produto ausente naquela contagem aparece com zero.']
};
let context='hub',remote=false;
try{remote=parent!==window&&!!parent.TPHelp;}catch(_){}
function send(key){if(!content[key])return;context=key;if(remote){parent.postMessage({type:'tp-help-context',context:key},location.origin);return;}paint();}
const visible=selector=>{const e=document.querySelector(selector);return !!e&&!e.hidden&&e.getClientRects().length>0;};
function infer(){
 const path=location.pathname.toLowerCase();
  if(path.includes('contagem-estoque')){
  if(visible('#login-panel'))send('inventory-login');
  else if(visible('#camera-dialog[open]'))send('inventory-camera');
  else if(visible('#import-unknown-dialog[open]'))send('inventory-import-unknown');
  else if(visible('#unknown-dialog[open]'))send('inventory-unknown');
  else if(visible('#recount-dialog[open]'))send('inventory-request');
  else if(visible('#analysis-view'))send('inventory-analysis');
  else if(visible('#delete-review-actions'))send('inventory-delete-review');
  else if(visible('#delete-pending-status'))send('inventory-delete-pending');
  else if(visible('#counting')){const finished=document.querySelector('#finish-count')?.textContent.includes('FINALIZADA');send(finished?(visible('#recount-targets')?'inventory-recount-finished':'inventory-finished'):visible('#recount-targets')?'inventory-recount':document.querySelector('[data-mode="defects"].active')?'inventory-defects':'inventory-count');}
  else if(visible('#deletion-inbox'))send('inventory-delete-inbox');
  else send(visible('#tab-analysis')?'inventory-admin-start':'inventory-start');return;
 }
 if(path.includes('precificador')){send(visible('#loginPassword')?'pricing-login':'pricing');return;}
 if(path.includes('analise')){send(visible('#password')?'analysis-login':visible('#detail')?'analysis-detail':'analysis');return;}
 if(path.includes('estoquevendas')){const key=location.hash.replace('#modulo-','');send(key==='validacao'?'dashboard-validacao':/^[1-7]$/.test(key)?'dashboard-'+key:'inventory');return;}
 if(path.includes('manual')||path.includes('portal')||path.includes('acesso'))send(visible('#user-password')?'login':visible('#secure-frame')?'manual-step':'manuals');
}
window.TPHelp={setContext:send};
window.addEventListener('tp-help',e=>send(e.detail));
document.addEventListener('load',e=>{if(e.target.tagName==='IFRAME')infer();},true);
let inferenceTimer;
const scheduleInfer=()=>{clearTimeout(inferenceTimer);inferenceTimer=setTimeout(infer,80);};
document.addEventListener('click',scheduleInfer,{passive:true});
window.addEventListener('hashchange',infer);
const watched=['#login-panel','#app-main','#analysis-view','#counting','#recount-targets','#recount-dialog','#unknown-dialog','#camera-dialog','#import-unknown-dialog','#deletion-inbox','#delete-review-actions','#delete-pending-status','#loginPanel','#appMain','#detail','#secure-frame','#user-password','#password'];
if('MutationObserver'in window){const observer=new MutationObserver(scheduleInfer);watched.forEach(selector=>{const el=document.querySelector(selector);if(el)observer.observe(el,{attributes:true,attributeFilter:['hidden','class','open','style']});});const finish=document.querySelector('#finish-count');if(finish)observer.observe(finish,{childList:true});}
if(location.pathname.includes('estoquevendas')&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{const entry=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(entry){const key=entry.target.id.replace('modulo-','');send(key==='validacao'?'dashboard-validacao':'dashboard-'+key);}},{rootMargin:'-12% 0px -62% 0px'});document.querySelectorAll('.analysis-module').forEach(el=>observer.observe(el));}
if(remote){infer();return;}
const host=document.createElement('aside');host.id='tp-tepe';host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:calc(100vw - 32px);';
const shadow=host.attachShadow({mode:'open'});shadow.innerHTML=`<link rel="stylesheet" href="${base}tepe-help.css?v=1"><section class="help-panel" id="help-panel" hidden aria-labelledby="help-title"><div class="help-top"><span>TEPÊ · TENNIS PLACE</span><button id="help-close" type="button" aria-label="Fechar ajuda">×</button></div><h2 id="help-title"></h2><p id="help-text"></p><span class="help-foot">Uma dica simples para esta tela.</span></section><button class="help-trigger" id="help-trigger" type="button" aria-controls="help-panel" aria-expanded="false"><span class="mascot-slot" id="mascot-slot" aria-hidden="true"><img class="mascot-fallback" src="${base}tepe-fallback.svg" alt=""></span><span class="help-bubble"><strong>Precisa de ajuda?</strong><span>O Tepê explica esta tela.</span></span></button>`;
document.body.append(host);
const trigger=shadow.querySelector('#help-trigger'),panel=shadow.querySelector('#help-panel');let mascot;
function animate(){mascot?.contentWindow?.postMessage({type:'tepe-active',active:!panel.hidden&&!document.hidden},location.origin);}
function paint(){const [title,text]=content[context]||content.hub;shadow.querySelector('#help-title').textContent=title;shadow.querySelector('#help-text').textContent=text;}
function toggle(open){panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));animate();if(open)shadow.querySelector('#help-close').focus();}
trigger.addEventListener('click',()=>{infer();toggle(panel.hidden);});shadow.querySelector('#help-close').addEventListener('click',()=>{toggle(false);trigger.focus();});
shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){toggle(false);trigger.focus();}});
document.addEventListener('visibilitychange',animate);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='tp-help-context'||!content[e.data.context])return;send(e.data.context);});
function loadMascot(){mascot=document.createElement('iframe');mascot.src=base+'tepe-mascote.html';mascot.title='Tepê, mascote da Tennis Place';mascot.tabIndex=-1;mascot.setAttribute('aria-hidden','true');mascot.addEventListener('load',()=>{shadow.querySelector('.mascot-fallback').hidden=true;animate();});shadow.querySelector('#mascot-slot').append(mascot);}
if('requestIdleCallback'in window)requestIdleCallback(loadMascot,{timeout:2500});else setTimeout(loadMascot,1200);
infer();paint();
})();
