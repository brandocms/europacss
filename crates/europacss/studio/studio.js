'use strict';
const $ = selector => document.querySelector(selector);
const editor = EuropaEditor.create($('#editor')), frame = $('#preview');
let latest, compiledSource, measuredWidth, tab = 'typography', fit = true, timer, revision = 0, filename = 'europa.json5', initialSource = '';
let projectFonts = {css:'',faces:[],warnings:[]};
let fontsDocument;
let editingPath = [], hoveredSpecimen = null;
const headings = {
  context: ['Your rules, in use.', 'Read a full paragraph. Pair a heading with body text. Give your tokens something real to do.'],
  typography: ['Type, with intention.', 'Read the scale together. Look for a rhythm that holds at every width.'],
  spacing: ['Room to breathe.', 'See the distances your tokens create, from the smallest detail to a whole section.'],
  grid: ['A place for everything.', 'Inspect your container, column widths and gutter arithmetic at the actual viewport.'],
  accessibility: ['Readable at every size.', 'Explore text scaling, contrast and the limits of your design tokens.'],
};
const accessibility = EuropaAccessibility.create({
  getContext: () => ({data:latest,source:editor.value,valid:!!latest && compiledSource===editor.value,family:$('#family').value,fonts:projectFonts,text:$('#specimen-text').value,width:Number($('#width').value)}),
  trace: (token,reveal) => {
    if(!token) {highlightEditingSource();return;}
    const found=editor.highlight(token.config_paths,{reveal});
    sourceContext(found?.path,found?.line,`${token.name} · no authored entry in this config`);
  },
});
const focused=EuropaFocused.create({editor,getContext:()=>({data:latest,valid:!!latest && compiledSource===editor.value})});
// dpx calculations use the zoom variable normally provided by @europa base.
const baseStyle = `:root{--ec-zoom:1}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#2d263a;font-family:system-ui,sans-serif}body{overflow-x:hidden}.sample{border-bottom:1px solid #eeedf2;padding:27px 32px}.sample:last-child{border:0}.sample{cursor:pointer;transition:background-color .1s}.sample.is-editing{background:#f5f1ff;box-shadow:inset 3px 0 #8a71d5}.sample.is-hovered,.sample:focus-visible{background:#eee7ff;box-shadow:inset 3px 0 #6554cf;outline:none}.label{display:flex;justify-content:space-between;gap:20px;font:11px/1.5 ui-monospace,monospace;color:#857b96;margin-bottom:18px}.name{color:#695793;font-weight:500}.value{margin:0}.type .value{overflow-wrap:anywhere}.spacing .demo{background:repeating-linear-gradient(90deg,#faf9fc 0,#faf9fc 7px,#f1eff6 7px,#f1eff6 8px);height:36px;border-radius:4px}.spacing .value{height:36px;min-width:0;background:#aca0e5;border-radius:4px}.grid{padding-left:0;padding-right:0}.grid .label{padding:0 32px}.grid .demo{display:flex;background:repeating-linear-gradient(90deg,#faf9fc 0,#faf9fc 31px,#e9e6f0 31px,#e9e6f0 32px);min-height:64px}.grid .value{min-height:64px;background:#c4bae9;border:1px solid #aa9bdc;display:flex;align-items:center}.grid .inside{height:40px;width:100%;background:#eeebfa;border:1px dashed #998bbf}.error{color:#a23f32;font:12px/1.6 system-ui;white-space:pre-wrap}.measure{font-variant-numeric:tabular-nums;text-align:right}.empty{padding:40px;color:#91869f;font:13px system-ui}`;
function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function status(text, state) { $('#status').textContent = text; $('#status').dataset.state = state; }
function inspect(id) {
  const specimen = latest?.specimens.find(s => s.id === id);
  if (!specimen) return;
  $('#token').value = id;
  const node = frame.contentDocument?.getElementById(id);
  const css = node ? frame.contentWindow.getComputedStyle(node) : null;
  const properties = ['font-family','font-size','font-weight','line-height','letter-spacing','width','max-width','padding-left','padding-right','flex-basis'];
  const computed = css ? Object.fromEntries(properties.map(p => [p, css.getPropertyValue(p)])) : {};
  $('#resolved').textContent = `Computed at ${frame.contentWindow.innerWidth}px\n${JSON.stringify(computed, null, 2)}\n\nResolved token\n${JSON.stringify(specimen.token, null, 2)}\n\nGenerated CSS\n${specimen.error || specimen.css}`;
}
const isPrefix = (prefix, path) => prefix.length <= path.length && prefix.every((key, i) => key === path[i]);
const overlaps = (a, b) => isPrefix(a, b) || isPrefix(b, a);
function matchingSpecimens() {
  if(!latest || !editingPath.length) return [];
  const general = ['dpxViewportSize', 'dpxViewportSizes', 'setMaxForVw'].includes(editingPath[0]) || [['theme','breakpoints'],['theme','extend','breakpoints'],['theme','breakpointCollections']].some(path => overlaps(path, editingPath));
  const family = [['theme','typography','families'],['theme','extend','typography','families']].some(path => isPrefix(path, editingPath));
  return latest.specimens.filter(s => general || family && s.kind === 'typography' || [...s.config_paths,...s.dependency_paths].some(path => overlaps(path, editingPath)));
}
function sourceContext(path, line, fallback = 'Hover a preview to trace its config · click to edit') {
  const text = path?.length ? `${path.join(' › ')}${line ? ` · line ${line}` : ''}` : fallback;
  $('#source-context').textContent = text; $('#source-context').title = text;
}
function highlightEditingSource() {
  const found = editor.highlight(editingPath.length ? [editingPath] : []);
  sourceContext(editingPath, found?.line);
}
function paintPreview() {
  const ids = new Set(matchingSpecimens().map(s => s.id));
  frame.contentDocument?.querySelectorAll('[data-specimen]').forEach(node => {
    node.classList.toggle('is-editing', ids.has(node.dataset.specimen));
    node.classList.toggle('is-hovered', hoveredSpecimen === node.dataset.specimen);
  });
}
function chooseTab(kind) {
  tab = kind;
  document.querySelectorAll('[data-tab]').forEach(button => {const selected=button.dataset.tab===tab;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',selected);});
}
function syncFromEditor() {
  hoveredSpecimen = null; editingPath = editor.pathAtCursor();
  const kinds = new Set(matchingSpecimens().map(s => s.kind));
  if(!['accessibility','context'].includes(tab) && kinds.size === 1 && !kinds.has(tab)) {chooseTab([...kinds][0]); render();}
  highlightEditingSource(); paintPreview();
}
function tracePreview(specimen, reveal) {
  hoveredSpecimen = reveal ? null : specimen.id;
  const found = editor.highlight(specimen.config_paths, {reveal});
  sourceContext(found?.path, found?.line, `${specimen.name} · no authored entry in this config`);
  inspect(specimen.id); paintPreview();
  if(reveal) focused.show(specimen);
}
function linkPreview(node, specimen) {
  node.dataset.specimen=specimen.id;node.tabIndex=0;
  node.setAttribute('role','button');node.setAttribute('aria-label',`Edit ${specimen.name} configuration`);
  node.addEventListener('pointerenter',()=>tracePreview(specimen,false));
  node.addEventListener('pointerleave',()=>{if(hoveredSpecimen===specimen.id){hoveredSpecimen=null;highlightEditingSource();paintPreview();}});
  node.addEventListener('click',()=>tracePreview(specimen,true));
  node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();tracePreview(specimen,true);}});
}
// WebKit needs allow-scripts for parent-installed event listeners in the iframe.
// Its own CSP still blocks scripts; all specimen content is created as text/DOM.
function render() {
  if (!latest || !frame.contentDocument?.body) return;
  const auditing=tab==='accessibility';
  $('#accessibility').hidden=!auditing;
  $('#context-controls').hidden=tab!=='context';
  for(const selector of ['.preview-shell','.preview-caption','.inspector','#notes','#fit']) $(selector).hidden=auditing;
  $('#heading').textContent = headings[tab][0]; $('#description').textContent = headings[tab][1];
  $('.specimen-controls').hidden = tab !== 'typography' && !auditing;
  if(auditing) {$('#count').textContent='WCAG 2.2';return;}
  const doc = frame.contentDocument;
  doc.head.querySelectorAll('style:not(#project-fonts)').forEach(s => s.remove());
  const style = element(doc, 'style');
  style.textContent = baseStyle + (tab==='context'?EuropaSpecimens.style:'') + '\n' + latest.root_css + '\n' + (latest.families.find(([name]) => name === $('#family').value)?.[1] || '') + '\n' + latest.css + (tab==='context'?latest.specimens.map(s=>s.context_css).join('\n'):'');
  doc.head.append(style);
  doc.body.replaceChildren();
  if(tab==='context') {
    EuropaSpecimens.render({doc,data:latest,element,link:linkPreview});
    $('#count').textContent='Article + cards';$('#notes').textContent=latest.notes.join(' ');
    $('.inspector').hidden=true;paintPreview();loadFonts();layout();return;
  }
  const items = latest.specimens.filter(s => s.kind === tab);
  $('#count').textContent = `${items.length} ${tab === 'grid' ? 'specimens' : 'tokens'}`;
  $('#heading').textContent = headings[tab][0]; $('#description').textContent = headings[tab][1];
  $('.specimen-controls').hidden = tab !== 'typography';
  $('#token').replaceChildren();
  for (const s of items) {
    const sample = element(doc, 'section', `sample ${tab === 'typography' ? 'type' : tab}`);
    const label = element(doc, 'div', 'label');
    label.append(element(doc, 'span', 'name', s.name), element(doc, 'span', 'measure', '—'));
    sample.append(label);
    if (s.error) sample.append(element(doc, 'p', 'error', s.error));
    else {
      const value = element(doc, tab === 'typography' ? 'p' : 'div', 'value', tab === 'typography' ? $('#specimen-text').value : undefined);
      value.id = s.id;
      if (tab === 'grid' && s.name === 'container') value.append(element(doc, 'div', 'inside'));
      if (tab === 'typography') sample.append(value);
      else { const demo = element(doc, 'div', 'demo'); demo.append(value); sample.append(demo); }
    }
    linkPreview(sample,s);
    doc.body.append(sample);
    const option = element(document, 'option', null, s.name); option.value = s.id; $('#token').append(option);
  }
  if (!items.length) doc.body.append(element(doc, 'p', 'empty', 'No tokens in this category yet. Add some in the JSON5 editor.'));
  inspect(items[0]?.id);
  paintPreview();
  $('#notes').textContent = latest.notes.join(' ');
  loadFonts();
  layout();
}
function layout() {
  if (!latest || !frame.contentDocument?.body) return;
  const width = Math.max(280, Math.min(2400, Number($('#width').value) || 1200));
  if(measuredWidth!==width) {measuredWidth=width;accessibility.invalidate();}
  $('#width').value = width; $('#slider').value = width; frame.style.width = `${width}px`;
  const active = [...latest.breakpoints].reverse().find(([,px]) => width >= px);
  $('#active').textContent = active ? `${active[0]} · ${width}px viewport` : `${width}px viewport`;
  $('#breakpoints').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.name === active?.[0]));
  requestAnimationFrame(() => {
    const doc = frame.contentDocument;
    for (const specimen of latest.specimens.filter(s => s.kind === tab && !s.error)) {
      const value = doc.getElementById(specimen.id); if (!value) continue;
      const css = frame.contentWindow.getComputedStyle(value);
      const px = n => `${Math.round(n * 100) / 100}px`;
      value.closest('.sample').querySelector('.measure').textContent = tab === 'typography'
        ? `${css.fontSize} / ${css.lineHeight} · ${css.fontWeight}`
        : tab === 'spacing' ? px(value.getBoundingClientRect().width)
        : `${px(value.getBoundingClientRect().width)}${specimen.name === 'container' ? ` · inset ${css.paddingLeft}` : ''}`;
    }
    if(tab==='context') EuropaSpecimens.measure(doc);
    frame.style.height = '200px';
    frame.style.height = `${doc.body.scrollHeight}px`;
    const ratio = fit ? Math.min(1, $('.preview-shell').clientWidth / width) : 1;
    frame.style.transform = `scale(${ratio})`;
    $('#stage').style.width = `${width * ratio}px`;
    $('#stage').style.height = `${doc.body.scrollHeight * ratio}px`;
    inspect($('#token').value);
    $('#scale').textContent = ratio < 1 ? `${Math.round(ratio * 100)}% view · measurements at full size` : '100% view';
  });
}
async function compile() {
  clearTimeout(timer);
  const source=editor.value;
  const current = ++revision;
  compiledSource=undefined;accessibility.invalidate('Compiling the current configuration…');accessibility.colorPairs();
  status('Compiling…', 'loading'); $('#export').disabled = true;
  try {
    const response = await fetch('/api/preview', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({source}) });
    const data = await response.json();
    if (current !== revision) return;
    if (!response.ok) throw Error(data.error || 'Preview failed');
    const hadPreview = !!latest;
    latest = data; compiledSource=source;
    EuropaSpecimens.controls(data); hoveredSpecimen = null;
    const family = $('#family').value;
    $('#family').replaceChildren(element(document, 'option', null, 'System default'));
    $('#family').firstChild.value = '';
    for (const [name] of data.families) {
      const option = element(document, 'option', null, name); option.value = name; $('#family').append(option);
    }
    $('#family').value = (hadPreview && family === '' || data.families.some(([name]) => name === family)) ? family : (data.families.find(([name]) => name === 'main')?.[0] || data.families[0]?.[0] || '');
    const errors = data.specimens.filter(s => s.error);
    $('#errors').hidden = !errors.length;
    $('#errors').textContent = errors.length ? `${errors.length} specimen${errors.length === 1 ? '' : 's'} could not compile. See the affected cards for details.` : '';
    status(errors.length ? 'Review specimen errors' : 'Preview up to date', errors.length ? 'error' : 'ready');
    $('#export').disabled = errors.length > 0;
    $('#breakpoints').replaceChildren();
    for (const [name, px] of data.breakpoints) {
      const button = element(document, 'button', null, `${name} ${px}px`); button.dataset.name = name;
      button.addEventListener('click', () => { $('#width').value = px === 0 ? 375 : Math.max(280, px); layout(); });
      $('#breakpoints').append(button);
    }
    syncFromEditor();
    render();
    accessibility.update();
  } catch(error) {
    if (current !== revision) return;
    status('Config needs attention', 'error'); $('#errors').hidden = false;
    $('#errors').textContent = `${error.message}\n\nThe preview below still shows the last successfully compiled config.`;
    accessibility.invalidate('Fix the configuration before running checks.');accessibility.colorPairs();
  }
}
async function loadFonts() {
  const doc = frame.contentDocument;
  if (!doc?.body || fontsDocument === doc) return;
  fontsDocument = doc;
  $('#font-info').textContent = projectFonts.faces.length
    ? `${projectFonts.faces.map(face => `${face.family} · ${face.weight} · ${face.style}`).join('\n')}\n\n${projectFonts.warnings.join('\n')}`
    : 'To load your project fonts, start Europa Studio with --config /path/to/europa.json5. It finds css/includes/fonts.css and public beside the config. Other layouts: --fonts /path/to/fonts.css --public-dir /path/to/public. Font files stay on your computer.' + (projectFonts.warnings.length ? '\n\n' + projectFonts.warnings.join('\n') : '');
  if (!projectFonts.faces.length) {
    $('#font-status').textContent = 'System fonts only · connect project fonts below';
    return;
  }
  $('#font-status').textContent = 'Loading project fonts…';
  const style = element(doc, 'style'); style.id = 'project-fonts'; style.textContent = projectFonts.css; doc.head.append(style);
  const loaded = await Promise.allSettled(projectFonts.faces.map(face => doc.fonts.load(`${face.style.split(' ').slice(0,2).join(' ')} ${face.weight.split(' ')[0]} 16px ${face.family}`)));
  const failed = loaded.filter(result => result.status === 'rejected').length;
  const count = [...doc.fonts].filter(face => face.status === 'loaded').length;
  $('#font-status').textContent = `${count} project font face${count === 1 ? '' : 's'} loaded${failed ? ` · ${failed} failed; fallback in use` : ''}${projectFonts.warnings.length ? ' · see font notes' : ''}`;
  if (failed) $('#font-info').textContent += '\n\nSome files could not be decoded by this browser; fallback fonts will be used.';
  layout();
}
// Editor presentation never changes the source text or its original line breaks.
const main = $('main'), divider = $('#divider');
let editorWidth = 420;
function resizeEditor(width) {
  editorWidth = Math.round(Math.max(320, Math.min(Math.max(320, innerWidth * .6), width)));
  main.style.setProperty('--editor-width', `${editorWidth}px`);
  divider.setAttribute('aria-valuenow', editorWidth);
  divider.setAttribute('aria-valuemax', Math.round(Math.max(320, innerWidth * .6)));
  layout();
}
$('#wrap').addEventListener('click', () => {
  const wrap = editor.wrap !== 'soft';
  editor.wrap = wrap ? 'soft' : 'off'; $('#wrap').setAttribute('aria-pressed', wrap);
});
function expandEditor(expanded) {
  main.classList.toggle('expanded', expanded);
  $('#expand').setAttribute('aria-pressed', expanded);
  $('#expand').textContent = expanded ? 'Back to preview ↙' : 'Expand editor ↗';
  layout();
}
$('#expand').addEventListener('click', () => expandEditor(!main.classList.contains('expanded')));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && main.classList.contains('expanded')) { expandEditor(false); $('#expand').focus(); } });
divider.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); divider.setPointerCapture(event.pointerId); document.body.classList.add('resizing');
});
divider.addEventListener('pointermove', event => { if (divider.hasPointerCapture(event.pointerId)) resizeEditor(event.clientX); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(name, event => {
  if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizing');
});
divider.addEventListener('dblclick', () => resizeEditor(420));
divider.addEventListener('keydown', event => {
  if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    resizeEditor(event.key === 'Home' ? 320 : event.key === 'End' ? innerWidth * .6 : editorWidth + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 80 : 20));
  }
});
window.addEventListener('resize', () => resizeEditor(editorWidth));
resizeEditor(editorWidth);
editor.addEventListener('cursorchange', syncFromEditor);
editor.addEventListener('input', () => { focused.invalidate(); ++revision; accessibility.invalidate('Uncompiled edits. Waiting for the compiler…');accessibility.colorPairs(); $('#export').disabled = true; status('Uncompiled edits', 'loading'); clearTimeout(timer); timer = setTimeout(compile, 400); });
editor.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); compile(); } });
$('#compile').addEventListener('click', compile);
$('#width').addEventListener('input', layout);
$('#slider').addEventListener('input', event => { $('#width').value = event.target.value; layout(); });
$('#fit').addEventListener('click', () => { fit = !fit; $('#fit').setAttribute('aria-pressed', fit); layout(); });
$('#specimen-text').addEventListener('input', () => {accessibility.invalidate();render();});
$('#family').addEventListener('change', () => {accessibility.invalidate();render();});
$('#token').addEventListener('change', event => {inspect(event.target.value);const token=latest?.specimens.find(s=>s.id===event.target.value);if(token)focused.show(token);});
$('#context-controls').addEventListener('change',render);
$('.tabs').addEventListener('click', event => {
  if (!event.target.dataset.tab) return;
  chooseTab(event.target.dataset.tab);
  render();
});
$('#export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([editor.value], {type:'application/json5'}));
  const link = element(document, 'a'); link.href = url; link.download = filename.replace(/\.json$/, '.json5'); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#load').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 1024 * 1024) { status('File exceeds 1 MiB', 'error'); return; }
  if (editor.value !== initialSource && !confirm('Open another config? Export first if you want to keep your current edits.')) return;
  editor.value = await file.text(); initialSource = editor.value;
  filename = file.name; $('#filename').textContent = filename; compile(); event.target.value = '';
});
window.addEventListener('beforeunload', event => { if (editor.value !== initialSource) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', layout);
frame.addEventListener('load', render);
(async () => {
  try {
    projectFonts = await (await fetch('/api/fonts')).json();
    const response = await fetch('/api/config'); if (!response.ok) throw Error('Could not load the initial config');
    const data = await response.json(); editor.value = data.source; initialSource = data.source; filename = data.name; $('#filename').textContent = filename;
    await compile();
  } catch(error) { status('Could not open workspace', 'error'); $('#errors').hidden = false; $('#errors').textContent = error.message; }
})();
