import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedTargets } from '../targets.js';

test('mobile engine targets merge at the oldest floor and patch floors are conservative', () => {
  const policy = sharedTargets({ chrome: 110 << 16, android: 143 << 16, samsung: 20 << 16, safari: (15 << 16) | (6 << 8) | 1, ios_saf: 15 << 16 });
  assert.deepEqual(policy.vite, ['chrome106.0', 'ios15.0', 'safari15.6']);
  assert.deepEqual(policy.browsers, ['chrome 106.0', 'ios_saf 15.0', 'safari 15.6']);
  assert.deepEqual(policy.lightning, { chrome: 106 << 16, ios_saf: 15 << 16, safari: (15 << 16) | (6 << 8) });
});

test('unrepresentable targets are never silently dropped', () => {
  for (const targets of [{ samsung: 255 << 16 }, { android: (4 << 16) | (4 << 8) }, { unknown: 1 << 16 }, { chrome: -1 }, { chrome: '100' }, {}]) {
    assert.throws(() => sharedTargets(targets));
  }
});
