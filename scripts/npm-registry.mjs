// A read-only loopback registry for testing release tarballs before publication.
// Only @brandocms/europacss packages are served; other packages use npm normally.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function readPackages(directory) {
  const packages = new Map();
  for (const filename of (await readdir(directory)).filter(f => f.endsWith('.tgz'))) {
    const file = path.resolve(directory, filename);
    // A Windows drive prefix looks like a remote host to GNU tar. Read from
    // the archive's directory using its basename, which also works with BSD tar.
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', path.basename(file), 'package/package.json'], { cwd: path.dirname(file), encoding: 'utf8' }));
    if (!manifest.name.startsWith('@brandocms/europacss-') && manifest.name !== '@brandocms/vite-plugin-europacss') {
      throw new Error(`Unexpected release package: ${manifest.name}`);
    }
    if (packages.has(manifest.name)) throw new Error(`Duplicate release package: ${manifest.name}`);
    const data = await readFile(file);
    packages.set(manifest.name, { manifest, filename, file, data, integrity: `sha512-${createHash('sha512').update(data).digest('base64')}` });
  }
  return packages;
}

export async function startRegistry(directory) {
  const packages = await readPackages(directory);
  const version = packages.get('@brandocms/europacss-cli')?.manifest.version;
  if (!version || !packages.has('@brandocms/vite-plugin-europacss')) throw new Error('Pack the CLI and adapter with --shared first');
  const platforms = JSON.parse(await readFile(new URL('../packages/cli/platforms.json', import.meta.url)));
  // Other architectures need resolvable metadata for portable lockfiles, but
  // must never be downloaded on this host. No fake executable is provided.
  for (const p of platforms) {
    const name = `@brandocms/europacss-${p.suffix}`;
    if (!packages.has(name)) packages.set(name, { manifest: { name, version, os: [p.os], cpu: [p.cpu], ...(p.libc ? { libc: [p.libc] } : {}) } });
  }
  const unexpectedDownloads = [];
  let origin;
  const server = createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (route.startsWith('tarballs/')) {
      const pkg = [...packages.values()].find(p => p.filename === route.slice(9));
      if (pkg?.data) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(pkg.data); }
      else { unexpectedDownloads.push(route); res.writeHead(404).end(); }
      return;
    }
    const pkg = packages.get(route);
    if (!pkg) { res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Not found' })); return; }
    const manifest = { ...pkg.manifest, dist: {
      tarball: `${origin}/tarballs/${pkg.filename ?? `${pkg.manifest.name.split('/')[1]}-unbuilt.tgz`}`,
      ...(pkg.integrity ? { integrity: pkg.integrity } : {}),
    } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name: manifest.name, 'dist-tags': { beta: version, latest: version }, versions: { [version]: manifest }, time: { [version]: '2020-01-01T00:00:00.000Z' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, version, unexpectedDownloads, packages, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = await startRegistry(process.argv[2] ?? 'dist/npm');
  console.log(registry.origin);
}
