import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, differences, comparePage } from './compare.mjs';

const args = ['http://localhost:4000/admin', '--before', 'old.css', '--after', 'new.css', '--stylesheet', '/assets/admin.css'];
const element = (style = {}, box = { x: 0, y: 0, width: 100, height: 20 }, selector = 'html > body > div') => ({ selector, label: 'div.field', style, box });
const snapshot = (elements, mutations = 0) => ({ elements, mutations, coverage: { elements: elements.length } });

test('comparison arguments define exact stylesheet, viewport and numeric limits', () => {
  const options = parseArgs(args);
  assert.equal(options.stylesheet, 'http://localhost:4000/assets/admin.css');
  assert.deepEqual(options.viewports, [{ width: 1440, height: 900 }]);
  assert.equal(parseArgs([...args, '--target', 'prepared']).viewports.length, 0);
  for (const suffix of [['--viewport', '0x600'], ['--viewport', '12000x600'], ['--tolerance', 'NaN'], ['--settle', '-1'], ['--target', 'prepared', '--viewport', '600x900'], ['--typo']]) assert.throws(() => parseArgs([...args, ...suffix]));
  assert.throws(() => parseArgs(args.slice(0, -2)), /stylesheet/);
});

test('computed-property changes and box tolerance remain separate', () => {
  const before = snapshot([element({ color: 'red', 'margin-bottom': '14.4px' })]);
  const after = snapshot([element({ color: 'blue', 'margin-bottom': '20px' }, { x: 0.05, y: 1, width: 100, height: 20 })]);
  const [change] = differences(before, after);
  assert.deepEqual(change.geometry, { y: { before: 0, after: 1 } });
  assert.deepEqual(change.properties['margin-bottom'], { before: '14.4px', after: '20px' });
  assert.deepEqual(differences(before, structuredClone(before)), []);
});

test('generated pseudo-elements are reported as appearance changes, not DOM mutations', () => {
  const before = snapshot([element()]);
  const after = snapshot([element(), element({ content: '"new"' }, {}, 'html > body > div::before')]);
  const [change] = differences(before, after);
  assert.deepEqual(change.presence, { before: false, after: true });
  assert.deepEqual(differences(after, before)[0].presence, { before: true, after: false });
  assert.throws(() => differences(before, { ...before, mutations: 1 }), /DOM changed/);
  assert.throws(() => differences(before, snapshot([element({}, {}, 'another-element')])) , /DOM changed/);
});

function browser(snapshots, failure) {
  const calls = [];
  const cdp = {
    calls, listeners: new Set(),
    async send(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === 'Target.getTargetInfo') return { targetInfo: { type: 'page', url: args[0] } };
      if (method === 'Target.createTarget') return { targetId: 'created' };
      if (method === 'Target.attachToTarget') return { sessionId: 'session' };
      if (method === 'CSS.enable') for (const listener of this.listeners) listener({ method: 'CSS.styleSheetAdded', sessionId, params: { header: { styleSheetId: 'sheet', frameId: 'frame', sourceURL: 'http://localhost:4000/assets/admin.css' } } });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame' } } };
      if (method === 'CSS.getStyleSheetText') return { text: 'original' };
      if (method === 'CSS.setStyleSheetText' && params.text === 'after' && failure) throw new Error('candidate rejected');
      if (method === 'Runtime.evaluate') {
        let value;
        if (params.expression.includes('document.readyState')) value = true;
        if (params.expression.includes('.snapshot()')) value = snapshots.shift();
        if (params.expression.includes('innerWidth')) value = { width: 600, height: 900, devicePixelRatio: 1 };
        return { result: { value } };
      }
      return {};
    },
  };
  return cdp;
}

test('prepared-tab comparison restores CSS without navigation or resizing', async () => {
  const before = snapshot([element({ color: 'red' })]), after = snapshot([element({ color: 'blue' })]);
  const cdp = browser([before, before, after, after]);
  const result = await comparePage(cdp, { ...parseArgs([...args, '--target', 'prepared']), settle: 0 }, 'before', 'after');
  assert.equal(result.changes.length, 1);
  assert.deepEqual(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').map(c => c.params.text), ['before', 'after', 'original']);
  assert.ok(!cdp.calls.some(c => ['Page.navigate', 'Target.closeTarget', 'Emulation.setDeviceMetricsOverride'].includes(c.method)));
  assert.ok(cdp.calls.some(c => c.method === 'Target.detachFromTarget'));
  assert.equal(cdp.listeners.size, 0);
});

test('failed and unstable comparisons restore the stylesheet and close only owned tabs', async () => {
  const before = snapshot([element({ color: 'red' })]);
  for (const failure of [true, false]) {
    const cdp = browser([before, before, { ...before, mutations: 1 }, { ...before, mutations: 1 }], failure);
    await assert.rejects(comparePage(cdp, { ...parseArgs(args), settle: 0 }, 'before', 'after', { width: 600, height: 900 }), failure ? /candidate rejected/ : /DOM changed/);
    assert.equal(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').at(-1).params.text, 'original');
    assert.ok(cdp.calls.some(c => c.method === 'Target.closeTarget' && c.params.targetId === 'created'));
  }
});
