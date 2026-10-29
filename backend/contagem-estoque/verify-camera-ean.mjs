import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const url=new URL('../../hub/apps/contagem-estoque/app.js',import.meta.url);
const source=fs.readFileSync(url,'utf8').replace(/initializeDevice\(\)\.then\(async\(\)=>\{.*\}\s*\);/,'');
const elements=new Map();
function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,dataset:{},className:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},focus(){},select(){},showModal(){this.open=true;},close(){this.open=false;}};}
const $=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
const context=vm.createContext({console,Map,Set,JSON,Number,String,Array,Error,Date,Intl,Blob,Response,AbortSignal,crypto:globalThis.crypto,structuredClone,CustomEvent:class{},setTimeout(){return 1;},clearTimeout(){},setInterval(){},navigator:{onLine:true,userAgent:'Chrome'},TPInventoryLocal:{ready:async()=>{},drain:async()=>{},setting:async()=>{},read:async()=>null,list:async()=>[],restore:async()=>null,remove:async()=>{},save:async()=>{}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},window:{addEventListener(){},dispatchEvent(){}},document:{hidden:false,addEventListener(){},querySelector:$,querySelectorAll(){return[];},activeElement:null},confirm:()=>true,alert:()=>{},fetch:async()=>Response.json({data:null}),requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);

assert.deepEqual(JSON.parse(JSON.stringify(run("cameraEanCandidates('198686799100')"))),['198686799100','0198686799100']);
assert.deepEqual(JSON.parse(JSON.stringify(run("cameraEanCandidates('0198686799100')"))),['0198686799100','198686799100']);
assert.deepEqual(JSON.parse(JSON.stringify(run("cameraEanCandidates('ABC')"))),[]);

await run("catalogComplete=true;catalog=new Map([['198686799100',{ean:'198686799100',description:'550 F PRETO BEGE 35',brand:'NEW BALANCE',subgroup:'TENIS'}]]);current={id:'count-1',kind:'CONTAGEM',counts:[],defects:[]};cameraActive=true;cameraGeneration=1;cameraDetected('0198686799100')");
assert.equal(run('cameraCandidate.ean'),'198686799100','leading zero is resolved to the catalog EAN');
assert.equal(run("catalog.get('0198686799100').ean"),'198686799100','both camera forms resolve to the canonical code');
assert.match($('#camera-product-meta').textContent,/198686799100/,'the confirmation shows the canonical EAN');
assert.equal(run('current.counts.length'),0,'detection alone does not launch or duplicate a count');

run("cameraCandidate=null;cameraLastEan='';cameraLastAt=0;cameraFallbackStarted=false;cameraStream={};catalog=new Map([['198686799100',{ean:'198686799100',description:'550 F PRETO BEGE 35',brand:'NEW BALANCE',subgroup:'TENIS'}]]);window.ZXingBrowser={BrowserMultiFormatOneDReader:class{decodeFromStream(_stream,_video,callback){callback({getText:()=> '0198686799100'});return Promise.resolve({stop(){}});}}}");
await run('startZxingFallback(1)');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(run('cameraFallbackStarted'),true,'the slower alternative decoder remains active after switching');
assert.equal(run('cameraCandidate.ean'),'198686799100','alternative reader also resolves the UPC-A alias');

await run("cameraCandidate=null;cameraLastEan='';cameraLastAt=0;catalog=new Map();cameraDetected('198686799100')");
assert.equal($('#unknown-dialog').open,true,'an unknown decoded EAN opens the required product form');
assert.equal(run("$('#unknown-quantity').value"),'1','unknown product quantity defaults to one unit');
console.log('PASS: UPC-A/EAN-13 camera aliases resolve to the catalog EAN; camera preview preserves review-before-launch and explains unknown codes');
