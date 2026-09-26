'use strict';
// Browser measurements of compiled CSS; no parallel Europa sizing implementation.
window.EuropaAccessibility = (() => {
  const luminance = rgb => rgb.slice(0,3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum,n,i) => sum + n * [.2126,.7152,.0722][i],0);
  const composite = (fg,bg) => fg.slice(0,3).map((n,i) => n * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  function contrast(fg,bg,canvas) {
    const background = composite(bg,canvas), foreground = composite(fg,background);
    const a=luminance(foreground), b=luminance(background);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }
  const threshold = (level,large=false) => level === 'AAA' ? (large ? 4.5 : 7) : (large ? 3 : 4.5);
  const largeText = (size,weight) => size >= 24 || size >= 56/3 && weight >= 700;
  const round = n => Math.round(n*100)/100;
  const ratioLabel = n => (Math.floor(n*100)/100).toFixed(2) + ':1';
  const zoomSteps = maximum => [1,1.1,1.25,1.5,1.75,2,2.5,3,4].filter(n=>n<=maximum);
  // Jupiter's current Chrome detector accumulates changes in rounded DPR.
  // This models a run starting at 100% on one display; it does not detect zoom.
  const runtimeZoom = (mode,zoom,dpr=1) => mode==='proportional' ? zoom : mode==='jupiter-chrome' ? 1+(Math.round(dpr*zoom*100)-Math.round(dpr*100))/100 : 1;
  const runtimeLabel = options => options.runtime==='proportional' ? '--ec-zoom follows browser zoom' : options.runtime==='jupiter-chrome' ? 'Jupiter Chrome · starting DPR '+options.dpr : 'CSS only · --ec-zoom fixed at 1';
  function widths(breakpoints,from,to,current) {
    const edges=breakpoints.map(([,px])=>px).filter(px=>px>=from && px<=to);
    if(edges.length>32) throw Error('Narrow the width range to at most 32 breakpoints.');
    const points=new Set([from,to,...[320,375,768,1024,1280,1440,1920,current].filter(w=>w>=from&&w<=to)]);
    for(const px of edges) for(const delta of [-1,-.5,0,1]) if(px+delta>=from&&px+delta<=to) points.add(px+delta);
    const ordered=[from,...edges,to].sort((a,b)=>a-b);
    for(let i=1;i<ordered.length;i++) if(ordered[i]-ordered[i-1]>2) points.add(round((ordered[i]+ordered[i-1])/2));
    return [...points].sort((a,b)=>a-b);
  }
  function create({getContext,trace}) {
    const $=id=>document.getElementById(id), make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
    let generation=0, report=null, selected=null;
    const settingsIds=['a11y-level','a11y-from','a11y-to','a11y-zoom','a11y-runtime','a11y-dpr','a11y-min-size','a11y-jump','a11y-canvas'];
    try {const saved=JSON.parse(localStorage.getItem('europa.accessibility.v1')||'{}');for(const id of settingsIds)if(typeof saved[id]==='string')$(id).value=saved[id];} catch {}
    function settings() {
      const value=id=>Number($(id).value);
      const result={level:$('a11y-level').value,from:value('a11y-from'),to:value('a11y-to'),maxZoom:value('a11y-zoom'),runtime:$('a11y-runtime').value,dpr:value('a11y-dpr'),minSize:value('a11y-min-size'),jump:value('a11y-jump'),canvas:$('a11y-canvas').value};
      if(!['none','proportional','jupiter-chrome'].includes(result.runtime)||!Number.isFinite(result.dpr)||result.dpr<.5||result.dpr>4)throw Error('Choose a zoom runtime and a starting display DPR from 0.5–4.');
      if(!['AA','AAA'].includes(result.level)||![2,4].includes(result.maxZoom)||!Object.values(result).every(v=>typeof v!=='number'||Number.isFinite(v))||result.from<280||result.to>3840||result.from>=result.to||result.minSize<0||result.minSize>96||result.jump<1||result.jump>100) throw Error('Choose a valid width range from 280–3840px, a size hint from 0–96px and a jump hint from 1–100%.');
      return result;
    }
    function remember() {try {localStorage.setItem('europa.accessibility.v1',JSON.stringify(Object.fromEntries(settingsIds.map(id=>[id,$(id).value]))));}catch{}}
    function runtimeHelp() {
      const mode=$('a11y-runtime').value;
      $('a11y-dpr-field').hidden=mode!=='jupiter-chrome';
      $('a11y-runtime-help').textContent=mode==='proportional'
        ? 'Models --ec-zoom = browser zoom (2 at 200%). This assumes the runtime detects zoom correctly. Fixed pixel rules remain unchanged.'
        : mode==='jupiter-chrome'
        ? 'Models Jupiter’s current Chrome DPR calculation. On a DPR 2 display, 200% zoom sets --ec-zoom to 3, not 2. Assumes the page starts at 100% and stays on one display.'
        : 'CSS only holds --ec-zoom at 1. These results exclude Jupiter’s JavaScript compensation.';
    }
    runtimeHelp();
    function invalidate(message='Settings or configuration changed. Run checks again.') {
      generation++;report=null;$('a11y-results').hidden=true;$('a11y-export').disabled=true;
      $('a11y-status').textContent=message;$('a11y-run').disabled=!getContext().valid;
    }
    function sourceButton(token) {
      const button=make('button','Edit','a11y-source');button.setAttribute('aria-label','Edit '+token.name+' configuration');
      button.disabled=!token.config_paths.length;
      button.addEventListener('pointerenter',()=>trace(token,false));
      button.addEventListener('pointerleave',()=>trace(null,false));
      button.addEventListener('click',()=>trace(token,true));
      return button;
    }
    function rgba(value) {
      // Never silently treat unresolved/inherited colors as black or clip a gamut.
      if(typeof value!=='string'||/\b(?:var|env|light-dark)\s*\(|\b(?:currentcolor|inherit|initial|unset|revert|canvas|canvastext|linktext|visitedtext|activetext|buttonface|buttontext|buttonborder|field|fieldtext|highlight|highlighttext|selecteditem|selecteditemtext|mark|marktext|graytext|accentcolor|accentcolortext)\b/i.test(value)) return null;
      // CSSOM serializes #00000080 as alpha .5 in some engines. Preserve the
      // exact emitted 128/255 alpha when calculating contrast near a threshold.
      const hex=value.trim().match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
      if(hex) {const full=hex[1].length<=4?[...hex[1]].map(c=>c+c).join(''):hex[1];return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)).concat(full.length===8?parseInt(full.slice(6),16)/255:1);}
      const node=make('span');node.style.color=value;if(!node.style.color)return null;
      node.hidden=true;document.body.append(node);const computed=getComputedStyle(node).color;node.remove();
      let match=computed.match(/^rgba?\(([^)]+)\)$/i), channels;
      if(match) {
        channels=match[1].trim().split(/[\s,\/]+/).map(Number);
        if(channels.length===3)channels.push(1);
      } else if((match=computed.match(/^color\(srgb\s+([^)]+)\)$/i))) {
        const parts=match[1].split('/');channels=parts[0].trim().split(/\s+/).map(n=>Number(n)*255);channels.push(parts[1]===undefined?1:Number(parts[1]));
      }
      return channels?.length===4&&channels.every(Number.isFinite)&&channels.slice(0,3).every(n=>n>=0&&n<=255)&&channels[3]>=0&&channels[3]<=1 ? channels : null;
    }
    function palette() {return getContext().data?.colors || [];}
    function colorPairs() {
      const colors=palette(), fg=colors[Number($('a11y-fg').value)], bg=colors[Number($('a11y-bg').value)];
      const canvas=rgba($('a11y-canvas').value), background=bg&&rgba(bg.compiled_value), foreground=fg&&rgba(fg.compiled_value);
      const level=$('a11y-level').value;
      const box=$('a11y-contrast');box.replaceChildren();
      if(!getContext().valid){box.append(make('p','Compile the current configuration before checking colors.'));$('a11y-palette').replaceChildren();return;}
      if(!fg||!bg){box.append(make('p','Add colors to theme.colors to compare pairings.'));$('a11y-palette').replaceChildren();return;}
      if(!canvas||!background||!foreground)box.append(make('p','Needs manual review: this pairing could not compile to unconditional, explicit sRGB colors.','a11y-review'));
      else {
        const ratio=contrast(foreground,background,canvas);
        const swatch=make('div','Aa · '+fg.name+' on '+bg.name,'a11y-swatch');
        const opaqueBg=composite(background,canvas),opaqueFg=composite(foreground,opaqueBg);
        swatch.style.backgroundColor='rgb('+opaqueBg.slice(0,3).join(',')+')';swatch.style.color='rgb('+opaqueFg.slice(0,3).join(',')+')';
        const normal=ratio>=threshold(level), large=ratio>=threshold(level,true);
        box.append(swatch,make('p',ratioLabel(ratio)+' · '+level+' normal text: '+(normal?'meets':'below')+' '+threshold(level)+':1 · large text: '+(large?'meets':'below')+' '+threshold(level,true)+':1',normal?'a11y-ok':'a11y-review'));
        box.append(make('p','Non-text UI/graphics: '+(ratio>=3?'meets':'below')+' 3:1 for this pairing only. Large text: at least 24px, or 18.67px at weight 700+. Text results use unrounded ratios.','a11y-help'));
      }
      const body=$('a11y-palette');body.replaceChildren();
      for(const color of colors) {
        const rgb=rgba(color.compiled_value), ratio=rgb&&background&&canvas?contrast(rgb,background,canvas):null;
        const row=make('tr');row.append(make('th',color.name),make('td',ratio===null?'Review':ratioLabel(ratio)));
        for(const large of [false,true])row.append(make('td',ratio===null?'Unknown':ratio>=threshold(level,large)?'Meets '+level:'Below '+level));
        const cell=make('td');cell.append(sourceButton(color));row.append(cell);body.append(row);
      }
      if(report) detail(selected);
    }
    function update() {
      invalidate('Ready to check the compiled configuration.');
      const colors=palette();
      for(const [id,preferred] of [['a11y-fg','body/foreground'],['a11y-bg','body/background']]) {
        const select=$(id),previous=select.selectedOptions[0]?.textContent;select.replaceChildren();
        colors.forEach((c,i)=>{const option=make('option',c.name);option.value=i;select.append(option);});
        const defaultName=id==='a11y-fg'?'black':'white';
        const chosen=colors.findIndex(c=>c.name===previous);
        const preferredIndex=colors.findIndex(c=>c.name===preferred);
        const fallback=colors.findIndex(c=>c.name===defaultName);
        select.value=Math.max(0,chosen>=0?chosen:preferredIndex>=0?preferredIndex:fallback);
      }
      colorPairs();
    }
    async function run() {
      const context=getContext();if(!context.valid){invalidate('Compile the current configuration first.');return;}
      const specimenText=context.text||'A little space changes everything.';
      let options;try {options=settings();}catch(error){$('a11y-status').textContent=error.message;return;}
      remember();invalidate();const ticket=++generation;
      $('a11y-run').disabled=true;$('a11y-status').textContent='Measuring compiled text…';
      const iframe=document.createElement('iframe');iframe.className='a11y-measure';iframe.title='Accessibility measurement specimens';iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;iframe.setAttribute('sandbox','allow-same-origin allow-scripts');
      const check=()=>{if(ticket!==generation)throw Error('cancelled');};
      try {
        const loaded=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Measurement frame did not load.')),5000);iframe.onload=()=>{clearTimeout(timeout);resolve();};});
        iframe.src='/preview';document.body.append(iframe);await loaded;check();
        const doc=iframe.contentDocument, win=iframe.contentWindow;
        const types=context.data.specimens.filter(s=>s.kind==='typography');
        const style=doc.createElement('style');
        style.textContent=':root{--ec-zoom:1}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:system-ui,sans-serif}.fixture{padding:16px;border-bottom:1px solid transparent}.type{margin:0}'+context.data.root_css+'\n'+context.fonts.css+'\n'+(context.data.families.find(([name])=>name===context.family)?.[1]||'')+'\n'+context.data.css;
        doc.head.append(style);
        const nodes=new Map();
        for(const token of types.filter(s=>!s.error)) {
          const section=doc.createElement('section');section.className='fixture';
          const p=doc.createElement('p');p.id=token.id;p.className='type';p.textContent=specimenText;
          section.append(p);doc.body.append(section);nodes.set(token.id,p);
        }
        iframe.style.width=context.width+'px';iframe.style.height='900px';
        doc.body.getBoundingClientRect(); // Trigger font selection before waiting for FontFaceSet.ready.
        let fontTimeout;
        const fontReady=await Promise.race([doc.fonts.ready.then(()=>true),new Promise(resolve=>{fontTimeout=setTimeout(()=>resolve(false),5000);})]);clearTimeout(fontTimeout);check();
        const notes=[...context.data.notes,...context.fonts.warnings];
        if(!context.text)notes.push('The empty specimen uses the default sample sentence for text measurements.');
        if(!fontReady||[...doc.fonts].some(f=>f.status==='error'))notes.push('Some fonts did not load; measurements may use fallback fonts.');
        const points=widths(context.data.breakpoints,options.from,options.to,context.width), steps=zoomSteps(options.maxZoom);
        const compensation=zoom=>runtimeZoom(options.runtime,zoom,options.dpr);
        const key=(width,height=900,ecZoom=1)=>width+':'+height+':'+ecZoom;
        const dimensions=new Map();
        for(const width of [320,context.width,...points]) dimensions.set(key(width),[width,900,1]);
        for(const width of [...points,context.width]) for(const zoom of steps) dimensions.set(key(width/zoom,900/zoom,compensation(zoom)),[width/zoom,900/zoom,compensation(zoom)]);
        const all=[...dimensions.values()];
        const measured=new Map();
        const frameTick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        const capture=()=>{
          const values={};
          for(const [id,node] of nodes) {
            const css=win.getComputedStyle(node),rect=node.getBoundingClientRect();
            const range=doc.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();
            values[id]={size:parseFloat(css.fontSize),weight:parseFloat(css.fontWeight),lineHeight:css.lineHeight,rootSize:parseFloat(win.getComputedStyle(doc.documentElement).fontSize),
              overflow:node.scrollWidth>node.clientWidth+1||text.left<rect.left-1||text.right>rect.right+1,
              clipped:node.scrollHeight>node.clientHeight+1&&['hidden','clip'].includes(css.overflowY),
              hidden:css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0,
              writingMode:css.writingMode};
          }
          return values;
        };
        for(const [i,[width,height,ecZoom]] of all.entries()) {
          check();iframe.style.width=width+'px';iframe.style.height=height+'px';doc.documentElement.style.setProperty('--ec-zoom',ecZoom);await frameTick();check();
          measured.set(key(width,height,ecZoom),capture());
          if(i%12===0)$('a11y-status').textContent='Sampling '+(i+1)+' / '+all.length+' widths…';
        }
        iframe.style.width='320px';iframe.style.height='900px';doc.documentElement.style.setProperty('--ec-zoom',1);await frameTick();check();
        const reflow=capture();
        for(const [id,node] of nodes) {
          const css=win.getComputedStyle(node),size=reflow[id].size;
          for(const [name,value] of Object.entries({'line-height':Math.max(size*1.5,parseFloat(css.lineHeight)||0)+'px','margin-bottom':Math.max(size*2,parseFloat(css.marginBottom)||0)+'px','letter-spacing':Math.max(size*.12,parseFloat(css.letterSpacing)||0)+'px','word-spacing':Math.max(size*.16,parseFloat(css.wordSpacing)||0)+'px'}))node.style.setProperty(name,value,'important');
        }
        await frameTick();check();const spaced=capture();
        for(const [id,node] of nodes){node.removeAttribute('style');node.style.setProperty('font-size',reflow[id].size*2+'px','important');}
        await frameTick();check();const resized=capture();
        const zoomAt=(token,width)=>{
          const start=measured.get(key(width))[token.id].size;
          const rows=steps.map(zoom=>{const ecZoom=compensation(zoom),sample=measured.get(key(width/zoom,900/zoom,ecZoom))[token.id],size=sample.size;return {zoom,ecZoom,viewport:width/zoom,viewportHeight:900/zoom,cssSize:size,equivalentSize:size*zoom,growth:start>0?size*zoom/start:null,overflow:sample.overflow,clipped:sample.clipped,hidden:sample.hidden};});
          return {width,baseline:start,maximum:start>0?Math.max(...rows.map(r=>r.growth)):null,reachedAt:rows.find(r=>r.growth>=1.9999)?.zoom||null,rows};
        };
        const results=types.map(token=>{
          if(token.error)return {id:token.id,name:token.name,config_paths:token.config_paths,error:token.error};
          const samples=points.map(width=>({width,...measured.get(key(width))[token.id]}));
          const zoomSamples=[...new Set([...points,context.width])].map(width=>zoomAt(token,width));
          const zoom=zoomSamples.filter(s=>points.includes(s.width)).sort((a,b)=>a.maximum-b.maximum)[0];
          const zoomLayoutIssues=zoomSamples.flatMap(s=>s.rows.filter(r=>r.overflow||r.clipped||r.hidden).map(r=>({startingWidth:s.width,...r})));
          const jumps=context.data.breakpoints.filter(([,w])=>w>options.from&&w<=options.to).map(([name,width])=>{
            const a=measured.get(key(width-1))?.[token.id]?.size,b=measured.get(key(width))?.[token.id]?.size;
            return {name,width,before:a,after:b,percent:(b-a)/a*100};
          }).filter(j=>Number.isFinite(j.percent)&&Math.abs(j.percent)>=options.jump);
          const result={id:token.id,name:token.name,config_paths:token.config_paths,samples,minimum:Math.min(...samples.map(s=>s.size)),maximum:Math.max(...samples.map(s=>s.size)),zoom,currentZoom:zoomAt(token,context.width),zoomLayoutIssues,jumps,layout:{reflow:reflow[token.id],spacing:spaced[token.id],textResize:resized[token.id]},hints:[]};
          if(zoom.maximum===null)result.hints.push('Zero-sized text: enlargement cannot be calculated');
          else if(zoom.maximum<1.9999)result.hints.push('Zoom review: text did not reach 200% in this model');
          if(result.minimum<options.minSize)result.hints.push('Below '+options.minSize+'px design hint');
          if(jumps.length)result.hints.push(jumps.length+' abrupt breakpoint change'+(jumps.length===1?'':'s'));
          if(zoomLayoutIssues.length)result.hints.push('Modeled zoom: inspect overflow, clipping or hidden text');
          for(const [name,sample] of Object.entries(result.layout)) if(sample.overflow||sample.clipped||sample.hidden)result.hints.push(({reflow:'320px reflow',spacing:'Text spacing',textResize:'200% text'})[name]+': inspect overflow, clipping or hidden text');
          if(samples.some(s=>s.writingMode!=='horizontal-tb'))result.hints.push('Vertical writing: manual layout review required');
          return result;
        });
        check();
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(context.source));check();
        report={version:2,createdAt:new Date().toISOString(),wcag:'2.2',settings:options,runtime:runtimeLabel(options),configSha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''),family:context.family,specimenText,baseViewport:context.width,baseHeight:900,breakpoints:context.data.breakpoints,sampledWidths:points,measurementCount:all.length,notes,typography:results,scope:'Compiled token specimens and page-zoom model with an explicit runtime assumption. No actual browser zoom or site-wide conformance result.'};
        renderReport();$('a11y-status').textContent='Checked '+results.length+' text tokens at '+points.length+' base widths ('+all.length+' measurements).';$('a11y-export').disabled=false;
      } catch(error) {if(ticket===generation)$('a11y-status').textContent=error.message;}
      finally {iframe.remove();if(ticket===generation)$('a11y-run').disabled=false;}
    }
    function renderReport() {
      $('a11y-results').hidden=false;const rows=report.typography;
      const summary=$('a11y-summary');summary.replaceChildren();
      for(const [number,label] of [[rows.filter(r=>r.zoom && (r.zoom.maximum===null || r.zoom.maximum<1.9999)).length,'zoom reviews'],[rows.filter(r=>r.hints?.length).length,'tokens with review notes'],[rows.filter(r=>r.error).length,'unavailable text tokens']]) {
        const card=make('div');card.append(make('strong',String(number)),make('span',label));summary.append(card);
      }
      if(report.notes.length)summary.append(make('p',report.notes.join(' '),'a11y-review'));
      summary.append(make('p','Runtime: '+report.runtime+'.','a11y-help'));
      const body=$('a11y-types');body.replaceChildren();
      for(const row of rows) {
        const tr=make('tr');tr.dataset.token=row.name;const name=make('th'),button=make('button',row.name,'a11y-token');
        button.addEventListener('click',()=>detail(row.id));name.append(button);tr.append(name);
        button.addEventListener('pointerenter',()=>trace(row,false));button.addEventListener('pointerleave',()=>trace(null,false));
        tr.append(make('td',row.error?'Unavailable':round(row.minimum)+'–'+round(row.maximum)+'px'));
        tr.append(make('td',row.error?'Unavailable':row.zoom.maximum===null?'Review · zero size':row.zoom.maximum<1.9999?'Review · best '+Math.round(row.zoom.maximum*100)+'%':'200% reached in model',row.zoom && (row.zoom.maximum===null || row.zoom.maximum<1.9999)?'a11y-review':''));
        tr.append(make('td',row.error||row.hints.join(' · ')||'No sampled flags'));
        const edit=make('td');edit.append(sourceButton(row));tr.append(edit);body.append(tr);
      }
      $('a11y-detail').hidden=!rows.length;
      selected=rows.some(r=>r.id===selected)?selected:rows.find(r=>!r.error)?.id||rows[0]?.id;
      detail(selected);
    }
    function detail(id) {
      if(!report)return;const row=report.typography.find(r=>r.id===id);if(!row)return;selected=id;
      $('a11y-detail-title').textContent=row.name+' · viewport & zoom measurements';
      const chart=$('a11y-chart'),body=$('a11y-detail-body');chart.replaceChildren();body.replaceChildren();if(row.error){body.append(make('p',row.error));return;}
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 170');svg.setAttribute('role','img');svg.setAttribute('aria-label','Font size by viewport width for '+row.name+'. Exact values follow in the measurements table.');
      const lower=row.minimum===row.maximum?Math.max(0,row.minimum-4):row.minimum,upper=row.minimum===row.maximum?row.maximum+4:row.maximum;
      const x=w=>48+(w-report.settings.from)/(report.settings.to-report.settings.from)*524,y=s=>130-(s-lower)/(upper-lower)*100;
      for(const [name,width] of report.breakpoints.filter(([,w])=>w>=report.settings.from&&w<=report.settings.to)) {
        const marker=document.createElementNS(ns,'line');marker.setAttribute('x1',x(width));marker.setAttribute('x2',x(width));marker.setAttribute('y1',25);marker.setAttribute('y2',135);marker.setAttribute('stroke','#ddd7eb');marker.setAttribute('stroke-dasharray','3 3');
        const title=document.createElementNS(ns,'title');title.textContent=name+' · '+width+'px';marker.append(title);svg.append(marker);
      }
      const line=document.createElementNS(ns,'polyline');line.setAttribute('points',row.samples.map(s=>x(s.width)+','+y(s.size)).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#6554cf');line.setAttribute('stroke-width','2');svg.append(line);
      for(const sample of row.samples) {const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x(sample.width));dot.setAttribute('cy',y(sample.size));dot.setAttribute('r',2.5);dot.setAttribute('fill','#6554cf');const title=document.createElementNS(ns,'title');title.textContent=sample.width+'px viewport: '+round(sample.size)+'px text';dot.append(title);svg.append(dot);}
      for(const [left,top,label] of [[48,158,report.settings.from+'px viewport'],[440,158,report.settings.to+'px'],[3,20,round(upper)+'px'],[3,132,round(lower)+'px']]){const t=document.createElementNS(ns,'text');t.setAttribute('x',left);t.setAttribute('y',top);t.textContent=label;svg.append(t);}
      chart.append(svg);
      body.append(make('p','Dots are measured sizes; connecting lines are visual guides. Dashed lines mark breakpoints.','a11y-help'));
      body.append(make('p','Across the checked range, the hardest starting width to enlarge is '+round(row.zoom.width)+'px: its best sampled enlargement is '+(row.zoom.maximum===null?'unknown':round(row.zoom.maximum*100)+'%')+'. The table below starts at your selected '+report.baseViewport+'px viewport. Runtime: '+report.runtime+'.','a11y-help'));
      const zoom=make('table',undefined,'a11y-table');const head=make('tr');
      for(const label of ['Zoom from '+report.baseViewport+'px','Layout width','--ec-zoom','CSS font size','Apparent size','Enlargement'])head.append(make('th',label));zoom.append(head);
      for(const item of row.currentZoom.rows){const tr=make('tr');for(const value of [round(item.zoom*100)+'%',round(item.viewport)+'px',round(item.ecZoom),round(item.cssSize)+'px',round(item.equivalentSize)+'px',item.growth===null?'Unknown':round(item.growth*100)+'%'])tr.append(make('td',value));zoom.append(tr);}
      const scroll=make('div',undefined,'a11y-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','Zoom model measurements');scroll.append(zoom);body.append(scroll);
      for(const jump of row.jumps)body.append(make('p',jump.name+' ('+jump.width+'px): '+round(jump.before)+' → '+round(jump.after)+'px ('+(jump.percent>=0?'+':'')+round(jump.percent)+'%).','a11y-review'));
      const colors=palette(),fg=colors[Number($('a11y-fg').value)],bg=colors[Number($('a11y-bg').value)];
      const f=fg&&rgba(fg.compiled_value),b=bg&&rgba(bg.compiled_value),c=rgba($('a11y-canvas').value);
      if(f&&b&&c){const ratio=contrast(f,b,c),below=row.samples.filter(s=>ratio<threshold($('a11y-level').value,largeText(s.size,s.weight)));
        body.append(make('p','Chosen color pair ('+ratioLabel(ratio)+'): '+(below.length?'below the text threshold at '+below.length+' sampled widths; first at '+below[0].width+'px.':'meets the text threshold at every sampled width.')+' Sizes and weights determine whether the large-text threshold applies.','a11y-help'));}
      const details=make('details'),summary=make('summary','All sampled font sizes');details.append(summary);
      const table=make('table',undefined,'a11y-table'),header=make('tr');for(const label of ['Viewport','Font size','Weight','Line height','Large text'])header.append(make('th',label));table.append(header);
      for(const sample of row.samples){const tr=make('tr');for(const value of [sample.width+'px',round(sample.size)+'px',sample.weight,sample.lineHeight,largeText(sample.size,sample.weight)?'Yes':'No'])tr.append(make('td',String(value)));table.append(tr);}const sampleScroll=make('div',undefined,'a11y-scroll');sampleScroll.tabIndex=0;sampleScroll.setAttribute('aria-label','Sampled font sizes');sampleScroll.append(table);details.append(sampleScroll);body.append(details);
    }
    for(const id of settingsIds)$(id).addEventListener('change',()=>{runtimeHelp();remember();invalidate();colorPairs();});
    for(const id of ['a11y-fg','a11y-bg'])$(id).addEventListener('change',colorPairs);
    $('a11y-run').addEventListener('click',run);
    $('a11y-export').addEventListener('click',()=>{
      if(!report||!getContext().valid)return;
      const colors=palette(),fg=colors[Number($('a11y-fg').value)],bg=colors[Number($('a11y-bg').value)],f=fg&&rgba(fg.compiled_value),b=bg&&rgba(bg.compiled_value),canvas=rgba($('a11y-canvas').value);
      const data={...report,colorPair:{foreground:fg?.name,background:bg?.name,foregroundValue:fg?.compiled_value,backgroundValue:bg?.compiled_value,canvas:$('a11y-canvas').value,ratio:f&&b&&canvas?contrast(f,b,canvas):null,manualReview:!(f&&b&&canvas)}};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=make('a');link.href=url;link.download='europa-accessibility.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    return {update,invalidate,run,colorPairs,get report(){return report;}};
  }
  return {create,contrast,threshold,largeText,widths,runtimeZoom};
})();
