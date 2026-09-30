(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const inline = text => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  let workspace, selected, decisions = new Map(), filter = 'all', busy = false, plan = null, dirty = false;
  const categories = {
    EU_MIGRATION_ORDER: 'Declaration order', EU_MIGRATION_SPECIFICITY: 'Nesting specificity',
    EU_MIGRATION_MATCHING: 'Selector matching', EU_MIGRATION_BREAKPOINT: 'Breakpoint boundaries',
    EU_MIGRATION_BUNDLE_ORDER: 'Bundle placement', EU_MIGRATION_SIZE: 'Responsive sizing',
    EU_MIGRATION_COLUMN_SIGN: 'Negative column offsets', EU_MIGRATION_LEGACY6: 'Legacy behavior',
    EU_MIGRATION_LEGACY11: 'Legacy behavior', EU_MIGRATION_INCOMPLETE: 'Analysis needs attention',
    EU_LEGACY_SUFFIX: 'Selector syntax',
  };
  const category = item => categories[item.code] || 'Syntax & compatibility';
  const findings = item => item.indices.map(i => workspace.report.findings[i]);
  const choice = item => decisions.get(item.id);
  const isDecided = item => ['fix', 'accept'].includes(choice(item));
  const properties = item => [...new Set(item.comparisons.flatMap(s => s.values.map(pair => pair[1].split(':')[0].trim())))];
  function title(item) {
    if (item.code === 'EU_MIGRATION_ORDER') {
      const props = properties(item);
      const families = [...new Set(props.map(p => p.replace(/-(top|right|bottom|left)$/, '')))];
      return `${families.length === 1 ? families[0] : 'Declarations'} in source order`;
    }
    return category(item);
  }
  const icon = '<svg width="13" height="15" viewBox="0 0 16 18" fill="none" aria-hidden="true"><path d="M9 1H2v16h12V6L9 1Z" stroke="currentColor"/><path d="M9 1v5h5M5 10h6M5 13h4" stroke="currentColor"/></svg>';
  const storageKey = () => `europa-migration:${workspace.entry}:${workspace.report.snapshot}`;
  function message(id, text) {
    $(id).textContent = text;
    $(id).hidden = !text;
  }
  function announce(text) { $('announcer').textContent = text; }
  async function api(path, body) {
    const response = await fetch(`/api/migration${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The migration request could not finish.');
    return data;
  }
  const selection = () => ({ snapshot: workspace.report.snapshot, decisions: [...decisions].map(([id, choice]) => ({id, choice})) });
  function remember() {
    try { localStorage.setItem(storageKey(), JSON.stringify(selection())); } catch (_) { /* Export remains available. */ }
  }
  function validDecisions(list) {
    if (!Array.isArray(list)) throw new Error('This file does not contain Studio review decisions.');
    const result = new Map();
    for (const decision of list) {
      const item = workspace.items.find(item => item.id === decision.id);
      if (!item || result.has(item.id) || !['fix','accept','later'].includes(decision.choice)
          || (decision.choice === 'fix' && !item.can_fix) || (decision.choice === 'accept' && !item.can_accept)) {
        throw new Error('A decision does not match this analysis. Refresh the checks and review the item again.');
      }
      result.set(item.id, decision.choice);
    }
    return result;
  }
  function setWorkspace(data, restore = false) {
    workspace = data;
    decisions = new Map();
    plan = null;
    dirty = false;
    if (restore) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey()));
        if (saved?.snapshot === data.report.snapshot) decisions = validDecisions(saved.decisions);
      } catch (_) { /* Invalid browser storage must not block review. */ }
    }
    const files = [...new Set(data.items.map(item => item.path))];
    $('file-filter').innerHTML = '<option value="">All source files</option>' + files.map(file => `<option>${esc(file)}</option>`).join('');
    $('search').value = '';
    filter = 'all';
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', button.dataset.filter === filter));
    selected = data.items[0]?.id;
    // Start with a concrete proposed edit when opening a new review.
    if (!decisions.size) selected = data.items.find(item => item.can_fix)?.id ?? selected;
    $('review').hidden = false;
    $('progress-card').hidden = false;
    $('project-line').innerHTML = `<span class="project-name">${esc(data.project || data.entry_label)}</span><span aria-hidden="true">/</span><span>${esc(data.entry_label)}</span><span class="version">${esc(data.report.from)}</span><span aria-hidden="true">→</span><span>Native Europa</span>`;
    document.title = `${data.project || 'Migration'} · Europa Studio`;
    $('item-count').textContent = data.items.length;
    $('proposal-count').textContent = uniqueEdits(data.items).length;
    $('file-count').textContent = data.report.files.length;
    $('analysis-status').textContent = data.report.analysis_complete ? '● Analysis complete' : '◌ Analysis incomplete';
    $('analysis-status').style.color = data.report.analysis_complete ? '' : '#9b6d43';
    if (!data.report.analysis_complete) message('notice', 'The analysis is incomplete. Resolve the reported syntax or analysis issues first. Supported syntax rewrites can still be reviewed; appearance decisions stay unavailable.');
    render();
  }
  async function load({ fresh = false } = {}) {
    if (busy) return;
    busy = true; renderBusy();
    $('loading').hidden = false;
    message('error', '');
    message('notice', '');
    try {
      const data = await api('');
      if (data.enabled === false) { $('start').hidden = false; $('project-line').textContent = 'A workspace for deliberate migrations.'; return; }
      setWorkspace(data, !fresh);
      if (fresh) { remember(); if (data.report.analysis_complete) message('notice', 'Analysis refreshed. Review the current source before making new decisions.'); }
    } catch (error) {
      message('error', error.message);
      if (!workspace) {
        $('start').hidden = false;
        $('start').innerHTML = '<h2>Let’s resolve the first issue.</h2><p>The analyzer could not read this project yet. Correct the source or configuration described above, then try again.</p><button id="retry">Retry analysis</button>';
        $('retry').onclick = () => { $('start').hidden = true; load(); };
      }
    } finally { busy = false; $('loading').hidden = true; renderBusy(); }
  }
  function visibleItems() {
    const query = $('search').value.trim().toLowerCase();
    const file = $('file-filter').value;
    return workspace.items.filter(item => (!file || item.path === file)
      && (filter === 'all' || (filter === 'edits' ? item.can_fix : filter === 'decided' ? isDecided(item) : !isDecided(item)))
      && (!query || `${item.path} ${category(item)} ${title(item)} ${findings(item).map(f => f.message).join(' ')} ${item.context.map(line => line.text).join(' ')}`.toLowerCase().includes(query)));
  }
  function uniqueEdits(items) {
    return [...new Map(items.flatMap(item => item.fixes.flatMap(fix => fix.edits)).map(edit => [JSON.stringify(edit), edit])).values()];
  }
  function renderBusy() {
    $('save-review').disabled = busy || !workspace;
    $('open-review').disabled = busy;
    $('refresh').disabled = busy;
    $('preview-edits').disabled = busy || !workspace || !workspace.items.some(item => choice(item) === 'fix');
    $('apply-edits').disabled = busy || !plan;
    $('save-before-apply').disabled = busy;
    $('cancel-apply').disabled = busy;
    $('close-dialog').disabled = busy;
  }
  function renderSummary() {
    const decided = workspace.items.filter(isDecided).length;
    const chosen = workspace.items.filter(item => choice(item) === 'fix');
    const kept = workspace.items.filter(item => choice(item) === 'accept').length;
    const edits = uniqueEdits(chosen);
    $('progress').max = Math.max(1, workspace.items.length);
    $('progress').value = decided;
    $('progress-label').textContent = `${decided} of ${workspace.items.length} decisions`;
    $('progress-note').textContent = decided ? `${count(workspace.items.length - decided, 'item')} still to review` : 'Take it one change at a time.';
    document.querySelector('.review-bar').classList.toggle('has-edits', edits.length > 0);
    $('selection-summary').textContent = edits.length ? `${count(edits.length, 'edit')} selected · ${count(new Set(edits.map(e => e.path)).size, 'file')}` : 'No edits selected';
    $('selection-note').textContent = kept ? `${count(kept, 'decision')} to keep the new behavior. Save your review to retain them.` : 'Your CSS stays untouched while you review.';
    renderBusy();
  }
  function renderQueue(items) {
    $('filtered-count').textContent = `${items.length} / ${workspace.items.length}`;
    $('queue').innerHTML = items.length ? items.map(item => {
      const decision = choice(item);
      const state = decision === 'fix' ? 'Edit selected' : decision === 'accept' ? 'New behavior kept' : decision === 'later' ? 'Review later' : item.can_fix ? 'Proposed edit' : item.can_accept ? 'Review behavior' : 'Manual attention';
      return `<button class="queue-item" data-id="${item.id}" aria-current="${item.id === selected}" aria-label="${esc(item.path)}, line ${item.line}, ${esc(category(item))}, ${state}"><span><span class="queue-file">${esc(item.path.split('/').pop())}</span><span class="queue-line">:${item.line}</span></span><strong class="queue-title">${esc(title(item))}</strong><span class="queue-meta" data-choice="${decision || ''}"><span><i class="status-dot" aria-hidden="true"></i>${state}</span><span>${item.indices.length > 1 ? count(item.indices.length, 'finding') : ''}</span></span></button>`;
    }).join('') : '<p class="queue-empty">No items match this view.</p>';
    const active = $('queue').querySelector('[aria-current=true]');
    if (active) {
      const row = active.getBoundingClientRect(), container = $('queue').getBoundingClientRect();
      if (row.top < container.top || row.bottom > container.bottom) $('queue').scrollTop += row.top - container.top - container.height / 2 + row.height / 2;
    }
  }
  function code(text) {
    const pattern = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[\w-]+|\b\d+(?:\.\d+)?(?:px|dpx|rem|em|vw|vh|%)?|--[\w-]+|[\w-]+(?=\s*:)/g;
    let html = '', at = 0;
    for (const match of text.matchAll(pattern)) {
      const token = match[0];
      const type = token.startsWith('/*') ? 'comment' : token.startsWith('@') ? 'directive' : /^['"]/.test(token) ? 'string' : /^\d/.test(token) ? 'value' : 'property';
      html += esc(text.slice(at, match.index)) + `<span class="token-${type}">${esc(token)}</span>`;
      at = match.index + token.length;
    }
    return html + esc(text.slice(at));
  }
  function lines(text, start) {
    return text.replace(/\r\n?|\f/g, '\n').split('\n').map((text, index) => `<span class="code-row"><span class="line-number" aria-hidden="true">${start + index}</span><span class="code-text">${code(text) || ' '}</span></span>`).join('');
  }
  function diff(edit) {
    return `<div class="diff"><div class="diff-pane"><div class="diff-heading"><span>− Before</span><span>Current source</span></div><pre class="code-lines" tabindex="0" aria-label="Before edit">${lines(edit.before, edit.line)}</pre></div><div class="diff-pane"><div class="diff-heading"><span>+ After</span><span>Proposed source</span></div><pre class="code-lines" tabindex="0" aria-label="After edit">${lines(edit.after, edit.line)}</pre></div></div>`;
  }
  const scope = conditions => conditions.length ? conditions.map(condition => `<code>${esc(condition)}</code>`).join(' ') : '<span>all widths in this rule</span>';
  function evidence(item) {
    if (!item.comparisons.length) return '';
    return `<details class="evidence" ${item.fixes.length ? '' : 'open'}><summary>${count(item.indices.length, 'comparison')} · inspect properties and conditions</summary><p class="edit-caption">These are potential ordering conflicts. The surrounding cascade can affect which value wins.</p>${item.comparisons.map(section => `<section class="comparison"><div class="comparison-origin">Earlier ${esc(section.label)} · ${esc(section.path)}:${section.source.line}${section.selectors.length ? `<br>${esc(section.selectors.join(' → '))}` : ''}</div><div class="comparison-scopes">${section.conditions.map(([earlier, later]) => JSON.stringify(earlier) === JSON.stringify(later) ? `<span>Within ${scope(earlier)}</span>` : `<span>Earlier: ${scope(earlier)}<br>Later: ${scope(later)}</span>`).join('')}</div><table class="value-table"><thead><tr><th>Earlier output</th><th>Later authored output</th></tr></thead><tbody>${section.values.map(([old, next]) => `<tr><td>${esc(old)}</td><td>${esc(next)}</td></tr>`).join('')}</tbody></table></section>`).join('')}</details>`;
  }
  function explanation(item) {
    if (item.code === 'EU_MIGRATION_ORDER') return 'Older Europa could let earlier generated or responsive styles override a later declaration. Native expansion follows your authored order. Choose which intention to keep.';
    if (item.code === 'EU_MIGRATION_SPECIFICITY') return 'Native CSS nesting can give these selectors more weight. That can change which rule wins when styles overlap. Review surrounding overrides before keeping the new behavior.';
    if (item.code === 'EU_MIGRATION_BREAKPOINT') return 'Named breakpoint ranges now meet without the old one-pixel gap. Fractional widths just below a boundary stay in the preceding range.';
    if (item.code === 'EU_MIGRATION_COLUMN_SIGN') return 'Negative column fractions retain the old formula: the sign applies to the column count. Negating the whole gutter-adjusted width is a different operation. Confirm which one you intend.';
    if (item.code === 'EU_MIGRATION_MATCHING') return 'Native nesting can match a different set of elements. Check the affected selectors on your pages before keeping the new behavior.';
    if (item.code === 'EU_MIGRATION_INCOMPLETE') return 'The analyzer needs this issue resolved before it can finish comparing the old and new behavior.';
    if (item.fixes.some(fix => fix.kind === 'syntax')) return 'This legacy syntax needs an explicit CSS selector. Review the proposed rewrite, including its surrounding scope.';
    return 'The native compiler handles this rule differently. Review the details below and check its use on your site.';
  }
  function renderDetail(items) {
    const item = items.find(item => item.id === selected);
    if (!item) {
      $('detail').innerHTML = `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">${workspace.items.length ? '✓' : '↗'}</span><h2>${workspace.items.length ? 'A little breathing room.' : 'The listed checks are clear.'}</h2><p>${workspace.items.length ? 'No changes remain in this view. Switch filters to revisit a decision or inspect another source file.' : 'No migration findings remain in this analysis. Compare your rendered pages and interactions before shipping.'}</p>${workspace.items.length ? '<button id="show-all">Show all changes</button>' : ''}</div>`;
      $('show-all')?.addEventListener('click', () => { filter = 'all'; $('search').value = ''; $('file-filter').value = ''; render(); });
      return;
    }
    const decision = choice(item);
    const syntax = item.fixes.some(fix => fix.kind === 'syntax');
    const fixes = item.fixes.flatMap(fix => fix.edits);
    const partial = item.fixable < item.indices.length;
    const signedOffset = item.code === 'EU_MIGRATION_COLUMN_SIGN';
    const index = items.indexOf(item);
    const specific = item.code === 'EU_MIGRATION_ORDER' ? '' : findings(item).map(finding => `<p class="finding-message">${inline(finding.message)}</p>`).join('');
    const help = [...new Set(findings(item).map(finding => finding.help))].map(text => text.replace(/When a proposal is available,.*$/, '').replace(/ --fix[^.]*\./g, '').trim()).join(' ');
    const source = `<details class="source-details" ${fixes.length ? '' : 'open'}><summary>Surrounding source · line ${item.line}</summary><div class="source-block"><pre class="code-lines" tabindex="0" aria-label="Source context">${item.context.map(line => `<span class="code-row ${line.focus ? 'focus' : ''}"><span class="line-number" aria-hidden="true">${line.number}</span><span class="code-text">${code(line.text) || ' '}</span></span>`).join('')}</pre></div></details>`;
    $('detail').innerHTML = `<article class="issue-card"><header class="issue-heading"><div class="issue-meta"><span class="category"><span class="category-dot" aria-hidden="true"></span>${esc(category(item))}</span><span>${count(item.indices.length, 'finding')} · one review item</span></div><h2>${esc(title(item))}</h2><p>${esc(explanation(item))}</p><div class="source-location">${icon}<span>${esc(item.path)}</span><span class="line-tag">L${item.line}:${item.column}</span></div></header><div class="issue-body">${specific}${fixes.length ? `<h3 class="section-label">${syntax ? 'Proposed syntax rewrite' : 'To preserve the earlier override'}<span>${count(fixes.length, 'source edit')}</span></h3>${fixes.map(diff).join('')}<p class="edit-caption">${partial ? `Edits are proposed for ${item.fixable} of ${item.indices.length} findings here. The remaining conflicts still need review. ` : ''}${syntax ? 'The rewrite retains the existing scope and declaration order.' : 'This moves the fallback before the directive. Review every affected property and viewport on your site.'}</p>` : `<div class="manual-note"><span aria-hidden="true">↗</span><div><strong>${signedOffset ? 'The legacy formula is already preserved.' : item.can_accept ? 'Preserving the old behavior needs a manual edit.' : 'Resolve this in your source.'}</strong><p>${inline(help)}</p></div></div>`}${source}${evidence(item)}</div><section class="choice-area" aria-label="Review decision"><p class="choice-label">What would you like to keep?</p><div class="choices"><button class="choice" data-choice="fix" aria-pressed="${decision === 'fix'}" ${item.can_fix ? '' : 'disabled'}><span class="choice-marker" aria-hidden="true">✓</span><span><strong>${syntax ? 'Use the syntax rewrite' : 'Preserve old appearance'}</strong><small>${item.can_fix ? (partial ? 'Select the available edits; other conflicts remain.' : 'Select the proposed source edit above.') : item.fixes.length ? 'Complete the analysis before selecting this edit.' : 'No automatic edit is available for this item.'}</small></span></button><button class="choice" data-choice="accept" aria-pressed="${decision === 'accept'}" ${item.can_accept ? '' : 'disabled'}><span class="choice-marker" aria-hidden="true">✓</span><span><strong>${signedOffset ? 'Keep signed-column behavior' : 'Keep the new behavior'}</strong><small>${item.can_accept ? (signedOffset ? 'Acknowledge the existing formula. No edit is needed.' : 'Accept these changes. Leave the source as written.') : 'Resolve syntax and complete analysis before accepting.'}</small></span></button></div><div class="decision-status"><span>${decision === 'fix' ? '✓ Edit selected. Nothing has been written yet.' : decision === 'accept' ? (signedOffset ? '✓ Existing offset formula marked as intentional.' : '✓ New behavior marked as intentional.') : decision === 'later' ? 'Set aside. This item still needs review.' : 'No decision yet.'}</span><button data-choice="later" aria-pressed="${decision === 'later'}">Review later</button></div></section><footer class="issue-navigation"><button data-step="-1" ${index === 0 ? 'disabled' : ''}>← Previous</button><span>${index + 1} / ${items.length}</span><button data-step="1" ${index === items.length - 1 ? 'disabled' : ''}>Next change →</button></footer></article>`;
  }
  function render() {
    if (!workspace) return;
    const items = visibleItems();
    if (!items.some(item => item.id === selected)) selected = items[0]?.id;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', button.dataset.filter === filter));
    renderQueue(items); renderDetail(items); renderSummary();
  }
  $('queue').addEventListener('click', event => {
    const button = event.target.closest('[data-id]');
    if (!button || busy) return;
    selected = Number(button.dataset.id);
    render();
    $('detail').focus({preventScroll:true});
  });
  $('detail').addEventListener('click', event => {
    if (busy) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.choice) {
      const value = button.dataset.choice;
      const cleared = decisions.get(selected) === value;
      if (cleared) decisions.delete(selected); else decisions.set(selected, value);
      dirty = true; remember();
      // Keep the current item visible while choosing in the "To review" filter.
      const items = visibleItems();
      const current = workspace.items.find(item => item.id === selected);
      if (!items.some(item => item.id === selected)) { items.push(current); items.sort((a,b) => a.id - b.id); }
      renderQueue(visibleItems()); renderDetail(items); renderSummary();
      $('detail').querySelector(`[data-choice="${value}"]`)?.focus({preventScroll:true});
      announce(cleared ? 'Decision cleared.' : value === 'fix' ? 'Edit selected for review.' : value === 'accept' ? 'New behavior marked as intentional.' : 'Item set aside for later.');
    } else if (button.dataset.step) {
      const items = visibleItems();
      const index = items.findIndex(item => item.id === selected);
      const step = Number(button.dataset.step);
      const next = index < 0 ? (step > 0 ? items.find(item => item.id > selected) : [...items].reverse().find(item => item.id < selected)) : items[index + step];
      if (next) { selected = next.id; render(); $('detail').focus({preventScroll:true}); }
    }
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; render(); });
  $('search').oninput = render;
  $('file-filter').onchange = render;
  $('refresh').onclick = () => {
    if (decisions.size && !confirm('Refresh the analysis and clear these review choices? Save your review first if you want a copy.')) return;
    load({fresh:true});
  };
  async function save() {
    if (busy || !workspace) return;
    busy = true; renderBusy();
    try {
      const data = await api('/export', selection());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], {type:'application/json'}));
      const link = document.createElement('a');
      link.href = url; link.download = `${workspace.project || 'europa'}-migration-review.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      dirty = false;
      announce('Review saved. Reopen it with Open review to continue later.');
    } catch (error) {
      if ($('apply-dialog').open) { $('apply-dialog').close(); plan = null; }
      message('error', error.message);
    } finally { busy = false; renderBusy(); }
  }
  $('save-review').onclick = save;
  $('save-before-apply').onclick = save;
  $('open-review').onclick = () => $('review-file').click();
  $('review-file').onchange = async () => {
    const file = $('review-file').files[0];
    $('review-file').value = '';
    if (!file) return;
    try {
      if (!workspace) throw new Error('Open a project migration first, then reopen its saved review.');
      if (file.size > 16 * 1024 * 1024) throw new Error('Review files are limited to 16 MiB.');
      const data = JSON.parse(await file.text());
      if (data.snapshot !== workspace.report.snapshot || data.report_version !== workspace.report.report_version || data.from !== workspace.report.from) throw new Error('This review belongs to different or older source/configuration. Refresh the analysis and review the current files.');
      if (data.studio_review?.version !== 1) throw new Error('Choose a review saved by Migration Studio.');
      const restored = validDecisions(data.studio_review.decisions);
      decisions = restored; dirty = false; remember(); render();
      message('error', ''); message('notice', `Reopened ${count(decisions.size, 'decision')} from ${file.name}. Your CSS is unchanged.`);
    } catch (error) { message('error', error.message); }
  };
  $('preview-edits').onclick = async () => {
    if (busy) return;
    busy = true; renderBusy(); message('error', '');
    $('preview-edits').textContent = 'Preparing preview…';
    try {
      plan = await api('/prepare', selection());
      $('apply-title').textContent = `${count(plan.edit_count, 'edit')}. Your call.`;
      $('apply-description').textContent = `Review the exact changes to ${count(plan.files.length, 'source file')} before applying.`;
      $('plan-files').innerHTML = plan.files.map(file => `<section class="plan-file"><h3>${esc(file.path)}</h3>${file.edits.map(diff).join('')}</section>`).join('');
      $('apply-edits').textContent = `Apply ${count(plan.edit_count, 'edit')}`;
      $('apply-dialog').showModal();
    } catch (error) { message('error', error.message); }
    finally { busy = false; $('preview-edits').innerHTML = 'Review selected edits <span aria-hidden="true">→</span>'; renderBusy(); }
  };
  $('close-dialog').onclick = $('cancel-apply').onclick = () => $('apply-dialog').close();
  $('apply-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('apply-edits').onclick = async () => {
    if (busy || !plan) return;
    busy = true; renderBusy();
    $('apply-edits').textContent = 'Applying edits…';
    try {
      const result = await api('/apply', {token:plan.token});
      try { localStorage.removeItem(storageKey()); } catch (_) {}
      decisions.clear(); dirty = false;
      $('apply-dialog').close();
      if (result.workspace) {
        message('error', ''); message('notice', '');
        setWorkspace(result.workspace);
        message('notice', `Updated ${count(result.written, 'source file')} and reran the checks. ${count(workspace.items.length, 'review item')} ${workspace.items.length === 1 ? 'remains' : 'remain'}. ${workspace.report.analysis_complete ? 'Review the fresh result and compare your rendered pages.' : 'Analysis is still incomplete; resolve the remaining issues.'}`);
        announce('Edits applied. The analysis has been refreshed.');
        window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      } else {
        $('review').hidden = true; workspace = null;
        message('error', `Updated ${count(result.written, 'source file')}, but the new analysis could not finish: ${result.error}. Reload Studio after resolving it.`);
      }
    } catch (error) {
      $('apply-dialog').close(); message('error', error.message); plan = null;
      window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    } finally { busy = false; renderBusy(); }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  load();
})();
