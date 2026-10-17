// Exercise the native Studio in real browsers using an existing Playwright install.
// node tools/studio-tests/studio.cjs <playwright-project/package.json> <studio-url>
const {createRequire} = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [project, url] = process.argv.slice(2);
const playwright = createRequire(path.resolve(project))('@playwright/test');
const ready = page => page.waitForFunction(() => document.querySelector('#status').dataset.state === 'ready');
const size = (page, token, property) => page.evaluate(({token,property}) => {
  const frame = document.querySelector('#preview');
  const row = [...frame.contentDocument.querySelectorAll('.sample')].find(row => row.querySelector('.name').textContent === token);
  return frame.contentWindow.getComputedStyle(row.querySelector('.value'))[property];
}, {token,property});
const editorValue = page => page.locator('#editor').evaluate(node => node.europaEditor.value);
const setEditor = (page, value) => page.locator('#editor').evaluate((node, value) => { node.europaEditor.value = value; }, value);
async function main() {
  for (const engine of ['chromium','firefox','webkit']) {
    const browser = await playwright[engine].launch({headless:true});
    try {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url); await ready(page);
      await page.waitForFunction(() => document.querySelector('#preview').contentDocument.querySelectorAll('.sample').length === 4);
      assert.equal(await size(page,'heading','fontSize'),'64px');
      await page.locator('#width').fill('390');
      await page.waitForFunction(() => document.querySelector('#preview').contentWindow.innerWidth === 390);
      assert.equal(await size(page,'heading','fontSize'),'32px');
      await page.locator('[data-tab="spacing"]').click();
      assert.equal(await size(page,'md','width'),'24px');
      await page.locator('[data-tab="grid"]').click();
      assert.equal(await size(page,'container','paddingLeft'),'24px');
      assert(Math.abs(parseFloat(await size(page,'1/4','width'))-85.5)<0.1);
      await page.locator('[data-tab="typography"]').click();
      const sourceBeforeLayout = await editorValue(page);
      assert.equal(await page.locator('#editor').getAttribute('data-wrap'), 'off');
      assert(await page.locator('#editor .cm-scroller').evaluate(node => node.scrollWidth > node.clientWidth));
      const divider = await page.locator('#divider').boundingBox();
      await page.mouse.move(divider.x + 4, divider.y + 100);
      await page.mouse.down(); await page.mouse.move(570, divider.y + 100); await page.mouse.up();
      assert.equal(await page.locator('#divider').getAttribute('aria-valuenow'), '570');
      await page.locator('#divider').focus(); await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#divider').getAttribute('aria-valuenow'), '550');
      await page.locator('#wrap').click(); assert.equal(await page.locator('#editor').getAttribute('data-wrap'), 'soft');
      assert(await page.locator('#editor .cm-scroller').evaluate(node => node.scrollWidth <= node.clientWidth));
      await page.locator('#wrap').click();
      await page.locator('#expand').click(); assert(await page.locator('.workspace').isHidden());
      assert((await page.locator('#editor').boundingBox()).width > 1100);
      await page.keyboard.press('Escape'); assert(await page.locator('.workspace').isVisible());
      assert.equal(await editorValue(page), sourceBeforeLayout);
      await page.setViewportSize({width:1280,height:640});
      await page.evaluate(() => scrollTo(0,0));
      assert(await page.locator('.save-note').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
      await page.setViewportSize({width:1440,height:1000});
      const initial = await editorValue(page);
      await page.locator('#family').selectOption('');
      const changed = initial.replace("mobile: '32px'", "mobile: '36px'") + '\n// retained in export\n';
      await setEditor(page, changed); await page.locator('#compile').click(); await ready(page);
      assert.equal(await size(page,'heading','fontSize'),'36px');
      assert.equal(await page.locator('#family').inputValue(), '');
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#export').click();
      const download = await downloadEvent;
      assert.equal(fs.readFileSync(await download.path(),'utf8'),changed);
      await setEditor(page, '{bad:1,bad:2}'); await page.locator('#compile').click();
      await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'error');
      assert.match(await page.locator('#errors').innerText(), /Duplicate config key/);
      assert.equal(await size(page,'heading','fontSize'),'36px');
      assert(await page.locator('#export').isDisabled());
      await setEditor(page, initial); await page.locator('#compile').click(); await ready(page);
      // px → dpx boundary: explicit entries and '*' fallback.
      // Test actual computed values; syntactically valid CSS can still fail when
      // a runtime variable is missing from the isolated specimen document.
      const dpxConfig = `{
        dpxViewportSize: 1280, setMaxForVw: false,
        theme: {
          breakpoints: {mobile: '0', ipad_landscape: '1024px', desktop_md: '1280px', desktop_lg: '1440px'},
          typography: {sizes: {
            body: {mobile: '17px', ipad_landscape: '17px', '*': '18dpx'},
            heading: {mobile: {'font-size': '64px'}, ipad_landscape: {'font-size': '120px'}, desktop_md: {'font-size': '120dpx'}, desktop_lg: {'font-size': '120dpx'}},
          }},
          spacing: {gap: {'*': '24dpx'}},
          container: {padding: {'*': '40dpx'}, maxWidth: {'*': '100%'}},
          columns: {gutters: {'*': '16dpx'}},
        },
      }`;
      await setEditor(page, dpxConfig); await page.locator('#compile').click(); await ready(page);
      for (const [width,body,heading] of [[1279,17,120],[1280,18,120],[1281,18.01406,120.09375],[1440,20.25,135]]) {
        await page.locator('#width').fill(String(width));
        await page.waitForFunction(width => document.querySelector('#preview').contentWindow.innerWidth === width, width);
        assert(Math.abs(parseFloat(await size(page,'body','fontSize'))-body)<0.02, `body at ${width}`);
        assert(Math.abs(parseFloat(await size(page,'heading','fontSize'))-heading)<0.02, `heading at ${width}`);
      }
      await page.locator('#width').fill('1280');
      await page.locator('[data-tab="spacing"]').click();
      assert.equal(await size(page,'gap','width'),'24px');
      await page.locator('[data-tab="grid"]').click();
      assert.equal(await size(page,'container','paddingLeft'),'40px');
      assert(Math.abs(parseFloat(await size(page,'1/4','width'))-308)<0.1);
      await page.locator('[data-tab="typography"]').click();
      await page.locator('#compile').click(); await ready(page);
      assert.equal(await size(page,'heading','fontSize'),'120px');
      await setEditor(page, initial); await page.locator('#compile').click(); await ready(page);
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors,[]);
      console.log(`${engine} ${browser.version()}: responsive type/spacing/grid including px-to-dpx transitions and wildcard fallback, live edits, exact comment-preserving export, invalid-config recovery mobile layout, wrapping, pointer/keyboard resizing, expanded editor and short-window footer passed`);
    } finally { await browser.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
