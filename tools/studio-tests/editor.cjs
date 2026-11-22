// Editor behavior and bidirectional source links, using an existing Playwright install.
// node tools/studio-tests/editor.cjs <playwright-project/package.json> <studio-url>
const {createRequire}=require('node:module');
const path=require('node:path'), assert=require('node:assert/strict');
const [project,url]=process.argv.slice(2);
const pw=createRequire(path.resolve(project))('@playwright/test');
const value=page=>page.locator('#editor').evaluate(node=>node.europaEditor.value);
const set=async(page,text)=>{await page.locator('#editor').evaluate((node,text)=>{node.europaEditor.value=text;},text);};
const ready=page=>page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');
const compile=async page=>{await page.locator('#compile').click();await ready(page);};
const cursor=async(page,position)=>page.locator('#editor').evaluate((node,position)=>{node.europaEditor.view.dispatch({selection:{anchor:position}});node.europaEditor.focus();},position);
const state=page=>page.locator('#editor').evaluate(node=>({scroll:node.querySelector('.cm-scroller').scrollTop,cursor:node.europaEditor.selectionStart,focused:node.europaEditor.view.hasFocus}));
const source=`{
  // Unicode before the tokens: blåbær 🪐. A fake key in a comment: alpha: 99
  theme: {
    breakpoints: {mobile: '0', desktop: '1000px'},
    typography: {families: {sans:['system-ui']}, sizes: {
      alpha: {'*':'20px'},
${'      // breathing room in the source\n'.repeat(55)}
      'literal/slash': {mobile:'24px', desktop:'32px'},
      nested: {alpha: {'*':'28px'}},
    }},
    spacing: {gap:'24px', alias:'{spacing.gap}'},
    container: {padding:{'*':'16px'},maxWidth:{'*':'100%'}},
    columns: {gutters:{'*':'16px'}},
    extend: {spacing:{gap:'32px'}},
  },
}`;
async function main(){
 for(const engine of (process.env.STUDIO_ENGINES?.split(',') || ['chromium','firefox','webkit'])){
  const browser=await pw[engine].launch();
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url);await ready(page);
   assert(await page.locator('.cm-gutterElement').count()>0);
   const colors=await page.locator('.cm-content span').evaluateAll(nodes=>[...new Set(nodes.map(n=>getComputedStyle(n).color))]);
   assert(colors.length>=3,colors.join(','));
   await set(page,'{}');await cursor(page,1);await page.keyboard.press('Enter');
   assert.equal(await value(page),'{\n  \n}');
   await page.keyboard.type('theme: {');await page.keyboard.press('Enter');
   assert.match(await value(page),/theme: \{\n    \n  \}/);
   const beforeTab=await value(page);await page.keyboard.press('Tab');assert.notEqual(await value(page),beforeTab);
   await page.keyboard.press('Shift+Tab');assert.equal(await value(page),beforeTab);
   await page.keyboard.insertText('// kept');
   const edited=await value(page);await page.keyboard.press('Meta+z');assert.notEqual(await value(page),edited);
   await page.keyboard.press('Meta+Shift+z');assert.equal(await value(page),edited);
   // Existing line endings survive both untouched export and a local edit.
   const mixed="{\r\n  // 🪐 keep this\n  theme: {}\r\n}";
   await set(page,mixed);assert.equal(await value(page),mixed);
   await cursor(page,2);await page.keyboard.insertText(' ');assert.equal(await value(page),mixed.replace('  //','   //'));
   await set(page,source);await compile(page);
   await cursor(page,0);
   await page.locator('#editor .cm-scroller').evaluate(node=>{node.scrollTop=0;});
   const before=await state(page);
   const card=page.frameLocator('#preview').getByRole('button',{name:'Edit literal/slash configuration',exact:true});
   await page.mouse.move(1,1);
   await card.hover();
   await page.waitForFunction(()=>document.querySelector('#source-context').textContent.includes('literal/slash'));
   assert.deepEqual(await state(page),before,'Hover must preserve scroll, caret and focus');
   assert.equal(await value(page),source);
   await card.click();
   await page.waitForFunction(()=>document.querySelector('#editor .cm-scroller').scrollTop>0);
   assert.equal((await state(page)).cursor,source.indexOf("'literal/slash'"));
   assert(await page.locator('.cm-source-link').count()>0);
   // A collapsed config ancestor is revealed on an explicit preview click.
   await cursor(page,0); await page.locator('#editor .cm-scroller').evaluate(node=>{node.scrollTop=0;});
   await page.locator('.cm-foldGutter .cm-gutterElement').filter({hasText:'⌄'}).first().click();
   assert(await page.locator('.cm-foldPlaceholder').count()>0);
   await card.click();
   assert.equal((await state(page)).cursor,source.indexOf("'literal/slash'"));
   await page.waitForFunction(()=>!document.querySelector('.cm-foldPlaceholder'));
   // Editing a token lights its card without conflating repeated names.
   await cursor(page,source.indexOf("'28px'")+2);
   const nested=page.frameLocator('#preview').getByRole('button',{name:'Edit nested/alpha configuration',exact:true});
   await nested.waitFor();assert.match(await nested.getAttribute('class'),/is-editing/);
   assert(!/is-editing/.test(await page.frameLocator('#preview').getByRole('button',{name:'Edit alpha configuration',exact:true}).getAttribute('class')));
   await page.keyboard.type('0');
   assert.match(await nested.getAttribute('class'),/is-editing/);
   // Path lookup uses the latest document, not offsets from the previous compile.
   await set(page,'// inserted before the config\n'+source);await compile(page);
   await card.click();
   assert.equal((await state(page)).cursor,('// inserted before the config\n'+source).indexOf("'literal/slash'"));
   // Override source and dependent aliases both participate in editor → preview links.
   const current=await value(page);await cursor(page,current.lastIndexOf("'32px'")+2);
   await page.waitForFunction(()=>document.querySelector('[data-tab="spacing"]').getAttribute('aria-pressed')==='true');
   for(const name of ['gap','alias'])assert.match(await page.frameLocator('#preview').getByRole('button',{name:`Edit ${name} configuration`,exact:true}).getAttribute('class'),/is-editing/);
   await page.frameLocator('#preview').getByRole('button',{name:'Edit gap configuration',exact:true}).click();
   assert.equal((await state(page)).cursor,current.lastIndexOf("gap:"));
   // Keyboard activation can reveal a preview's source too.
   const alias=page.frameLocator('#preview').getByRole('button',{name:'Edit alias configuration',exact:true});
   await alias.focus();await page.keyboard.press('Enter');
   assert.equal((await state(page)).cursor,current.indexOf('alias:'));
   assert.deepEqual(errors,[]);
   console.log(`${engine}: syntax colors, indent/brackets, undo, exact line endings, hover without scrolling/focus changes, click/keyboard reveal, nested/literal keys, live edits and override/reference links passed`);
  }finally{await browser.close();}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
