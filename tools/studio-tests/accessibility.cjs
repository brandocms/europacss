// Native Studio accessibility checks in real engines. No Node dependency in Studio.
// node tools/studio-tests/accessibility.cjs <playwright-project/package.json> <studio-url>
const {createRequire}=require('node:module');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const [project,url]=process.argv.slice(2),pw=createRequire(path.resolve(project))('@playwright/test');
const near=(actual,expected,tolerance=.035)=>assert(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);
const config={dpxViewportSize:1280,setMaxForVw:false,theme:{
 breakpoints:{mobile:'0',desktop:'1000px'},
 typography:{base:'20px',families:{sans:['system-ui']},sizes:{
  fixed:{'*':'16px'}, fluid:{'*':'2vw'}, design:{'*':'18dpx'}, relative:{'*':'1rem'},
  bounded:{'*':'clamp(1rem, 2vw, 3rem)'}, height:{'*':'2vh'},
  jump:{mobile:'14px',desktop:'28px'}, bold:{__base__:{'font-weight':700},'*':'19px'},
  mixed:{mobile:'16px',desktop:'18dpx'},
  clipped:{__base__:{height:'18px',width:'120px',overflow:'hidden','white-space':'nowrap'},'*':'16px'}, zero:{'*':'0px'},
 }},
 colors:{black:'#000',white:'#fff',gray:'#777',aa:'#666',alpha:'rgb(0 0 0 / 50%)',transparent:'transparent',variable:'var(--missing)',current:'currentColor',wide:'color(display-p3 1 0 0)',nested:{red:'red'}},
}};
const source=JSON.stringify(config,null,2)+'\n// retained by the checks\n';
async function set(page,text){await page.evaluate(async text=>{editor.value=text;await compile();},text);}
async function audit(page){await page.locator('#a11y-run').click();await page.waitForFunction(()=>!!accessibility.report,{},{timeout:20000});return page.evaluate(()=>accessibility.report);}
async function pair(page,foreground,background='white'){await page.locator('#a11y-fg').selectOption({label:foreground});await page.locator('#a11y-bg').selectOption({label:background});return page.locator('#a11y-contrast').innerText();}
async function main(){
 for(const engine of process.env.STUDIO_ENGINES?.split(',')||['chromium','firefox','webkit']){
  const browser=await pw[engine].launch();
  try{
   const page=await browser.newPage({viewport:{width:1536,height:1000}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');
   await set(page,source);await page.locator('[data-tab="accessibility"]').click();
   const report=await audit(page),get=name=>report.typography.find(row=>row.name===name);
   assert.equal(report.wcag,'2.2');assert.equal(report.settings.level,'AA');assert.equal(report.configSha256.length,64);
   assert(report.sampledWidths.includes(999)&&report.sampledWidths.includes(999.5)&&report.sampledWidths.includes(1000)&&report.sampledWidths.includes(1001));
   assert(report.sampledWidths.some(w=>w>375&&w<999));
   near(get('fixed').minimum,16);near(get('fixed').zoom.maximum,4);
   near(get('relative').minimum,20);near(get('relative').zoom.maximum,4);
   for(const name of ['fluid','design','height']){near(get(name).zoom.maximum,1,.025);assert(get(name).hints.some(h=>h.startsWith('Zoom review')));}
   near(get('design').samples.find(s=>s.width===1280).size,18);
   near(get('height').samples[0].size,18);near(get('height').currentZoom.rows.at(-1).cssSize,4.5);
   assert(get('bounded').zoom.maximum>=2);assert(get('jump').jumps.some(j=>j.before===14&&j.after===28));
   assert(get('clipped').layout.reflow.overflow);assert(get('clipped').layout.spacing.clipped);assert(get('clipped').layout.textResize.clipped);
   assert.equal(get('zero').zoom.maximum,null);assert(get('zero').hints.some(h=>h.includes('Zero-sized')));
   assert.equal(await page.evaluate(()=>editor.value),source);
   assert.match(await pair(page,'black'),/21.00:1.*normal text: meets 4.5:1/s);
   assert.match(await pair(page,'gray'),/4.47:1.*normal text: below 4.5:1.*large text: meets 3:1/s);
   assert.match(await pair(page,'aa'),/normal text: meets 4.5:1/);
   await page.locator('#a11y-level').selectOption('AAA');
   assert(await page.locator('#a11y-export').isDisabled());assert.match(await page.locator('#a11y-contrast').innerText(),/normal text: below 7:1.*large text: meets 4.5:1/s);
   assert.match(await pair(page,'alpha'),/4.00:1/);
   assert.match(await pair(page,'black','transparent'),/21.00:1/);
   await page.locator('#a11y-canvas').fill('#000000');await page.locator('#a11y-canvas').dispatchEvent('change');
   assert.match(await page.locator('#a11y-contrast').innerText(),/1.00:1/);
   for(const name of ['variable','current','wide'])assert.match(await pair(page,name),/manual review/);
   const pure=await page.evaluate(()=>({normal:EuropaAccessibility.largeText(18.666666666,700),bold:EuropaAccessibility.largeText(56/3,700),large:EuropaAccessibility.largeText(24,400),ratio:EuropaAccessibility.contrast([0,0,0,1],[255,255,255,1],[255,255,255,1])}));
   assert.deepEqual(pure,{normal:false,bold:true,large:true,ratio:21});
   await page.locator('#a11y-canvas').fill('#ffffff');await page.locator('#a11y-canvas').dispatchEvent('change');
   await page.locator('#a11y-level').selectOption('AA');await pair(page,'gray');await audit(page);
   await page.locator('#a11y-types tr[data-token="bold"] .a11y-token').click();
   assert.match(await page.locator('#a11y-detail-body').innerText(),/meets the text threshold at every sampled width/);
   await page.locator('#a11y-types tr[data-token="fixed"] .a11y-token').click();
   assert.match(await page.locator('#a11y-detail-body').innerText(),/below the text threshold/);
   // Source hover preserves the caret/scroll; clicking reveals the authored rule without leaving this tab.
   await page.evaluate(()=>{editor.view.dispatch({selection:{anchor:0}});document.querySelector('#editor .cm-scroller').scrollTop=0;});
   const before=await page.evaluate(()=>({cursor:editor.selectionStart,scroll:document.querySelector('#editor .cm-scroller').scrollTop}));
   const edit=page.locator('#a11y-types tr[data-token="bold"] .a11y-source');await edit.hover();
   assert.deepEqual(await page.evaluate(()=>({cursor:editor.selectionStart,scroll:document.querySelector('#editor .cm-scroller').scrollTop})),before);
   await edit.click();assert.equal(await page.evaluate(()=>tab),'accessibility');assert.equal(await page.evaluate(()=>editor.selectionStart),source.indexOf('"bold"'));
   const pending=page.waitForEvent('download');await page.locator('#a11y-export').click();const download=await pending;
   const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));near(exported.colorPair.ratio,4.47808945,.00001);assert.equal(exported.configSha256,report.configSha256);
   assert.equal(exported.settings.runtime,'none');
   assert(!/110\.000/.test(await page.locator('#a11y-detail-body').innerText()));
   // Only declarations using --ec-zoom receive runtime compensation.
   await page.locator('#a11y-runtime').selectOption('proportional');assert(await page.locator('#a11y-export').isDisabled());
   const compensated=await audit(page),comp=name=>compensated.typography.find(t=>t.name===name);
   near(comp('design').zoom.maximum,4);near(comp('design').currentZoom.rows.find(r=>r.zoom===2).ecZoom,2);
   near(comp('fixed').zoom.maximum,4);near(comp('relative').zoom.maximum,4);
   near(comp('fluid').zoom.maximum,4,.035);near(comp('height').zoom.maximum,1,.025);
   near(comp('mixed').currentZoom.rows.find(r=>r.zoom===2).cssSize,16);
   assert(comp('clipped').zoomLayoutIssues.length>0);
   assert(comp('design').samples.every((s,i)=>s.size===get('design').samples[i].size),'Normal viewport graph must keep --ec-zoom at 1');
   await page.locator('#a11y-types tr[data-token="design"] .a11y-token').click();
   assert.match(await page.locator('#a11y-detail-body').innerText(),/--ec-zoom follows browser zoom/);
   await page.locator('#a11y-runtime').selectOption('jupiter-chrome');await page.locator('#a11y-dpr').fill('2');await page.locator('#a11y-dpr').dispatchEvent('change');
   const retina=await audit(page),retinaDesign=retina.typography.find(t=>t.name==='design');
   near(retinaDesign.currentZoom.rows.find(r=>r.zoom===2).ecZoom,3);near(retinaDesign.zoom.maximum,7,.04);
   near(retina.typography.find(t=>t.name==='fixed').zoom.maximum,4);
   const compensatedDownload=page.waitForEvent('download');await page.locator('#a11y-export').click();
   const runtimeReport=JSON.parse(fs.readFileSync(await (await compensatedDownload).path(),'utf8'));
   assert.equal(runtimeReport.version,2);assert.equal(runtimeReport.settings.runtime,'jupiter-chrome');assert.equal(runtimeReport.settings.dpr,2);
   await page.locator('#a11y-runtime').selectOption('none');await audit(page);
   await page.screenshot({path:'/tmp/europa-a11y-'+engine+'.png',fullPage:true});
   await page.setViewportSize({width:375,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.setViewportSize({width:1536,height:1000});
   // Changing controls cancels a measurement; stale results cannot be exported.
   await page.evaluate(()=>{accessibility.run();document.querySelector('#width').value=375;layout();});
   await page.waitForFunction(()=>!document.querySelector('.a11y-measure'));
   assert.equal(await page.evaluate(()=>accessibility.report),null);assert(await page.locator('#a11y-export').isDisabled());
   await set(page,'{bad:1,bad:2}');assert(await page.locator('#a11y-run').isDisabled());assert.match(await page.locator('#a11y-contrast').innerText(),/Compile the current/);
   const bad=structuredClone(config);bad.theme.typography.sizes['bad;} .escape{']={'*':'20px'};
   await set(page,JSON.stringify(bad));const partial=await audit(page);assert(partial.typography.some(t=>t.error));
   await set(page,JSON.stringify({theme:{colors:{},typography:{sizes:{}}}}));assert.equal(await page.locator('#a11y-palette tr').count(),0);
   await page.locator('#a11y-zoom').selectOption('2');await page.locator('#specimen-text').fill('');
   const empty=await audit(page);assert.equal(empty.typography.length,0);assert.equal(empty.specimenText,'A little space changes everything.');assert(await page.locator('#a11y-detail').isHidden());
   // Persistence stores check preferences only, never the project configuration.
   await page.locator('#a11y-level').selectOption('AAA');await page.locator('#a11y-runtime').selectOption('proportional');
   await page.evaluate(()=>{initialSource=editor.value;});await page.reload();await page.waitForFunction(()=>!!latest);assert.equal(await page.locator('#a11y-level').inputValue(),'AAA');
   assert.equal(await page.locator('#a11y-runtime').inputValue(),'proportional');
   assert.deepEqual(errors,[]);
   console.log(`${engine} ${browser.version()}: actual px/rem/vw/dpx/vh/clamp measurements, breakpoint edges, zoom, clipping, AA/AAA contrast, transparency, unknown colors, source tracing, cancellation, export and mobile layout passed`);
  }finally{await browser.close();}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
