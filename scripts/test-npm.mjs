// End-to-end installation of actual release tarballs with no install scripts.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRegistry } from './npm-registry.mjs';

const { values } = parseArgs({ options: {
  packages: { type: 'string', default: 'dist/npm' },
  manager: { type: 'string', default: 'npm' },
  vite: { type: 'string', default: '8.3.0' },
  registry: { type: 'string' },
  version: { type: 'string' },
} });
assert.ok(['npm', 'pnpm'].includes(values.manager), 'manager must be npm or pnpm');
const registry = values.registry ? null : await startRegistry(values.packages);
const origin = values.registry ?? registry.origin;
const version = values.version ?? registry?.version;
assert.ok(version, '--version is required with --registry');
const root = await mkdtemp(path.join(tmpdir(), 'europa npm smoke '));
const env = { ...process.env, npm_config_userconfig: path.join(root, '.npmrc'), NO_COLOR: '1' };
delete env.EUROPA_BINARY;
// Run package-manager JS entrypoints directly so Windows never needs a shell.
const npmCli = process.env.npm_execpath?.endsWith('npm-cli.js') ? process.env.npm_execpath
  : process.platform === 'win32' ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
let command = [process.execPath, npmCli];
if (values.manager === 'pnpm') {
  const prefix = execFileSync(process.execPath, [npmCli, 'prefix', '--global'], { encoding: 'utf8' }).trim();
  command = [process.execPath, process.env.EUROPA_PNPM_CLI ?? path.join(prefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', 'pnpm/bin/pnpm.cjs')];
}
function run(args, { executable = command, status = 0, cwd = root, input = '' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable[0], [...executable.slice(1), ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${args.join(' ')}\n${output}`)); }, 180_000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== status) reject(new Error(`${args.join(' ')} exited ${code}, expected ${status}\n${output}`));
      else resolve(output);
    });
  });
}
try {
  await writeFile(path.join(root, '.npmrc'), `@brandocms:registry=${origin}\nregistry=https://registry.npmjs.org/\naudit=false\nfund=false\n`);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'europa-release-smoke', private: true, type: 'module', scripts: { build: 'vite build' }, devDependencies: {
    '@brandocms/europacss-cli': version,
    '@brandocms/vite-plugin-europacss': version,
    vite: values.vite,
    lightningcss: '1.33.0',
  } }));
  const install = values.manager === 'pnpm' ? ['install', '--ignore-scripts', '--store-dir', path.join(root, 'store')] : ['install', '--ignore-scripts', '--cache', path.join(root, 'cache')];
  await run(install);
  // A second clean install must honor the same lockfile, including optional binaries.
  await rm(path.join(root, 'node_modules'), { recursive: true, force: true });
  await run(values.manager === 'pnpm' ? [...install, '--frozen-lockfile'] : ['ci', ...install.slice(1)]);
  const cli = (...args) => run(['exec', ...(values.manager === 'npm' ? ['--'] : []), 'europa', ...args]);
  assert.match(await cli('--version'), new RegExp(version.replaceAll('.', '\\.')));
  await mkdir(path.join(root, 'css'));
  await writeFile(path.join(root, 'base.json5'), "{ nesting:'expanded', responsiveOrder:'generated-last', migration:{mediaPacking:'none'}, theme:{colors:{brand:'red'}} }");
  await writeFile(path.join(root, 'europa.json5'), "{extends:'./base.json5'}");
  await writeFile(path.join(root, 'css/app.css'), '.card{@color fg brand;}');
  await cli('css/app.css', '--config', 'europa.json5', '-o', 'compiled.css');
  assert.match(await readFile(path.join(root, 'compiled.css'), 'utf8'), /color:\s*red/);
  const cliManifest = (await run(['-p', "require.resolve('@brandocms/europacss-cli/package.json')"], { executable: [process.execPath] })).trim();
  const launcher = [process.execPath, path.join(path.dirname(cliManifest), 'bin/europa.cjs')];
  const stdinCss = await run(['-'], { executable: launcher, input: '.stdin { color: green; }' });
  assert.match(stdinCss, /\.stdin/);
  assert.match(stdinCss, /color:\s*green/);
  if (process.platform !== 'win32') {
    await new Promise((resolve, reject) => {
      const child = spawn(launcher[0], [...launcher.slice(1), 'css/app.css', '--config', 'europa.json5', '-o', 'watched.css', '--watch'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let sent = false;
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Watch signal test timed out: ${output}`)); }, 15_000);
      const collect = data => {
        output += data;
        if (!sent && /compiled|watching/i.test(output)) { sent = true; child.kill('SIGTERM'); }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        if (sent && signal === 'SIGTERM') resolve();
        else reject(new Error(`Watch did not preserve SIGTERM (${code}, ${signal}): ${output}`));
      });
    });
  }
  const migration = JSON.parse(await cli('migrate', 'css/app.css', '--from', '1.0.0-beta.6', '--config', 'europa.json5', '--json'));
  assert.equal(migration.analysis_complete, true);
  assert.equal(migration.assumptions.media_packing, 'none');
  await writeFile(path.join(root, 'bad.css'), '.card { @extend %missing; }');
  const failure = await run(['exec', ...(values.manager === 'npm' ? ['--'] : []), 'europa', 'bad.css'], { status: 1 });
  assert.match(failure, /EU_|error/i);
  await writeFile(path.join(root, 'index.html'), '<script type="module" src="/main.js"></script><div class="card">test</div>');
  await writeFile(path.join(root, 'main.js'), "import './css/app.css';");
  await writeFile(path.join(root, 'vite.config.js'), `import europa from '@brandocms/vite-plugin-europacss';\nexport default {plugins:[europa()],css:{postcss:{plugins:[]}},build:{cssMinify:'lightningcss'}};\n`);
  await run(['run', 'build']);
  const output = await readdir(path.join(root, 'dist/assets'));
  assert.match(await readFile(path.join(root, 'dist/assets', output.find(f => f.endsWith('.css'))), 'utf8'), /color:red/);
  // Adapter-only consumers have no direct CLI dependency or PATH bin shim.
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  delete manifest.devDependencies['@brandocms/europacss-cli'];
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
  await rm(path.join(root, 'node_modules'), { recursive: true, force: true });
  await run(install);
  await run(['run', 'build']);
  if (registry) assert.deepEqual(registry.unexpectedDownloads, [], 'Installed an incompatible or unbuilt platform');
  console.log(`Passed: Node ${process.versions.node}, ${values.manager}, Vite ${values.vite}, ${process.platform}/${process.arch}; clean install, frozen reinstall, CLI, migration, error exit, and adapter-only build`);
} finally {
  await registry?.close();
  await rm(root, { recursive: true, force: true });
}
