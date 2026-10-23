/* Installation and display controls do not depend on inventory data or credentials. */
(()=>{
 'use strict';
 const install=document.getElementById('install-app'),fullscreen=document.getElementById('fullscreen-app'),dialog=document.getElementById('install-dialog');
 let pendingPrompt=null,installedHere=false;
 const installed=()=>navigator.standalone===true||['standalone','fullscreen','minimal-ui'].some(mode=>matchMedia('(display-mode: '+mode+')').matches);
 function update(){
  install.hidden=installed()||installedHere;
  fullscreen.hidden=!document.fullscreenEnabled||matchMedia('(display-mode: fullscreen)').matches;
  fullscreen.textContent=document.fullscreenElement?'SAIR DA TELA CHEIA':'TELA CHEIA';
 }
 function help(message=''){
  const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  document.getElementById('install-instructions').textContent=apple
   ?'No Safari, abra Compartilhar e escolha Adicionar à Tela de Início. Se aparecer a opção Abrir como App, mantenha-a ativada e toque em Adicionar.'
   :/Android/.test(navigator.userAgent)
    ?'No Chrome ou Edge, abra o menu ⋮ e escolha Instalar aplicativo ou Adicionar à tela inicial. Confirme a instalação.'
    :'No Chrome ou Edge, use o ícone de instalação da barra de endereço ou a opção Instalar este site como aplicativo no menu. No Safari do Mac, use Arquivo → Adicionar ao Dock. Se a opção não aparecer, abra em um desses navegadores atualizado.';
  document.getElementById('install-feedback').textContent=message;
  if(!dialog.open)dialog.showModal();
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingPrompt=event;update();});
 window.addEventListener('appinstalled',()=>{installedHere=true;pendingPrompt=null;if(dialog.open)dialog.close();update();});
 install.addEventListener('click',async()=>{
  if(!pendingPrompt){help();return;}
  const prompt=pendingPrompt;pendingPrompt=null;install.disabled=true;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')installedHere=true;else help('Instalação cancelada. Você pode instalar depois pelo menu do navegador.');}
  catch(_){help('Use o menu do navegador para concluir a instalação.');}
  finally{install.disabled=false;update();}
 });
 document.getElementById('install-close').addEventListener('click',()=>dialog.close());
 fullscreen.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch(_){help('Este navegador não permitiu tela cheia. Abra pelo ícone do aplicativo instalado para aproveitar a área disponível.');}
  update();
 });
 document.addEventListener('fullscreenchange',update);
 for(const mode of ['standalone','fullscreen'])matchMedia('(display-mode: '+mode+')').addEventListener?.('change',update);
 document.getElementById('count-options-toggle').addEventListener('click',event=>{
  const open=document.body.classList.toggle('count-options-open');event.currentTarget.setAttribute('aria-expanded',String(open));event.currentTarget.textContent=open?'VOLTAR A CONTAR':'OPÇÕES';
 });
 update();
})();
