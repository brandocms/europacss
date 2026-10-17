// Real local fonts, served by the native CLI. No project files are changed.
// node tools/studio-tests/fonts.cjs <playwright-package.json> <binary> <assets-dir> <converted-config>
const {createRequire} = require('node:module');
const {spawn} = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const [modulePath,binary,project,config] = process.argv.slice(2).map(p => path.resolve(p));
const playwright = createRequire(modulePath)('@playwright/test');
const editorValue = page => page.locator('#editor').evaluate(node => node.europaEditor.value);
const setEditor = (page, value) => page.locator('#editor').evaluate((node, value) => { node.europaEditor.value = value; }, value);
async function main() {
  const server = spawn(binary, ['studio','--config',config,'--fonts',path.join(project,'css/includes/fonts.css'),'--public-dir',path.join(project,'public')], {env:{PATH:'',NO_COLOR:'1'},stdio:['ignore','ignore','pipe']});
  try {
    const url = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('Studio startup timed out')),10000);
      let output = '';
      server.stderr.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if(match) {clearTimeout(timer);resolve(match[0]);} });
      server.on('error',reject); server.on('exit', code => {clearTimeout(timer);reject(Error(`Studio exited ${code}: ${output}`));});
    });
    for (const engine of process.env.STUDIO_ENGINES?.split(',') || ['chromium','firefox','webkit']) {
      const browser = await playwright[engine].launch({headless:true});
      try {
        const page = await browser.newPage({viewport:{width:1440,height:1000}});
        const errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
        await page.goto(url);
        await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'ready' && /\d+ project font faces loaded/.test(document.querySelector('#font-status').textContent));
        const measured = await page.evaluate(() => {
          const iframe = document.querySelector('#preview'), doc = iframe.contentDocument;
          const canvas = doc.createElement('canvas'), context = canvas.getContext('2d');
          const family = iframe.contentWindow.getComputedStyle(doc.querySelector('.type .value')).fontFamily;
          context.font = `32px ${family}`; const actual = context.measureText('A little space changes everything.').width;
          context.font = '32px system-ui'; const fallback = context.measureText('A little space changes everything.').width;
          return {family,actual,fallback,faces:[...doc.fonts].map(face=>({family:face.family,weight:face.weight,status:face.status})), status:document.querySelector('#font-status').textContent};
        });
        assert(measured.faces.length >= 4); assert(measured.faces.every(face => face.status === 'loaded'));
        assert(Math.abs(measured.actual-measured.fallback)>1, JSON.stringify(measured));
        assert(!measured.status.includes('failed'));
        const fontsBefore = requests.filter(url=>/\/api\/fonts\/\d+$/.test(url)).length;
        await setEditor(page, (await editorValue(page))+'\n// recompile while fonts stay loaded\n');
        await page.locator('#compile').click();
        await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'ready');
        assert.equal(requests.filter(url=>/\/api\/fonts\/\d+$/.test(url)).length,fontsBefore);
        await page.locator('[data-tab="context"]').click();
        await page.locator('#context-copy').selectOption('no');
        const contextual=await page.frameLocator('#preview').locator('[data-role=body]').first().evaluate(node=>({family:getComputedStyle(node).fontFamily,size:getComputedStyle(node).fontSize,text:node.textContent}));
        assert(!contextual.family.startsWith('system-ui'),JSON.stringify(contextual));
        assert.match(contextual.text,/Et godt sted/);
        await page.frameLocator('#preview').locator('[data-role=body]').first().click();
        assert(await page.locator('#focused-fields input').count()>0);
        assert.equal(await page.locator('[data-tab="context"]').getAttribute('aria-pressed'),'true');
        await page.locator('#focused-close').click();
        await page.locator('[data-tab="accessibility"]').click();
        await page.locator('#width').fill('1440');
        if(process.env.STUDIO_RUNTIME) await page.locator('#a11y-runtime').selectOption(process.env.STUDIO_RUNTIME);
        if(process.env.STUDIO_DPR) {await page.locator('#a11y-dpr').fill(process.env.STUDIO_DPR);await page.locator('#a11y-dpr').dispatchEvent('change');}
        const audit = await page.evaluate(async () => {
          await accessibility.run();
          if(!accessibility.report) throw Error(document.querySelector('#a11y-status').textContent);
          const {configSha256,sampledWidths,notes,typography,settings,runtime,baseViewport}=accessibility.report;
          return {configSha256,sampledWidths,notes,settings,runtime,baseViewport,tokens:typography.map(t=>({name:t.name,error:t.error,minimum:t.minimum,maximum:t.maximum,worstWidth:t.zoom?.width,zoomGrowth:t.zoom?.maximum,hints:t.hints,currentAt200:t.currentZoom?.rows.find(r=>r.zoom===2)}))};
        });
        assert(audit.tokens.length>0);assert(audit.tokens.every(token=>!token.error));
        assert(!audit.notes.some(note=>note.includes('fonts did not load')));
        assert(requests.every(request => request.startsWith(url)));
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({project,engine,version:browser.version(),...measured,contextual,audit}));
      } finally {await browser.close();}
    }
  } finally {server.kill();}
}
main().catch(error => { console.error(error); process.exitCode=1; });
