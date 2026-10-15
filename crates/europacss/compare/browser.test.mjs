import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const browser = process.env.EUROPA_COMPARE_BROWSER;
const binary = process.env.EUROPA_BINARY;
const cli = fileURLToPath(new URL('./compare.mjs', import.meta.url));

test('CDP command compares real styles and geometry, preserves the cascade, and rejects live DOM changes', { skip: !browser, timeout: 45000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'europa-compare-browser-'));
  let chrome, server;
  t.after(async () => {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      const force = setTimeout(() => chrome.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(force);
    }
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const before = ':root{--palette:red}.a .b{margin-bottom:14.4px;color:red} .marker::before{content:none}';
  const after = ':root{--palette:blue}.a .b{margin-bottom:20px;color:blue} .marker::before{content:"new"}';
  await writeFile(path.join(directory, 'before.css'), before);
  await writeFile(path.join(directory, 'after.css'), after);
  server = createServer((request, response) => {
    if (request.url === '/style.css') {
      response.setHeader('Content-Type', 'text/css'); response.end(before); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><link rel="stylesheet" href="/style.css"><style>.untouched{color:green!important}</style></head><body><main id="app"><div class="a"><div class="b">Field</div></div><div class="marker">Marker</div><div class="untouched">Other sheet</div></main>${request.url.includes('unstable') ? '<script>setInterval(()=>document.body.dataset.tick=String(Date.now()),10)</script>' : ''}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${path.join(directory, 'profile')}`, '--no-first-run', '--use-mock-keychain', '--password-store=basic', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });
  let port;
  const deadline = Date.now() + 10000;
  while (!port) {
    try { port = Number((await readFile(path.join(directory, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (Date.now() > deadline || chrome.exitCode !== null) throw new Error('Temporary Chromium did not expose CDP');
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
  const unstable = await compare(page + '?unstable', 'after.css');
  assert.equal(unstable.code, 2, JSON.stringify(unstable.report));
  assert.equal(unstable.report.complete, false);
  assert.match(unstable.report.error, /DOM changed/);
});
