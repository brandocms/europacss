import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, differences, comparePage, reproducibleChanges } from './compare.mjs';

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
        if (params.expression.includes('.checkMutations()')) value = { mutations: 0 };
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
  const cdp = browser([before, before, after, after, before, before]);
  const result = await comparePage(cdp, { ...parseArgs([...args, '--target', 'prepared']), settle: 0 }, 'before', 'after');
  assert.equal(result.changes.length, 1);
  assert.deepEqual(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').map(c => c.params.text), ['before', 'after', 'before', 'original']);
  assert.ok(!cdp.calls.some(c => ['Page.navigate', 'Target.closeTarget', 'Emulation.setDeviceMetricsOverride'].includes(c.method)));
  assert.ok(cdp.calls.some(c => c.method === 'Target.detachFromTarget'));
  assert.equal(cdp.listeners.size, 0);
});

test('failed and unstable comparisons restore the stylesheet and close only owned tabs', async () => {
  const before = snapshot([element({ color: 'red' })]);
  for (const failure of [true, false]) {
    const cdp = browser([before, before, { ...before, mutations: 1 }, { ...before, mutations: 1 }, before, before], failure);
    await assert.rejects(comparePage(cdp, { ...parseArgs(args), settle: 0 }, 'before', 'after', { width: 600, height: 900 }), failure ? /candidate rejected/ : /DOM changed/);
    assert.equal(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').at(-1).params.text, 'original');
    assert.ok(cdp.calls.some(c => c.method === 'Target.closeTarget' && c.params.targetId === 'created'));
  }
});

test('custom properties can be ignored while real style and box differences remain', () => {
  assert.equal(parseArgs([...args, '--ignore-custom-properties']).ignoreCustomProperties, true);
  const before = snapshot([element({'--ink':'red',color:'red'})]);
  const after = snapshot([element({'--ink':'blue',color:'blue'})]);
  assert.deepEqual(Object.keys(differences(before, after, 0.1, true)[0].properties), ['color']);
  assert.deepEqual(differences(before, snapshot([element({'--ink':'blue',color:'red'})]), 0.1, true), []);
});

test('A/B/A excludes non-reproducing geometry but retains reproducible CSS changes', () => {
  const before = snapshot([element({color:'red'}, {x:0,y:259.47,width:100,height:20})]);
  const after = snapshot([element({color:'blue'}, {x:0,y:258.47,width:120,height:20})]);
  const returned = snapshot([element({color:'red'}, {x:0,y:258.47,width:100,height:20})]);
  const result = reproducibleChanges(before, after, returned, 0.1);
  assert.deepEqual(Object.keys(result.changes[0].geometry), ['width']);
  assert.equal(result.changes[0].properties.color.after, 'blue');
  assert.equal(result.discardedGeometry[0].property, 'y');
  assert.throws(() => reproducibleChanges(before, after, after, 0.1), /did not reproduce/);
});

test('unstable errors identify the sample stage, selector, property and both values', async () => {
  const before = snapshot([element({width:'70.79px'})]);
  const changed = snapshot([element({width:'70.99px'})]);
  const cdp = browser([before, changed]);
  await assert.rejects(comparePage(cdp, {...parseArgs(args),settle:0}, 'before', 'after', {width:600,height:900}), error => {
    assert.equal(error.evidence.stage, 'baseline');
    assert.equal(error.evidence.examples[0].selector, 'html > body > div');
    assert.deepEqual(error.evidence.examples[0].properties.width, {before:'70.79px',after:'70.99px'});
    return true;
  });
});

test('priming settles replacement history for identical CSS without bypassing measurement', async () => {
  assert.equal(parseArgs([...args, '--prime']).prime, true);
  for (const prime of [false, true]) {
    const cdp = browser([]);
    const send = cdp.send.bind(cdp);
    let replacements = 0;
    cdp.send = async (method, params, sessionId) => {
      if (method === 'CSS.setStyleSheetText') replacements++;
      if (method === 'Runtime.evaluate' && params.expression.includes('.snapshot()')) {
        return { result: { value: snapshot([element({}, {x:0,y:replacements < 2 ? 259.47 : 258.47,width:100,height:20})]) } };
      }
      return send(method, params, sessionId);
    };
    const result = await comparePage(cdp, {...parseArgs([...args, '--target', 'prepared']), settle:0, prime}, 'same', 'same');
    assert.equal(result.priming, prime ? 'A/B/A' : 'none');
    assert.equal(result.changes.length, 0);
    assert.equal(result.discardedGeometry.length, prime ? 0 : 1);
  }
});

test('priming is recorded, retains real differences, and leaves instability checks active', async () => {
  const before = snapshot([element({color:'red'})]), after = snapshot([element({color:'blue'})]);
  const options = {...parseArgs([...args, '--target', 'prepared', '--prime']), settle:0};
  const cdp = browser([before, before, after, after, before, before]);
  const result = await comparePage(cdp, options, 'before', 'after');
  assert.equal(result.priming, 'A/B/A');
  assert.equal(result.changes[0].properties.color.after, 'blue');
  assert.deepEqual(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').map(c => c.params.text), ['before', 'before', 'after', 'before', 'after', 'before', 'original']);
  const unstable = browser([before, after]);
  await assert.rejects(comparePage(unstable, options, 'before', 'after'), /Baseline styles or geometry are unstable/);
  assert.equal(unstable.calls.filter(c => c.method === 'CSS.setStyleSheetText').at(-1).params.text, 'original');
});

test('priming rejects DOM mutations and restores the prepared tab even when a swap fails', async () => {
  const options = {...parseArgs([...args, '--target', 'prepared', '--prime']), settle:0};
  for (const failure of [false, true]) {
    const cdp = browser([], failure);
    const send = cdp.send.bind(cdp);
    let checks = 0;
    cdp.send = async (method, params, sessionId) => {
      if (method === 'Runtime.evaluate' && params.expression.includes('.checkMutations()')) return {result:{value:{mutations:checks++}}};
      return send(method, params, sessionId);
    };
    await assert.rejects(comparePage(cdp, options, 'before', 'after'), failure ? /candidate rejected/ : /DOM changed during priming/);
    assert.equal(cdp.calls.filter(c => c.method === 'CSS.setStyleSheetText').at(-1).params.text, 'original');
    assert.ok(!cdp.calls.some(c => ['Page.navigate', 'Target.closeTarget', 'Emulation.setDeviceMetricsOverride'].includes(c.method)));
  }
});
