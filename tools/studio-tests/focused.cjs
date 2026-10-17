// Native Studio interaction regression. Uses an optional existing Playwright install.
// node tools/studio-tests/focused.cjs <playwright-project/package.json> <studio-url>
const {createRequire}=require('node:module');
const assert=require('node:assert/strict'),path=require('node:path');
const [project,url]=process.argv.slice(2), pw=createRequire(path.resolve(project))('@playwright/test');
const ready=page=>page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');
const value=page=>page.locator('#editor').evaluate(n=>n.europaEditor.value);
const source=`{\r\n  // Keep blåbær 🪐, comments and line endings.\n  theme: {\r\n    breakpoints: {mobile:'0', tablet:'740px', desktop:'1024px'},
    typography: {families:{sans:['system-ui', /* keep array comment */ 'sans-serif']}, sizes: {
      base: {__base__:{'line-height':1.50,'font-family':'system-ui,\\n sans-serif'}, mobile:'16px', tablet:'18px', '*':'20px'},
      'heading/large': {mobile:'24px', '*':'32px'},
    }},
    spacing:{md:{mobile:'12px', '*':'24px'}, alias:'{spacing.md}'},
    extend:{spacing:{md:{mobile:'14px','*':'26px'}}},
    container:{padding:{'*':'16px'},maxWidth:{'*':'1200px'}},
    columns:{gutters:{'*':'16px'}},
  },\r\n}`;
async function main(){
 for(const engine of process.env.STUDIO_ENGINES?.split(',')||['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch();
  try {
   const page=await browser.newPage({viewport:{width:1500,height:1100}}), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await ready(page);
   await page.locator('#editor').evaluate((n,s)=>{n.europaEditor.value=s;},source);
   await page.locator('#compile').click();await ready(page);
   await page.frameLocator('#preview').getByRole('button',{name:'Edit base configuration',exact:true}).click();
   await page.locator('#focused').waitFor({state:'visible'});
   assert.equal(await page.locator('#focused-fields input').count(),5);
   await page.locator('#focused-fields').getByRole('textbox',{name:'mobile',exact:true}).fill('17px');
   await page.locator('#focused-review').click();
   await page.waitForFunction(()=>!document.querySelector('#focused-apply').disabled);
   assert.equal(await value(page),source,'Review never mutates source');
   assert.match(await page.locator('#focused-diff').textContent(),/− '16px'\n\+ '17px'/);
   await page.locator('#focused-apply').click();await ready(page);
   const edited=source.replace("mobile:'16px'","mobile:'17px'");
   assert.equal(await value(page),edited,'Exact comments, quote style and mixed newlines survive');
   await page.locator('#editor').evaluate(n=>n.europaEditor.focus());await page.keyboard.press('Meta+z');
   await ready(page);assert.equal(await value(page),source,'One undo restores the focused edit');
   await page.keyboard.press('Meta+Shift+z');await ready(page);assert.equal(await value(page),edited);
   await page.locator('[data-tab=context]').click();
   assert.equal(await page.frameLocator('#preview').locator('[data-role=body]').count(),2);
   assert.equal(await page.frameLocator('#preview').locator('.context-card').count(),2);
   const cardMetrics=await page.frameLocator('#preview').locator('.context-layout').evaluate(n=>({gap:getComputedStyle(n).gap,button:getComputedStyle(n.querySelector('[data-role=button]')).fontSize}));
   assert.equal(cardMetrics.gap,'16px');assert.equal(cardMetrics.button,'20px');
   await page.locator('#context-copy').selectOption('no');
   assert.match(await page.frameLocator('#preview').locator('[data-role=long-words]').textContent(),/menneskerettighetsorganisasjon/);
   for(const width of [375,739,739.5,740,1023.5,1024,1440]) {
    await page.locator('#width').fill(String(width));await page.locator('#width').dispatchEvent('input');
    const measured=await page.frameLocator('#preview').locator('[data-role=body]').first().evaluate(n=>({width:innerWidth,size:parseFloat(getComputedStyle(n).fontSize)}));
    assert.equal(measured.size,measured.width<740?17:measured.width<1024?18:20,`${engine} ${width}px: ${JSON.stringify(measured)}`);
   }
   await page.frameLocator('#preview').locator('[data-role=heading]').click();
   assert.equal(await page.locator('[data-tab=context]').getAttribute('aria-pressed'),'true','Tracing source keeps the composition open');
   assert.match(await page.locator('#focused-title').textContent(),/heading\/large/);
   // A proposed invalid size cannot be applied.
   await page.locator('#focused-fields').getByRole('textbox',{name:'mobile',exact:true}).fill('invalid-size');
   await page.locator('#focused-review').click();
   await page.waitForFunction(()=>!document.querySelector('#focused-status').textContent.includes('Checking'));
   assert(await page.locator('#focused-apply').isDisabled());assert.equal(await value(page),edited);
   // Editing a theme.extend value targets the authored override, never its base.
   await page.frameLocator('#preview').getByRole('button',{name:'Edit md configuration',exact:true}).click();
   await page.locator('#focused-fields').getByRole('textbox',{name:'mobile',exact:true}).fill('15px');
   await page.locator('#focused-review').click();await page.waitForFunction(()=>!document.querySelector('#focused-apply').disabled);
   assert.match(await page.locator('#focused-diff').textContent(),/theme › extend › spacing › md › mobile/);
   // A concurrent JSON5 edit invalidates the reviewed transaction.
   await page.locator('#editor').evaluate(n=>{const e=n.europaEditor;e.view.dispatch({changes:{from:0,insert:'// new edit\n'}});});
   await page.waitForFunction(()=>document.querySelector('#focused-apply').disabled);
   assert.equal(await value(page),'// new edit\r\n'+edited);
   await ready(page);
   // Scalar API keeps literal slash keys, references and quoted escapes intact.
   const api=await page.locator('#editor').evaluate(n=>{
     const e=n.europaEditor, original=e.value;
     const plan=e.plan([{path:['theme','spacing','alias'],value:"{spacing.md}"}]);
     const numeric=e.plan([{path:['theme','typography','sizes','base','__base__','line-height'],value:1.5}]);
     const escaped=e.plan([{path:['theme','spacing','alias'],value:"a'b\t\\c"}]);
     return {unchanged:plan.changes.length===0&&numeric.changes.length===0,escaped:e.parse(escaped.source).theme.spacing.alias,original:e.value===original};
   });
   assert.deepEqual(api,{unchanged:true,escaped:"a'b\t\\c",original:true});
   await page.setViewportSize({width:375,height:900});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false,'Studio controls fit a 375px screen');
   if(engine==='chromium') {await page.setViewportSize({width:1500,height:1100});await page.locator('#focused-close').click();await page.locator('#width').fill('1024');await page.locator('#width').dispatchEvent('input');await page.screenshot({path:'/tmp/europa-context-studio.png',fullPage:true});}
   assert.deepEqual(errors,[]);
   console.log(`${engine}: focused diff/compiler validation, exact comments/newlines, undo/redo, overrides, stale edits, realistic specimens, boundary widths and 375px UI passed`);
  } finally {await browser.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
