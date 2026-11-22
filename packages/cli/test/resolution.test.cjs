const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, cpSync, writeFileSync, mkdirSync, chmodSync, rmSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { platformPackage } = require('../platform.cjs');
const { version } = require('../package.json');

function fixture(t, installedVersion) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'europa resolver ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['index.cjs', 'platform.cjs', 'platforms.json', 'package.json']) cpSync(path.join(__dirname, '..', file), path.join(root, file));
  const directory = path.join(root, 'node_modules', platformPackage());
  const executable = path.join(directory, 'bin', process.platform === 'win32' ? 'europa.exe' : 'europa');
  if (installedVersion) {
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: platformPackage(), version: installedVersion }));
    writeFileSync(executable, 'fixture only');
    chmodSync(executable, 0o755);
  }
  return { getBinaryPath: require(path.join(root, 'index.cjs')).getBinaryPath, executable };
}

test('missing platform dependency explains optional dependencies and reinstall', t => {
  const { getBinaryPath } = fixture(t);
  assert.throws(getBinaryPath, /Missing EuropaCSS platform package.*optional dependencies enabled/s);
});

test('matching platform binary resolves to an absolute path, including spaces', t => {
  const { getBinaryPath, executable } = fixture(t, version);
  assert.equal(getBinaryPath(), executable);
  assert.ok(path.isAbsolute(getBinaryPath()));
});

test('mismatched binary version cannot silently run', t => {
  const { getBinaryPath } = fixture(t, '0.0.0');
  assert.throws(getBinaryPath, /binary version mismatch/);
});

test('missing executable is diagnosed separately from a missing package', t => {
  const { getBinaryPath, executable } = fixture(t, version);
  rmSync(executable);
  assert.throws(getBinaryPath, /executable is missing or not executable/);
});
