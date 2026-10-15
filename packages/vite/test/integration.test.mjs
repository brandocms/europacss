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
  const { root, config, write } = await fixture(t);
  await mkdir(path.join(root, 'node_modules/preset'), { recursive: true });
  await write('node_modules/preset/europa.json5', "{theme:{colors:{brand:'red'}}}");
  await write('europa.json5', "{extends:'./node_modules/preset/europa.json5'}");
  const output = await build({ ...config, build: { write: false, sourcemap: true, assetsInlineLimit: 0, minify: false } });
  const assets = output.output;
  const css = assets.find((asset) => asset.fileName.endsWith('.css')).source;
  assert.match(css, /color:\s*red/);
  assert.doesNotMatch(css, /@color/);
  assert.match(css, /\/assets\/icon-.*\.svg/);
  assert.ok(assets.some((asset) => asset.fileName.endsWith('.svg')));
  assert.match(await readFile(path.join(root, 'app.css'), 'utf8'), /@import/);
});

test('package exports and aliases resolve through Vite with layers, assets and dependency reloads', async (t) => {
  const { root, config, write } = await fixture(t);
  await mkdir(path.join(root, 'node_modules/vendor/styles'), { recursive: true });
  await write('node_modules/vendor/package.json', JSON.stringify({ name: 'vendor', version: '1.0.0', exports: { './theme.css': './styles/theme.css' } }));
  await write('node_modules/vendor/styles/theme.css', "@import 'vendor-alias'; .vendor{color:green;background:url('./icon.svg')}");
  await write('node_modules/vendor/styles/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>');
  await write('nested/alias.css', '.alias{color:purple}');
  await write('app.css', "@layer vendor,app; @import 'vendor/theme.css' layer(vendor); @layer app{.entry{color:blue}}");
  config.resolve = { alias: { 'vendor-alias': path.join(root, 'nested/alias.css') } };
  const built = await build({ ...config, build: { write: false, assetsInlineLimit: 0 } });
  const css = built.output.find(asset => asset.fileName.endsWith('.css')).source;
  assert.match(css, /@layer vendor/);
  assert.match(css, /\.vendor/);
  assert.match(css, /\.alias/);
  assert.match(css, /\/assets\/icon-.*\.svg/);
  assert.doesNotMatch(css, /@import/);
  const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close());
  await server.listen();
  assert.match((await server.transformRequest('/app.css')).code, /green/);
  const module = server.moduleGraph.getModuleById(path.join(root, 'app.css'));
  await write('node_modules/vendor/styles/theme.css', '.vendor{color:orange}');
  await eventually(() => module.transformResult === null);
  assert.match((await server.transformRequest('/app.css')).code, /orange/);
});

test('inherited config chains reload, recover missing parents and stop watching replaced packages', async (t) => {
  const { root, config, write } = await fixture(t);
  await mkdir(path.join(root, 'node_modules/preset'), { recursive: true });
  await write('node_modules/preset/europa.json5', "{extends:'palette.json5',theme:{colors:{brand:'{colors.ink}'}}}");
  await write('node_modules/preset/palette.json5', "{theme:{colors:{ink:'red'}}}");
  await write('europa.json5', "{extends:'./node_modules/preset/europa.json5'}");
  const server = await createServer({ ...config, server: { port: 0, host: '127.0.0.1' } });
  t.after(() => server.close());
  await server.listen();
  const css = () => server.transformRequest('/app.css');
  assert.match((await css()).code, /color: red/);
  const module = server.moduleGraph.getModuleById(path.join(root, 'app.css'));
  const reloads = [];
  const send = server.ws.send.bind(server.ws);
  server.ws.send = (...args) => { reloads.push(args[0]); return send(...args); };
  const change = async (name, contents, expected) => {
    reloads.length = 0;
    await write(name, contents);
    await eventually(() => module.transformResult === null && reloads.some(m => m.type === 'full-reload'));
    assert.match((await css()).code, expected);
  };
  await change('node_modules/preset/palette.json5', "{theme:{colors:{ink:'green'}}}", /color: green/);
  await write('node_modules/preset/europa.json5', "{extends:'missing.json5',theme:{colors:{brand:'{colors.ink}'}}}");
  await eventually(() => module.transformResult === null);
  await assert.rejects(css(), error => /EU_CONFIG.*extends[\s\S]*missing.json5/.test(error.message));
  await change('node_modules/preset/missing.json5', "{theme:{colors:{ink:'gold'}}}", /color: gold/);
  const cached = module.transformResult;
  await write('node_modules/preset/palette.json5', "{theme:{colors:{ink:'purple'}}}");
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(module.transformResult, cached, 'Removed parents must not invalidate CSS');
  reloads.length = 0;
  await unlink(path.join(root, 'node_modules/preset/missing.json5'));
  await eventually(() => module.transformResult === null && reloads.some(m => m.type === 'full-reload'));
  await assert.rejects(css(), error => error.message.includes('EU_CONFIG'));
  await change('node_modules/preset/missing.json5', "{theme:{colors:{ink:'tan'}}}", /color: tan/);
  // Outside node_modules, inherited configs use Vite's ordinary HMR path.
  await write('local.json5', "{theme:{colors:{brand:'blue'}}}");
  await write('europa.json5', "{extends:'local.json5'}");
  await eventually(() => module.transformResult === null);
  assert.match((await css()).code, /color: (?:blue|#00f)/);
  await write('local.json5', "{theme:{colors:{brand:'purple'}}}");
  await eventually(() => module.transformResult === null);
  assert.match((await css()).code, /color: purple/);
});

test('dev HMR follows transitive CSS/config edits, diagnoses errors and recovers missing imports', async (t) => {
  const { root, config, write } = await fixture(t);
  // Programmatic writes can arrive inside Chokidar's 50ms change-event throttle
  // on Linux. Wait for each complete write so successive fixture edits have
  // distinct events, just as editor writes do; no HMR assertion is bypassed.
  const server = await createServer({ ...config, server: { port: 0, host: '127.0.0.1', watch: { awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 10 } } } });
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
  // Decode the standard VLQ map at the injected CSS property's exact position.
  const prefix = css.slice(0, css.indexOf('font-size:'));
  const targetLine = prefix.split('\n').length - 1;
  const targetColumn = prefix.split('\n').at(-1).length;
  let source = 0, line = 0, column = 0, found;
  for (const [generatedLine, row] of map.mappings.split(';').entries()) {
    let generatedColumn = 0;
    for (const segment of row.split(',').filter(Boolean)) {
      const fields = [];
      let value = 0, shift = 0;
      for (const char of segment) {
        const digit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(char);
        value |= (digit & 31) << shift;
        if (digit & 32) { shift += 5; continue; }
        fields.push((value & 1 ? -1 : 1) * (value >>> 1));
        value = 0; shift = 0;
      }
      generatedColumn += fields[0];
      if (fields.length >= 4) { source += fields[1]; line += fields[2]; column += fields[3]; }
      if (generatedLine === targetLine && generatedColumn <= targetColumn) {
        found = fields.length >= 4 ? { source: map.sources[source], line, column } : undefined;
      }
    }
  }
  assert.ok(found.source.endsWith('/nested/child.css'));
  assert.equal(found.line, 1);
  assert.equal(found.column, 2);

  for (const cssMinify of [false, 'lightningcss']) {
    const output = await build({ ...config, build: { write: false, cssMinify } });
    const css = output.output.find(asset => asset.fileName.endsWith('.css')).source;
    assert.match(css, /font-size/);
    assert.doesNotMatch(css, /--ec-font-token/);
  }
});
