import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, resolveConfig } from 'vite';
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
  const settings = { root };
  await plugin.config.handler(settings);
  plugin.configResolved(settings);
  const watched = [];
  const context = { addWatchFile(file) { watched.push(file); }, warn() {}, error(error) { throw error instanceof Error ? error : Object.assign(new Error(error.message), error); } };
  const id = path.join(root, 'app.css');
  const result = await plugin.transform.call(context, '.from-memory{color:teal}', id);
  assert.match(result.code, /from-memory/);
  assert.doesNotMatch(result.code, /entry/);
  assert.ok(!watched.includes(id)); // entry must not import itself
  for (const suffix of ['?raw', '?url', '?vue&type=style']) assert.equal(await plugin.transform.call(context, '', id + suffix), null);
  const missing = europa({ binary: './no-such-executable' });
  await assert.rejects(missing.config.handler({ root }), /Cannot start EuropaCSS/);
});

test('one CSS policy survives legacy defaults and final minification, including excluded CSS', async (t) => {
  const { root, write, config } = await fixture(t);
  await write('app.css', '.card { backdrop-filter: blur(2px); user-select: none; }');
  await write('vendor.css', '.vendor { backdrop-filter: blur(3px); }');
  await write('main.js', "import './app.css'; import './vendor.css';");
  // Reproduce @vitejs/plugin-legacy's CSS default without bringing Babel into this fixture.
  const legacyDefault = { name: 'legacy-css-default', config(config) {
    config.build ??= {};
    config.build.cssTarget ??= 'chrome61';
  } };
  for (const minifier of ['lightningcss', 'esbuild']) {
    const settings = {
      ...config,
      plugins: [legacyDefault, europa({ binary, targets: ['chrome 110', 'safari 15.6', 'ios_saf 15.6'], include: file => file.endsWith('/app.css') })],
      build: { write: false, cssMinify: minifier, target: 'es2020' },
    };
    const resolved = await resolveConfig(settings, 'build');
    assert.deepEqual(resolved.build.cssTarget, ['chrome110.0', 'ios15.6', 'safari15.6']);
    assert.equal(resolved.build.target, 'es2020');
    assert.deepEqual(resolved.css.lightningcss.targets, { chrome: 110 << 16, ios_saf: (15 << 16) | (6 << 8), safari: (15 << 16) | (6 << 8) });
    const output = await build(settings);
    const css = output.output.find(asset => asset.fileName.endsWith('.css')).source;
    assert.match(css, /-webkit-backdrop-filter:blur\(2px\)/);
    // Lightning CSS also transforms vendor styles bypassing Europa. Esbuild does
    // not have an autoprefixer, so only require that for the Lightning minifier.
    if (minifier === 'lightningcss') assert.match(css, /-webkit-backdrop-filter:blur\(3px\)/);
    assert.ok(css.length < 400, css);
  }
});

test('default and mobile policies resolve without JS target drift; invalid policies fail early', async (t) => {
  const { config } = await fixture(t);
  const resolved = await resolveConfig(config, 'build');
  assert.ok(resolved.build.cssTarget.some(target => target.startsWith('safari')));
  assert.ok(resolved.build.cssTarget.some(target => target.startsWith('ios')));
  const mobile = await resolveConfig({ ...config, plugins: [europa({ binary, targets: ['samsung 28', 'android 143', 'and_chr 143'] })] }, 'build');
  assert.deepEqual(mobile.build.cssTarget, ['chrome130.0']);
  for (const targets of [['invalid-browser'], ['chrome > 999'], ['android 4.4']]) {
    await assert.rejects(resolveConfig({ ...config, plugins: [europa({ binary, targets })] }, 'build'), /EU_TARGETS|did not select|stock Android/);
  }
  const override = { name: 'late-css-target-override', config: { order: 'post', handler(config) { config.build.cssTarget = ['chrome61']; } } };
  await assert.rejects(resolveConfig({ ...config, plugins: [europa({ binary }), override] }, 'build'), /Another plugin changed EuropaCSS CSS targets/);
});

test('dev token labels survive Vite injection and production always omits them', async (t) => {
  const { config, write } = await fixture(t);
  await write('nested/child.css', '.card {\n  @fontsize base;\n  opacity: .75;\n}');
  config.plugins = [europa({ binary, debugTokens: true })];
  const server = await createServer({ ...config, server: { port: 0 } });
  t.after(() => server.close());
  const result = await server.transformRequest('/app.css');
  // The JS-injected stylesheet retains the declaration-shaped comment.
  const css = JSON.parse(result.code.match(/const __vite__css = (".*")/)[1]);
  assert.match(css, /font-size:.*\/\* --ec-font-token: "typography.sizes.base"; \*\//);
  const map = JSON.parse(Buffer.from(result.code.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/)[1], 'base64').toString());
  assert.ok(map.sources.some(source => source.endsWith('/nested/child.css')));
  assert.ok(map.names.includes('typography.sizes.base'));
  for (const cssMinify of [false, 'lightningcss']) {
    const output = await build({ ...config, build: { write: false, cssMinify } });
    const css = output.output.find(asset => asset.fileName.endsWith('.css')).source;
    assert.match(css, /font-size/);
    assert.doesNotMatch(css, /--ec-font-token/);
  }
});
