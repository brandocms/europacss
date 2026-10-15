// Validate the entire release set before any writes. Default is validation only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { readPackages } from './npm-registry.mjs';

const { values } = parseArgs({ options: { packages: { type: 'string', default: 'dist/npm' }, publish: { type: 'boolean', default: false }, provenance: { type: 'boolean', default: false } } });
const packages = await readPackages(values.packages);
const cli = JSON.parse(await readFile(new URL('../packages/cli/package.json', import.meta.url)));
const platforms = JSON.parse(await readFile(new URL('../packages/cli/platforms.json', import.meta.url)));
const order = [...platforms.map(p => `@brandocms/europacss-${p.suffix}`), cli.name, '@brandocms/vite-plugin-europacss'];
assert.deepEqual([...packages.keys()].sort(), [...order].sort(), 'All seven platform packages, CLI and adapter are required');
assert.equal(process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : `native-v${cli.version}`, `native-v${cli.version}`, 'Tag and package version differ');
for (const name of order) {
  const pkg = packages.get(name);
  assert.equal(pkg.manifest.version, cli.version, `Version mismatch: ${name}`);
  assert.equal(pkg.manifest.private, undefined, `Private package: ${name}`);
  assert.equal(pkg.manifest.publishConfig?.tag, 'beta');
  assert.equal(pkg.manifest.publishConfig?.access, 'public');
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly', 'prepack']) assert.equal(pkg.manifest.scripts?.[hook], undefined, `${name}: unexpected ${hook} script`);
  const expectedHash = (await readFile(`${pkg.file}.sha256`, 'utf8')).split(/\s/)[0];
  assert.equal(createHash('sha256').update(pkg.data).digest('hex'), expectedHash, `Checksum mismatch: ${name}`);
}
assert.deepEqual(packages.get(cli.name).manifest.optionalDependencies, Object.fromEntries(platforms.map(p => [`@brandocms/europacss-${p.suffix}`, cli.version])));
assert.equal(packages.get('@brandocms/vite-plugin-europacss').manifest.dependencies[cli.name], cli.version);
for (const p of platforms) {
  const manifest = packages.get(`@brandocms/europacss-${p.suffix}`).manifest;
  assert.deepEqual(manifest.os, [p.os]);
  assert.deepEqual(manifest.cpu, [p.cpu]);
  assert.deepEqual(manifest.libc, p.libc ? [p.libc] : undefined);
}
console.log(`Validated ${order.length} packages at ${cli.version}.`);
if (values.publish) {
  // A failed multi-package publish can be resumed without replacing artifacts.
  // Check every existing version before making any registry writes.
  const published = new Set();
  for (const name of order) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${cli.version}`, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Registry preflight failed for ${name}: ${response.status}`);
    const existing = await response.json();
    assert.equal(existing.dist?.integrity, packages.get(name).integrity, `${name}@${cli.version} already exists with different contents; choose a new version`);
    published.add(name);
  }
  // Publish the already-tested tarballs, never the source workspace.
  for (const name of order) {
    if (published.has(name)) { console.log(`Already published with matching integrity: ${name}@${cli.version}`); continue; }
    console.log(`Publishing ${name}@${cli.version} under beta`);
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['publish', packages.get(name).file, '--ignore-scripts', ...(values.provenance ? ['--provenance'] : []), '--access', 'public', '--tag', 'beta'], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Publish failed for ${name}: ${code}`)));
    });
  }
}
