import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../../hub/shared/tepe-help.js',import.meta.url),'utf8');
function context(path,elements={},hash=''){
 let selected;
 const window={addEventListener(){}},parent={TPHelp:{},postMessage(data){selected=data.context;}};
 const document={currentScript:{src:'https://test.local/hub/shared/tepe-help.js'},querySelector:s=>elements[s]||null,addEventListener(){}};
 vm.runInNewContext(script,{window,parent,document,location:{pathname:path,hash,origin:'https://test.local'},URL,setTimeout(){},clearTimeout(){}});
 return selected;
}
const shown=(extra={})=>({hidden:false,dataset:{},getClientRects:()=>[{}],...extra});
assert.equal(context('/hub/apps/precificador/index.html',{'#loginPassword':shown()}),'pricing-login');
assert.equal(context('/hub/apps/precificador/index.html'),'pricing');
assert.equal(context('/hub/apps/analise-precos/index.html',{'#password':shown()}),'analysis-login');
assert.equal(context('/hub/apps/analise-precos/index.html',{'#detail':shown(),'#accessCode':shown()}),'analysis-detail','Market access code must not be mistaken for login');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#unknown-dialog[open]':shown()}),'inventory-unknown');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#camera-dialog[open]':shown()}),'inventory-camera');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#import-unknown-dialog[open]':shown()}),'inventory-import-unknown');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#recount-dialog[open]':shown()}),'inventory-request');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#counting':shown(),'#finish-count':shown({textContent:'CONTAGEM FINALIZADA'})}),'inventory-finished');
assert.equal(context('/hub/apps/contagem-estoque/index.html',{'#counting':shown(),'#recount-targets':shown(),'#finish-count':shown({textContent:'CONTAGEM FINALIZADA'})}),'inventory-recount-finished');
for(let i=1;i<=7;i++)assert.equal(context('/dash-estoquevendas/index.html',{},'#modulo-'+i),'dashboard-'+i);
assert.equal(context('/acesso.html',{'#user-password':shown()}),'login');
assert.equal(context('/acesso.html',{'#secure-frame':shown()}),'manual-step');
console.log('Verified: contextual help for each login, price analysis, all dashboard modules, active/finalized counts, recount requests and unknown EANs.');

