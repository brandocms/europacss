import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import europa from '../index.js';

const binary = process.env.EUROPA_BINARY ?? fileURLToPath(new URL(`../../../target/debug/europa${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const eventually = async (predicate) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('Timed out waiting for Vite update');
};
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'europa-vite-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nested'));
  const write = (name, contents) => writeFile(path.join(root, name), contents);
  await write('index.html', '<script type="module" src="/main.js"></script><div class="card">Hello</div>');
  await write('main.js', "import './app.css'");
  await write('app.css', "@import './nested/child.css'; .entry {color:blue}");
  await write('nested/child.css', ".card{@color fg brand;background-image:url('./icon.svg')}");
  await write('nested/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  await write('europa.json5', "{theme:{colors:{brand:'red'}}}");
  return { root, write, config: { root, configFile: false, logLevel: 'silent', css: { postcss: { plugins: [] }, devSourcemap: true }, plugins: [europa({ binary })] } };
}

test('production build handles ordinary CSS imports, rebased assets and source maps', async (t) => {
  const { root, config } = await fixture(t);
  const output = await build({ ...config, build: { write: false, sourcemap: true, assetsInlineLimit: 0, minify: false } });
  const assets = output.output;
  const css = assets.find((asset) => asset.fileName.endsWith('.css')).source;
  assert.match(css, /color:\s*red/);
  assert.doesNotMatch(css, /@color/);
  assert.match(css, /\/assets\/icon-.*\.svg/);
  assert.ok(assets.some((asset) => asset.fileName.endsWith('.svg')));
  assert.match(await readFile(path.join(root, 'app.css'), 'utf8'), /@import/);
});

test('dev HMR follows transitive CSS/config edits, diagnoses errors and recovers missing imports', async (t) => {
  const { root, config, write } = await fixture(t);
  const server = await createServer({ ...config, server: { port: 0, host: '127.0.0.1' } });
  t.after(() => server.close());
  await server.listen();
  const messages = [];
  const socket = new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}/?token=${server.config.webSocketToken}`, 'vite-hmr');
  t.after(() => socket.close());
  socket.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));
  await eventually(() => messages.some((message) => message.type === 'connected'));
  const css = () => server.transformRequest('/app.css');
  assert.match((await css()).code, /color: red/);
  const module = server.moduleGraph.getModuleById(path.join(root, 'app.css'));
  assert.ok(module);
  async function change(name, content, expected) {
    messages.length = 0;
    await write(name, content);
    await eventually(() => messages.some((m) => m.type === 'update' && m.updates.some((u) => u.path === '/app.css')));
    assert.match((await css()).code, expected);
  }
  await change('europa.json5', "{theme:{colors:{brand:'green'}}}", /color: green/);
  await change('nested/child.css', '.card{@color bg brand}', /background-color: green/);
  const result = await css();
  const map = JSON.parse(Buffer.from(result.code.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/)[1], 'base64').toString());
  assert.ok(map.sources.some((source) => source.endsWith('child.css')));

  await write('nested/child.css', '.broken {');
  await eventually(() => module.transformResult === null);
  await assert.rejects(css(), (error) => error.message.includes('EU_PARSE') && error.loc.file.endsWith('child.css') && error.loc.line === 1);
  await write('nested/child.css', "@import './new.css'; .card{@color fg brand}");
  await eventually(() => module.transformResult === null);
  await assert.rejects(css(), (error) => error.message.includes('EU_IMPORT'));
  messages.length = 0;
  await write('nested/new.css', '.new{color:gold}');
  await eventually(() => messages.some((m) => m.type === 'full-reload'));
  assert.match((await css()).code, /gold/);
  messages.length = 0;
  await unlink(path.join(root, 'nested/new.css'));
  await eventually(() => messages.some((m) => m.type === 'full-reload'));
  await assert.rejects(css(), (error) => error.message.includes('EU_IMPORT'));
});

test('adapter respects transform input, opt-outs and executable errors', async (t) => {
  const { root } = await fixture(t);
  const plugin = europa({ binary, config: false });
  plugin.configResolved({ root });
  const watched = [];
  const context = { addWatchFile(file) { watched.push(file); }, warn() {}, error(error) { throw error instanceof Error ? error : Object.assign(new Error(error.message), error); } };
  const id = path.join(root, 'app.css');
  const result = await plugin.transform.call(context, '.from-memory{color:teal}', id);
  assert.match(result.code, /from-memory/);
  assert.doesNotMatch(result.code, /entry/);
  assert.ok(!watched.includes(id)); // entry must not import itself
  for (const suffix of ['?raw', '?url', '?vue&type=style']) assert.equal(await plugin.transform.call(context, '', id + suffix), null);
  const missing = europa({ binary: './no-such-executable' });
  missing.configResolved({ root });
  await assert.rejects(missing.transform.call(context, '', id), /Cannot start EuropaCSS/);
});
