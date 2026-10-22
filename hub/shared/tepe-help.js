(()=>{
'use strict';
if(window.TPHelp)return;
const script=document.currentScript,base=new URL('.',script.src).href;
const content={
 hub:['Central de ferramentas','Escolha a ferramenta que precisa usar. Para voltar, toque em “Voltar à central”.'],
 login:['Entrar','Use a sigla da loja e o CNPJ, só com números. Se você usa acesso administrativo, entre com seu e-mail e senha.'],
 manuals:['Portal de Manuais','Escolha o manual do processo que vai fazer. Siga os passos na ordem e consulte as imagens quando precisar.'],
 pricing:['Precificador','Bipe o código de barras ou digite o produto. Veja o preço na busca. Para consultar uma marca, use o filtro de marca.'],
 'analysis-detail':['Comparar os preços','Confira o custo, o preço de venda e o markup. Compare as ofertas do mercado e a data da pesquisa. Atualize os preços quando precisar de uma consulta nova.'],
 analysis:['Análise de Preços','Busque o produto e escolha o modelo. Compare os preços encontrados antes de decidir. Use Atualizar para buscar dados novos.'],
 inventory:['Estoque × Vendas','Importe as planilhas pedidas na validação. Confira os dados e depois abra os módulos. Use os filtros para escolher a loja e a marca.'],
 'inventory-login':['Entrar no Inventário','Loja: digite a sigla e use o CNPJ, só com números, como senha. Administrativo: use seu acesso habitual.'],
 'inventory-start':['Começar uma contagem','Escolha a loja e a data. Toque em “Nova contagem”. Se houver uma recontagem solicitada para sua loja, toque em “Abrir recontagem”.'],
 'inventory-count':['Contar os produtos','Bipe o EAN de cada produto. Ajuste a quantidade no campo ou nos botões + e −. Aguarde “Salvo no Google Drive” antes de sair. Quando terminar, finalize a contagem.'],
 'inventory-defects':['Registrar defeitos','Bipe aqui os produtos com defeito. Confira e ajuste a quantidade. Esses itens entram na importação antes dos produtos da contagem.'],
 'inventory-recount':['Fazer a recontagem','Bipe os EANs da lista. Amarelo só mostra que o produto foi incluído; a quantidade é você quem conta. Se não encontrar, marque “Não localizado (0)”. Depois finalize.'],
 'inventory-analysis':['Analisar o estoque','Escolha loja, marca e período. Toque em “Analisar”. Cada coluna mostra uma data; zero significa que o produto não apareceu naquela contagem.'],
 'manual-step':['Usar este manual','Leia o passo que está na tela e faça a mesma ação no sistema. Avance somente depois de conferir se concluiu esse passo.']
};
let context='hub',remote=false;
try{remote=parent!==window&&!!parent.TPHelp;}catch(_){}
function send(key){if(!content[key])return;context=key;if(remote){parent.postMessage({type:'tp-help-context',context:key},location.origin);return;}paint();}
function infer(){
 const path=location.pathname.toLowerCase();
 if(path.includes('contagem-estoque')){const visible=id=>{const e=document.querySelector(id);return e&&!e.hidden&&e.getClientRects().length>0;};if(visible('#login-panel'))send('inventory-login');else if(visible('#analysis-view'))send('inventory-analysis');else if(visible('#recount-targets'))send('inventory-recount');else if(visible('#counting'))send(document.querySelector('[data-mode="defects"].active')?'inventory-defects':'inventory-count');else send('inventory-start');return;}
 const password=[...document.querySelectorAll('input[type=password]')].some(e=>e.getClientRects().length);if(password){send('login');return;}
 if(path.includes('precificador'))send('pricing');else if(path.includes('analise')){const detail=document.querySelector('#detail');send(detail&&!detail.hidden?'analysis-detail':'analysis');}else if(path.includes('estoquevendas'))send('inventory');else if(path.includes('manual')||path.includes('portal')||path.includes('acesso'))send('manuals');
}
window.TPHelp={setContext:send};
window.addEventListener('tp-help',e=>send(e.detail));
document.addEventListener('load',e=>{if(e.target.tagName==='IFRAME')infer();},true);
document.addEventListener('click',()=>setTimeout(infer,80),{passive:true});
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
