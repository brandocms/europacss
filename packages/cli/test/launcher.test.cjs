const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, cpSync, writeFileSync, mkdirSync, chmodSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { platformPackage } = require('../platform.cjs');
const { version } = require('../package.json');

test('shutdown during spawn reaches the native child and preserves the signal', { skip: process.platform === 'win32' }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'europa launcher '));
  const native = path.join(root, 'node_modules', platformPackage());
  cpSync(path.join(__dirname, '..'), root, { recursive: true });
  mkdirSync(path.join(native, 'bin'), { recursive: true });
  writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: platformPackage(), version }));
  writeFileSync(path.join(native, 'bin/europa'), '#!/bin/sh\nexec sleep 60\n');
  chmodSync(path.join(native, 'bin/europa'), 0o755);
  // Reproduce a supervisor delivering SIGTERM after the child starts but
  // before the launcher's spawn() returns. Without the early handler the
  // launcher exits immediately, leaving the child and its stdio pipes alive.
  writeFileSync(path.join(root, 'supervised.cjs'), `
    const cp = require('node:child_process');
    const spawn = cp.spawn;
    cp.spawn = (...args) => {
      const child = spawn(...args);
      require('node:fs').writeFileSync('native.pid', String(child.pid));
      process.kill(process.pid, 'SIGTERM');
      return child;
    };
    require('./bin/europa.cjs');
  `);
  const child = spawn(process.execPath, ['supervised.cjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let completed = false;
  t.after(() => {
    if (!completed) {
      child.kill('SIGKILL');
      try { process.kill(Number(readFileSync(path.join(root, 'native.pid'), 'utf8')), 'SIGKILL'); } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Launcher left its native child running after SIGTERM')), 5000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); completed = true; resolve({ code, signal }); });
  });
  assert.deepEqual(result, { code: null, signal: 'SIGTERM' });
});
