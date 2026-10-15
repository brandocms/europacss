import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './compare.mjs';

const execute = promisify(execFile);
const browser = process.env.EUROPA_COMPARE_BROWSER;
const binary = process.env.EUROPA_BINARY;
const cli = fileURLToPath(new URL('./compare.mjs', import.meta.url));

test('CDP command compares real styles and geometry, preserves the cascade, and rejects live DOM changes', { skip: !browser, timeout: 60000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'europa-compare-browser-'));
  let chrome, server;
  t.after(async () => {
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      const force = setTimeout(() => chrome.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(force);
    }
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    // Chrome helper processes can finish profile writes after the parent exits.
    // Retry directory removal briefly without rerunning or weakening assertions.
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const before = ':root{--palette:red}.a .b{margin-bottom:14.4px;color:red} .marker::before{content:none}.motion,.touch{color:black}';
  const after = ':root{--palette:blue}.a .b{margin-bottom:20px;color:blue} .marker::before{content:"new"}.motion,.touch{color:black}@media(prefers-reduced-motion:reduce){.motion{color:purple}}@media(pointer:coarse) and (hover:none){.touch{color:purple}}';
  await writeFile(path.join(directory, 'before.css'), before);
  await writeFile(path.join(directory, 'after.css'), after);
  server = createServer((request, response) => {
    if (request.url === '/style.css') {
      response.setHeader('Content-Type', 'text/css'); response.end(before); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><link rel="stylesheet" href="/style.css"><style>.untouched{color:green!important}</style></head><body><main id="app"><div class="a"><div class="b">Field</div></div><div class="marker">Marker</div><div class="untouched">Other sheet</div><div class="motion">Motion</div><div class="touch">Touch</div></main>${request.url.includes('unstable') ? '<script>setInterval(()=>document.body.dataset.tick=String(Date.now()),10)</script>' : ''}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${path.join(directory, 'profile')}`, '--no-first-run', '--use-mock-keychain', '--password-store=basic', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeError, chromeLog = '';
  chrome.on('error', error => { chromeError = error; });
  chrome.stderr.on('data', data => { chromeLog = (chromeLog + data).slice(-16384); });
  let port;
  // A fresh Chrome profile can take longer on a busy hosted runner. Retain
  // startup diagnostics so crashes are distinguishable from a slow launch.
  const deadline = Date.now() + 30000;
  while (!port) {
    try { port = Number((await readFile(path.join(directory, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (chromeError) throw chromeError;
    if (Date.now() > deadline || chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Temporary Chromium did not expose CDP (exit ${chrome.exitCode}, signal ${chrome.signalCode})\n${chromeLog}`);
    if (!port) await new Promise(resolve => setTimeout(resolve, 25));
  }
  const compare = async (url, candidate, extra = []) => {
    // Run through the Rust dispatch when supplied; otherwise exercise the exact
    // embedded JS entry directly (useful when editing the helper before rebuilding).
    const command = process.env.EUROPA_BINARY ? binary : process.execPath;
    const prefix = process.env.EUROPA_BINARY ? ['compare'] : [cli];
    try {
      const result = await execute(command, [...prefix, url, '--before', path.join(directory, 'before.css'), '--after', path.join(directory, candidate), '--stylesheet', '/style.css', '--cdp', `http://127.0.0.1:${port}`, '--settle', '20', '--json', ...extra], { maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
      return { code: 0, report: JSON.parse(result.stdout) };
    } catch (error) {
      return { code: error.code, report: JSON.parse(error.stdout) };
    }
  };
  const changed = await compare(page, 'after.css', ['--viewport', '600x900', '--viewport', '1440x900']);
  assert.equal(changed.code, 1, JSON.stringify(changed.report));
  assert.equal(changed.report.complete, true);
  assert.equal(changed.report.results.length, 2);
  for (const result of changed.report.results) {
    assert.ok(result.changes.some(c => c.label === 'div.b' && c.properties['margin-bottom']?.before === '14.4px' && c.properties['margin-bottom']?.after === '20px'));
    assert.ok(result.changes.some(c => c.label === 'div.marker::before' && c.presence?.after));
    assert.ok(!result.changes.some(c => c.label === 'div.untouched' && c.properties.color));
  }
  assert.ok(changed.report.changedElements > changed.report.nonCustomChangedElements);
  const filtered = await compare(page, 'after.css', ['--ignore-custom-properties']);
  assert.equal(filtered.code, 1);
  assert.equal(filtered.report.customProperties, 'ignored');
  assert.equal(filtered.report.changedElements, filtered.report.nonCustomChangedElements);
  assert.ok(filtered.report.results.every(r => r.changes.every(c => Object.keys(c.properties).every(key => !key.startsWith('--')))));
  const same = await compare(page, 'before.css');
  assert.equal(same.code, 0, JSON.stringify(same.report));
  assert.equal(same.report.changedElements, 0);
  const primed = await compare(page, 'after.css', ['--prime', '--ignore-custom-properties']);
  assert.equal(primed.code, 1, JSON.stringify(primed.report));
  assert.equal(primed.report.complete, true);
  assert.equal(primed.report.priming, 'A/B/A');
  assert.ok(primed.report.results[0].changes.some(c => c.properties['margin-bottom']?.after === '20px'));
  const primedSame = await compare(page, 'before.css', ['--prime']);
  assert.equal(primedSame.code, 0, JSON.stringify(primedSame.report));
  assert.equal(primedSame.report.priming, 'A/B/A');
  assert.equal(primedSame.report.changedElements, 0);
  const emulated = await compare(page, 'after.css', ['--emulate', 'prefers-reduced-motion=reduce', '--touch']);
  assert.equal(emulated.code, 1, JSON.stringify(emulated.report));
  assert.equal(emulated.report.emulation.touch, true);
  assert.ok(emulated.report.results[0].emulation.mediaFeatures.every(f => f.matches));
  for (const label of ['div.motion', 'div.touch']) assert.ok(emulated.report.results[0].changes.some(c => c.label === label && c.properties.color?.after === 'rgb(128, 0, 128)'));

  // Temporary emulation returns to browser defaults after success or failure.
  // Existing external emulation is left alone when neither flag is requested.
  const control = await connect(`http://127.0.0.1:${port}`);
  try {
    const {targetId} = await control.send('Target.createTarget', {url:page});
    const {sessionId} = await control.send('Target.attachToTarget', {targetId,flatten:true});
    const send = (method,params) => control.send(method,params,sessionId);
    await send('Runtime.enable');
    const state = async () => (await send('Runtime.evaluate', {expression:"({ready:document.readyState === 'complete',reduce:matchMedia('(prefers-reduced-motion:reduce)').matches,touch:navigator.maxTouchPoints})",returnByValue:true})).result.value;
    for (let i=0; i<100 && !(await state()).ready; i++) await new Promise(resolve=>setTimeout(resolve,20));
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const externallyEmulated = await compare(page, 'before.css', ['--target',targetId]);
    assert.equal(externallyEmulated.code, 0, JSON.stringify(externallyEmulated.report));
    assert.equal((await state()).reduce, true);
    await send('Emulation.setEmulatedMedia', {features:[]});
    const initial = await state();
    assert.equal(initial.touch, 0);
    for (const feature of ['prefers-reduced-motion=reduce', 'made-up-feature=invalid']) {
      const prepared = await compare(page, 'after.css', ['--target',targetId,'--emulate',feature,'--touch']);
      assert.equal(prepared.code, feature.startsWith('made-up') ? 2 : 1, JSON.stringify(prepared.report));
      assert.deepEqual(await state(),initial);
    }
    await control.send('Target.closeTarget', {targetId});
  } finally { control.close(); }
  const unstable = await compare(page + '?unstable', 'after.css');
  assert.equal(unstable.code, 2, JSON.stringify(unstable.report));
  assert.equal(unstable.report.complete, false);
  assert.match(unstable.report.error, /DOM changed/);
});
