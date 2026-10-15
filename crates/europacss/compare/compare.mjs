// Embedded in europa. Node 22+ built-ins only; no browser download or npm runtime dependency.
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const HELP = `Usage: europa compare <url> --before old.css --after new.css --stylesheet <href> [options]

  --cdp <url>          Chromium browser CDP endpoint (default http://127.0.0.1:9222)
  --target <id>        Compare an existing prepared tab; URL must match exactly
  --viewport <WxH>     New-tab viewport; repeat for multiple sizes (default 1440x900)
  --root <selector>    Compare this subtree (default html)
  --wait-for <selector> Wait for application readiness (default body)
  --settle <ms>        Wait between stability samples (default 250)
  --tolerance <px>     Ignore smaller geometry differences (default 0.1)
  --ignore-custom-properties  Omit computed custom properties from differences
  --prime             Run an unmeasured A/B/A swap before the measured A/B/A
  --json              Write the complete structured report to stdout

Requires Node.js 22+ and Chromium started with remote debugging. Uses an existing
browser session; no browser is downloaded. The selected stylesheet is replaced
in place and restored. Existing-tab mode does not navigate or resize the tab.
Exit codes: 0 no differences, 1 differences, 2 error or unstable/incomplete run.
`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function parseArgs(args) {
  const options = { cdp: 'http://127.0.0.1:9222', root: 'html', waitFor: 'body', settle: 250, tolerance: 0.1, viewports: [] };
  const names = { '--before': 'before', '--after': 'after', '--stylesheet': 'stylesheet', '--cdp': 'cdp', '--root': 'root', '--wait-for': 'waitFor', '--target': 'target', '--settle': 'settle', '--tolerance': 'tolerance' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--ignore-custom-properties') { options.ignoreCustomProperties = true; continue; }
    if (arg === '--prime') { options.prime = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--viewport') {
      const match = /^(\d+)x(\d+)$/.exec(args[++i] ?? '');
      if (!match || +match[1] < 1 || +match[2] < 1 || +match[1] > 10000 || +match[2] > 10000) throw new Error('--viewport expects WxH, each between 1 and 10000');
      options.viewports.push({ width: +match[1], height: +match[2] });
      if (options.viewports.length > 20) throw new Error('At most 20 viewports per comparison');
    } else if (names[arg]) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      options[names[arg]] = value;
    } else if (!arg.startsWith('-') && !options.url) options.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ['url', 'before', 'after', 'stylesheet']) if (!options[key]) throw new Error(`Missing ${key === 'url' ? '<url>' : `--${key}`}; run europa compare --help`);
  const url = new URL(options.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The page URL must use http or https');
  options.url = url.href;
  options.stylesheet = new URL(options.stylesheet, url).href;
  options.settle = Number(options.settle);
  options.tolerance = Number(options.tolerance);
  if (!Number.isFinite(options.settle) || options.settle < 0 || options.settle > 10000) throw new Error('--settle must be between 0 and 10000 ms');
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 10) throw new Error('--tolerance must be between 0 and 10 CSS pixels');
  if (options.target && options.viewports.length) throw new Error('--target keeps the existing viewport; omit --viewport');
  if (!options.target && !options.viewports.length) options.viewports.push({ width: 1440, height: 900 });
  return options;
}

export function differences(before, after, tolerance = 0.1, ignoreCustomProperties = false) {
  const primary = snapshot => snapshot.elements.filter(element => !/::(?:before|after)$/.test(element.selector)).map(element => element.selector);
  if (before.mutations !== after.mutations || JSON.stringify(primary(before)) !== JSON.stringify(primary(after))) {
    const error = new Error('DOM changed during comparison; prepare a stable page state and rerun');
    error.evidence = { mutations: { before: before.mutations, after: after.mutations }, examples: after.mutationDetails ?? [] };
    throw error;
  }
  const changes = [];
  const oldElements = new Map(before.elements.map(element => [element.selector, element]));
  const newElements = new Map(after.elements.map(element => [element.selector, element]));
  for (const selector of new Set([...oldElements.keys(), ...newElements.keys()])) {
    const old = oldElements.get(selector) ?? { box: {}, style: {} };
    const next = newElements.get(selector) ?? { box: {}, style: {} };
    const geometry = {};
    for (const key of Object.keys(old.box)) if (Math.abs(old.box[key] - next.box[key]) > tolerance) geometry[key] = { before: old.box[key], after: next.box[key] };
    const properties = {};
    for (const key of new Set([...Object.keys(old.style), ...Object.keys(next.style)])) {
      if (ignoreCustomProperties && key.startsWith('--')) continue;
      if (old.style[key] !== next.style[key]) properties[key] = { before: old.style[key] ?? null, after: next.style[key] ?? null };
    }
    const presence = oldElements.has(selector) !== newElements.has(selector) ? { before: oldElements.has(selector), after: newElements.has(selector) } : null;
    if (presence || Object.keys(geometry).length || Object.keys(properties).length) changes.push({ selector, label: old.label ?? next.label, ...(presence ? { presence } : {}), geometry, properties });
  }
  return changes;
}

// Retain only geometry that reproduces when the baseline is loaded again.
// Surface discarded samples so an empty diff is never presented as full evidence.
export function reproducibleChanges(before, after, returned, tolerance, ignoreCustomProperties = false) {
  const initial = differences(before, after, tolerance, ignoreCustomProperties);
  const drift = differences(before, returned, tolerance, ignoreCustomProperties);
  if (drift.some(change => change.presence || Object.keys(change.properties).length)) throw unstable('Baseline styles did not reproduce after the A/B/A swap', 'baseline-return', drift);
  const unstableBoxes = new Map(drift.map(change => [change.selector, change.geometry]));
  const discardedGeometry = [];
  for (const change of initial) {
    for (const property of Object.keys(change.geometry)) {
      if (unstableBoxes.get(change.selector)?.[property]) {
        discardedGeometry.push({ selector: change.selector, property, initial: change.geometry[property], returned: unstableBoxes.get(change.selector)[property].after });
        delete change.geometry[property];
      }
    }
  }
  return { changes: initial.filter(change => change.presence || Object.keys(change.geometry).length || Object.keys(change.properties).length), discardedGeometry };
}
function unstable(message, stage, changes) {
  const error = new Error(message);
  error.evidence = { stage, changedElements: changes.length, examples: changes.slice(0, 5).map(change => ({ ...change, properties: Object.fromEntries(Object.entries(change.properties).slice(0, 10)) })) };
  return error;
}

// Self-contained so exactly this code can be exercised through any browser harness.
export function installCapture(key, selector) {
  if (Object.hasOwn(window, key)) throw new Error('Comparison state key already exists');
  const roots = document.querySelectorAll(selector);
  if (roots.length !== 1) throw new Error(`--root must match exactly one element, matched ${roots.length}`);
  const root = roots[0];
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 10000) throw new Error('Comparison exceeds 10000 elements; choose a smaller --root');
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  document.head.append(freeze);
  const state = { mutations: 0, mutationDetails: [] };
  const observe = records => {
    state.mutations += records.length;
    for (const record of records) if (state.mutationDetails.length < 5) state.mutationDetails.push({ type: record.type, element: record.target.nodeType === 1 ? record.target.localName + (record.target.id ? '#' + record.target.id : '') : record.target.parentElement?.localName, attribute: record.attributeName });
  };
  const observer = new MutationObserver(observe);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const paths = new Map();
  const path = element => {
    if (!element) return '';
    if (paths.has(element)) return paths.get(element);
    const parent = element.parentElement;
    const value = parent ? `${path(parent)} > ${CSS.escape(element.localName)}:nth-child(${Array.prototype.indexOf.call(parent.children, element) + 1})` : CSS.escape(element.localName);
    paths.set(element, value);
    return value;
  };
  state.snapshot = () => {
    observe(observer.takeRecords());
    const records = [];
    let frames = 0, shadowRoots = 0, values = 0;
    for (const element of elements) {
      if (!element.isConnected) throw new Error(`DOM element was removed during comparison: ${path(element)} (${element.localName}${element.id ? '#' + element.id : ''})`);
      if (element.localName === 'iframe') frames++;
      if (element.shadowRoot) shadowRoots++;
      const label = `${element.localName}${element.id ? `#${element.id}` : ''}${element.getAttribute('class') ? `.${element.getAttribute('class').trim().replace(/\s+/g, '.')}` : ''}`;
      for (const pseudo of ['', '::before', '::after']) {
        const computed = getComputedStyle(element, pseudo || null);
        if (pseudo && (computed.content === 'none' || computed.content === 'normal')) continue;
        const style = {};
        for (const name of computed) {
          if (++values > 2_000_000) throw new Error('Comparison exceeds 2000000 computed values; choose a smaller --root');
          style[name] = computed.getPropertyValue(name);
        }
        const rect = element.getBoundingClientRect();
        records.push({ selector: path(element) + pseudo, label: label + pseudo, style,
          box: pseudo ? {} : { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      }
    }
    return { mutations: state.mutations, mutationDetails: state.mutationDetails, elements: records, coverage: { elements: elements.length, pseudoElements: records.length - elements.length, framesExcluded: frames, openShadowRootsExcluded: shadowRoots } };
  };
  state.checkMutations = () => {
    observe(observer.takeRecords());
    return { mutations: state.mutations, mutationDetails: state.mutationDetails };
  };
  state.dispose = () => { observer.disconnect(); freeze.remove(); delete window[key]; };
  window[key] = state;
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Chromium CDP connection closed')); }
      this.pending.clear();
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { this.socket.close(); }
}

async function connect(endpoint) {
  if (typeof WebSocket !== 'function') throw new Error('europa compare requires Node.js 22+ (built-in WebSocket)');
  let url = endpoint;
  if (!/^wss?:/.test(url)) {
    const response = await fetch(new URL('/json/version', endpoint), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`CDP discovery failed: HTTP ${response.status}`);
    url = (await response.json()).webSocketDebuggerUrl;
    if (!url) throw new Error('CDP endpoint did not provide a browser WebSocket URL');
  }
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timed out')); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`Cannot connect to CDP endpoint ${endpoint}`)); }, { once: true });
  });
  return new CDP(socket);
}

export async function comparePage(cdp, options, beforeCSS, afterCSS, viewport) {
  let targetId = options.target, sessionId, original, styleSheetId;
  const key = `__europa_compare_${randomUUID().replaceAll('-', '')}`;
  const sheets = new Map();
  const listener = event => {
    if (event.sessionId !== sessionId) return;
    if (event.method === 'CSS.styleSheetAdded') sheets.set(event.params.header.styleSheetId, event.params.header);
    if (event.method === 'CSS.styleSheetRemoved') sheets.delete(event.params.styleSheetId);
  };
  cdp.listeners.add(listener);
  const send = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const settle = async () => {
    await evaluate('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
    await pause(options.settle);
  };
  try {
    if (targetId) {
      const { targetInfo } = await cdp.send('Target.getTargetInfo', { targetId });
      if (targetInfo.type !== 'page' || new URL(targetInfo.url).href !== options.url) throw new Error('--target must identify a page at the exact requested URL');
    } else ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');
    await send('CSS.enable');
    if (!options.target) {
      await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      const navigation = await send('Page.navigate', { url: options.url });
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    }
    const deadline = Date.now() + 15000;
    while (!await evaluate(`document.readyState !== 'loading' && !!document.querySelector(${JSON.stringify(options.waitFor)})`)) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${options.waitFor}`);
      await pause(100);
    }
    const { frameTree } = await send('Page.getFrameTree');
    await settle();
    const matching = [...sheets.values()].filter(sheet => sheet.sourceURL === options.stylesheet && sheet.frameId === frameTree.frame.id);
    if (matching.length !== 1) throw new Error(`--stylesheet must identify exactly one loaded main-frame sheet; matched ${matching.length}. Loaded URLs: ${[...sheets.values()].filter(s => s.frameId === frameTree.frame.id).map(s => s.sourceURL || '(inline)').join(', ')}`);
    styleSheetId = matching[0].styleSheetId;
    original = (await send('CSS.getStyleSheetText', { styleSheetId })).text;
    await send('CSS.setStyleSheetText', { styleSheetId, text: beforeCSS });
    await settle();
    await evaluate(`(${installCapture.toString()})(${JSON.stringify(key)}, ${JSON.stringify(options.root)})`);
    await settle();
    if (options.prime) {
      const mutationState = () => evaluate(`window[${JSON.stringify(key)}].checkMutations()`);
      const start = await mutationState();
      // Warm the same replacement path used by the measured run. Keep capture
      // and animation suppression installed throughout; do not reset the DOM
      // observer or reuse measurements from before this cycle.
      for (const text of [beforeCSS, afterCSS, beforeCSS]) {
        await send('CSS.setStyleSheetText', { styleSheetId, text });
        await settle();
      }
      const end = await mutationState();
      if (end.mutations !== start.mutations) {
        const error = new Error('DOM changed during priming; prepare a stable page state and rerun');
        error.evidence = { stage: 'priming', mutations: { before: start.mutations, after: end.mutations }, examples: end.mutationDetails ?? [] };
        throw error;
      }
    }
    const snapshot = () => evaluate(`window[${JSON.stringify(key)}].snapshot()`);
    const before = await snapshot();
    await settle();
    const baselineDrift = differences(before, await snapshot(), options.tolerance, options.ignoreCustomProperties);
    if (baselineDrift.length) throw unstable('Baseline styles or geometry are unstable; wait for a stable state and rerun', 'baseline', baselineDrift);
    await send('CSS.setStyleSheetText', { styleSheetId, text: afterCSS });
    await settle();
    const after = await snapshot();
    await settle();
    const candidateDrift = differences(after, await snapshot(), options.tolerance, options.ignoreCustomProperties);
    if (candidateDrift.length) throw unstable('Candidate styles or geometry are unstable; wait for a stable state and rerun', 'candidate', candidateDrift);
    await send('CSS.setStyleSheetText', { styleSheetId, text: beforeCSS });
    await settle();
    const returned = await snapshot();
    await settle();
    const returnDrift = differences(returned, await snapshot(), options.tolerance, options.ignoreCustomProperties);
    if (returnDrift.length) throw unstable('Returned baseline styles or geometry are unstable', 'baseline-return', returnDrift);
    const result = reproducibleChanges(before, after, returned, options.tolerance, options.ignoreCustomProperties);
    return { viewport: await evaluate('({width:innerWidth,height:innerHeight,devicePixelRatio})'), coverage: before.coverage, priming: options.prime ? 'A/B/A' : 'none', ...result,
      nonCustomChangedElements: result.changes.filter(change => change.presence || Object.keys(change.geometry).length || Object.keys(change.properties).some(name => !name.startsWith('--'))).length };
  } finally {
    const cleanup = [];
    if (original !== undefined) cleanup.push(send('CSS.setStyleSheetText', { styleSheetId, text: original }));
    if (sessionId) cleanup.push(evaluate(`window[${JSON.stringify(key)}]?.dispose()`));
    const results = await Promise.allSettled(cleanup);
    if (sessionId) await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    if (targetId && !options.target) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    cdp.listeners.delete(listener);
    if (options.target && results.some(result => result.status === 'rejected')) throw new Error('Comparison cleanup failed; reload the prepared tab to restore its stylesheet');
  }
}

export async function main(args = process.argv.slice(2)) {
  let options, cdp;
  try {
    options = parseArgs(args);
    if (options.help) { process.stdout.write(HELP); return 0; }
    const readCSS = async filename => {
      if ((await stat(filename)).size > 16 * 1024 * 1024) throw new Error(`${filename}: stylesheet exceeds 16 MiB`);
      return readFile(filename, 'utf8');
    };
    const [before, after] = await Promise.all([readCSS(options.before), readCSS(options.after)]);
    cdp = await connect(options.cdp);
    const browser = await cdp.send('Browser.getVersion');
    const results = [];
    for (const viewport of options.target ? [null] : options.viewports) results.push(await comparePage(cdp, options, before, after, viewport));
    const changedElements = results.reduce((sum, result) => sum + result.changes.length, 0);
    const discardedGeometry = results.reduce((sum, result) => sum + result.discardedGeometry.length, 0);
    const report = { version: 3, complete: discardedGeometry === 0, discardedGeometry, priming: options.prime ? 'A/B/A' : 'none', nonCustomChangedElements: results.reduce((sum, result) => sum + result.nonCustomChangedElements, 0), customProperties: options.ignoreCustomProperties ? 'ignored' : 'all', url: options.url, stylesheet: options.stylesheet, root: options.root, browser, before: options.before, after: options.after, sha256: { before: createHash('sha256').update(before).digest('hex'), after: createHash('sha256').update(after).digest('hex') }, tolerance: options.tolerance, changedElements, results,
      sampling: 'A/B/A with two stability samples per phase; non-reproducing geometry excluded', limitations: ['Current page state and selected viewports only; no selector-performance measurement', 'Animations and transitions disabled during sampling', 'Main document subtree and ::before/::after computed styles; iframe and shadow-root contents and pseudo-element boxes excluded', 'Geometry uses a pixel tolerance; computed property strings are compared exactly'] };
    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
      console.log(`${changedElements} changed element/pseudo-element samples across ${results.length} viewport(s); ${report.nonCustomChangedElements} with non-custom changes.`);
      if (options.prime) console.log('Priming: one unmeasured A/B/A swap before each measured comparison.');
      if (discardedGeometry) console.error(`${discardedGeometry} geometry differences did not reproduce after A/B/A and were excluded; comparison is incomplete. See --json for evidence.`);
      for (const result of results) for (const change of result.changes) {
        console.log(`\n${result.viewport.width}x${result.viewport.height} ${change.label}\n  ${change.selector}`);
        if (change.presence) console.log(`  pseudo-element: ${change.presence.before ? 'present' : 'absent'} -> ${change.presence.after ? 'present' : 'absent'}`);
        for (const [property, values] of Object.entries(change.geometry)) console.log(`  box.${property}: ${values.before} -> ${values.after}`);
        for (const [property, values] of Object.entries(change.properties)) console.log(`  ${property}: ${values.before} -> ${values.after}`);
      }
      console.log('\nCoverage: main-document subtree, ::before/::after styles; excludes iframe/shadow contents and animation behavior. Use --json for structured evidence.');
    }
    return discardedGeometry ? 2 : changedElements ? 1 : 0;
  } catch (error) {
    if (options?.json || args.includes('--json')) process.stdout.write(JSON.stringify({ version: 3, complete: false, priming: options?.prime ? 'A/B/A' : 'none', error: error.message, ...(error.evidence ? { evidence: error.evidence } : {}) }) + '\n');
    else { console.error(`europa compare: ${error.message}`); if (error.evidence) console.error(JSON.stringify(error.evidence, null, 2)); }
    return 2;
  } finally { cdp?.close(); }
}

if (process.argv[1] === '-' || (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)) process.exitCode = await main();
