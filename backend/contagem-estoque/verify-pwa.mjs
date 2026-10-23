import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../hub/apps/contagem-estoque/',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.display,'fullscreen');assert.equal(manifest.orientation,'any');
assert.equal(manifest.scope,'./');assert.match(manifest.start_url,/index.html/);
for(const icon of manifest.icons){const png=fs.readFileSync(new URL(icon.src,root));const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
for(const file of ['app.js','pwa.js','offline-store.js','offline-export.js'])new vm.Script(read(file),{filename:file});
const html=read('index.html');assert.match(html,/rel="manifest"/);assert.match(html,/viewport-fit=cover/);
const sw=fs.readFileSync(new URL('../../hub/sw.js',import.meta.url),'utf8');
for(const asset of ['pwa.js','mobile.css','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'])assert.ok(sw.includes('apps/contagem-estoque/'+asset),asset+' cached for offline start');
const elements=new Map(),windowEvents={},documentEvents={},classes=new Set();
function element(id){if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',open:false,attributes:{},events:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(name,value){this.attributes[name]=value;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
let standalone=false,prompts=0,fullscreenRequests=0;
const document={getElementById:element,fullscreenEnabled:true,fullscreenElement:null,addEventListener(type,fn){documentEvents[type]=fn;},documentElement:{async requestFullscreen(){fullscreenRequests++;document.fullscreenElement={};}},async exitFullscreen(){document.fullscreenElement=null;},body:{classList:{toggle(name){if(classes.has(name)){classes.delete(name);return false;}classes.add(name);return true;}}}};
const context=vm.createContext({document,navigator:{userAgent:'Android Chrome'},matchMedia:q=>({matches:standalone&&q.includes('standalone'),addEventListener(){}}),window:{addEventListener(type,fn){windowEvents[type]=fn;}}});
vm.runInContext(read('pwa.js'),context);
assert.equal(element('install-app').hidden,false);
await element('install-app').events.click();assert.equal(element('install-dialog').open,true);assert.match(element('install-instructions').textContent,/Chrome/);
element('install-dialog').close();windowEvents.beforeinstallprompt({preventDefault(){},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
await element('install-app').events.click();assert.equal(prompts,1);assert.equal(element('install-app').disabled,false);
standalone=true;windowEvents.appinstalled();assert.equal(element('install-app').hidden,true);
await element('fullscreen-app').events.click();assert.equal(fullscreenRequests,1);assert.match(element('fullscreen-app').textContent,/SAIR/);
await element('fullscreen-app').events.click();assert.equal(document.fullscreenElement,null);
const toggle=element('count-options-toggle');toggle.events.click({currentTarget:toggle});assert.equal(toggle.attributes['aria-expanded'],'true');toggle.events.click({currentTarget:toggle});assert.equal(toggle.attributes['aria-expanded'],'false');
context.navigator.userAgent='iPhone';standalone=false;await element('install-app').events.click();assert.match(element('install-instructions').textContent,/Tela de Início/);
console.log('PASS: complete scripts parse, valid install manifest/icons, offline assets, native/manual installation, fullscreen entry/exit, options toggle, iOS guidance');
