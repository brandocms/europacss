const { test } = require('node:test');
const assert = require('node:assert/strict');
const { platformPackage } = require('../platform.cjs');

test('platform selection distinguishes architecture and Linux libc', () => {
  for (const [os, cpu, libc, suffix] of [
    ['darwin', 'arm64', undefined, 'darwin-arm64'],
    ['darwin', 'x64', undefined, 'darwin-x64'],
    ['linux', 'x64', 'glibc', 'linux-x64-gnu'],
    ['linux', 'arm64', 'glibc', 'linux-arm64-gnu'],
    ['linux', 'x64', 'musl', 'linux-x64-musl'],
    ['linux', 'arm64', 'musl', 'linux-arm64-musl'],
    ['win32', 'x64', undefined, 'win32-x64'],
  ]) {
    const name = platformPackage(os, cpu, libc);
    assert.equal(name, `@brandocms/europacss-${suffix}`);
  }
});

test('unsupported platforms fail explicitly', () => {
  assert.throws(() => platformPackage('linux', 'arm', 'glibc'), /does not provide a binary for linux\/arm\/glibc/);
  assert.throws(() => platformPackage('win32', 'arm64'), /does not provide a binary/);
  assert.throws(() => platformPackage('linux', 'x64', 'unknown'), /does not provide a binary/);
});
