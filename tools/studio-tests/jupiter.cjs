// Compare Studio's Chrome runtime model against the actual local Jupiter method.
// node tools/studio-tests/jupiter.cjs /path/to/jupiter-next
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=process.argv[2];if(!root)throw Error('Provide the Jupiter checkout path');
const source=fs.readFileSync(path.join(root,'src/modules/Application/index.js'),'utf8');
const method=source.match(/^  zoomCalculateChrome\(dimsChanged\) \{[\s\S]*?^  \}/m)?.[0];
if(!method)throw Error('Jupiter Chrome method changed; review the model before updating this test');
const studio={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../crates/europacss/studio/accessibility.js'),'utf8'),studio);
const window={devicePixelRatio:1};
const actual=vm.runInNewContext('({'+method+'})',{window});
const results=[];
for(const dpr of [1,1.25,1.5,2,2.5,3]){
 const state={size:{zoom:1},_lastDevicePixelRatio:Math.round(dpr*100)},rows=[];
 for(const zoom of [1,1.1,1.25,1.5,1.75,2,2.5,3,4,2,1]){
  window.devicePixelRatio=dpr*zoom;actual.zoomCalculateChrome.call(state,true);
  const modeled=studio.window.EuropaAccessibility.runtimeZoom('jupiter-chrome',zoom,dpr);
  assert(Math.abs(modeled-state.size.zoom)<1e-10,JSON.stringify({dpr,zoom,actual:state.size.zoom,modeled}));rows.push({zoom,ecZoom:modeled});
 }
 results.push({dpr,rows});
}
console.log(JSON.stringify({methodSha256:createHash('sha256').update(method).digest('hex'),assumptions:'Starts at 100% page zoom on one display, dimensions change with zoom. Does not validate browser event delivery or detection.',results},null,2));
