'use strict';
window.EuropaSpecimens = {
  style: `.composition{color:#2d263a}.composition h1,.composition h2,.composition p{margin:0}.composition .context-stack{display:flex;flex-direction:column;min-width:0}.composition .context-layout{display:flex;flex-wrap:wrap;align-items:stretch}.composition .context-card{min-width:0;flex-shrink:0;border:1px solid #d7d1e1;border-radius:8px;background:#faf9fd}.composition .context-article{max-width:70ch}.composition .context-meta{color:#655b74}.composition .context-rule{border:0;border-top:1px solid #d7d1e1;width:100%;margin:0}:where(.composition) button{font:inherit}.composition .context-action{color:inherit;background:#eee8fa;border:1px solid #b5a5d7;border-radius:6px;align-self:start;text-align:left;cursor:pointer}.composition [data-specimen]{cursor:pointer}.composition [data-specimen]:hover,.composition [data-specimen]:focus-visible,.composition .is-hovered{outline:2px solid #8a71d5;outline-offset:3px}.composition .is-editing{background-color:#f0e9ff}.context-marker{display:block;font:11px/1.5 ui-monospace,monospace;color:#6a5b83;background:white;border:1px dashed #baafce;border-radius:4px;padding:5px 8px;margin:0 0 12px;cursor:pointer}.composition .context-words{overflow-wrap:normal}.composition [data-role=body]{hyphens:manual}.context-fallback-space{padding:24px;gap:24px}.context-fallback-column{width:100%}`,
  controls(data) {
    const $=s=>document.querySelector(s);
    for(const [role,kind,prefer] of [['heading','typography',/heading|title|h1|4xl/i],['body','typography',/^base$|body|paragraph/i],['detail','typography',/small|caption|xs/i],['space','spacing',/^md$|medium|gap/i],['column','grid',/^1\/2$/]]) {
      const select=$(`#context-${role}`), previous=select.selectedOptions[0]?.textContent;
      const tokens=data.specimens.filter(s=>s.kind===kind && !s.error && s.context_css && s.name!=='container');
      select.replaceChildren();
      for(const token of tokens) {const option=document.createElement('option');option.value=token.id;option.textContent=token.name;select.append(option);}
      if(!tokens.length) {const option=document.createElement('option');option.value='';option.textContent='Preview default';select.append(option);}
      select.value=tokens.find(s=>s.name===previous)?.id || tokens.find(s=>prefer.test(s.name))?.id || tokens[0]?.id || '';
    }
  },
  render({doc,data,element,link}) {
    const $=s=>document.querySelector(s), chosen=role=>data.specimens.find(s=>s.id===$(`#context-${role}`).value);
    const heading=chosen('heading'), body=chosen('body'), detail=chosen('detail'), space=chosen('space'), column=chosen('column');
    const container=$('#context-container').checked?data.specimens.find(s=>s.kind==='grid' && s.name==='container' && !s.error):null;
    const norwegian=$('#context-copy').value==='no';doc.documentElement.lang=norwegian?'nb':'en';
    const root=element(doc,'main','composition');
    if(container)root.classList.add(`context-${container.id}`);
    else root.style.padding='24px';
    const use=(node,token,role)=>{if(token){node.classList.add(`context-${token.id}`);link(node,token);}if(role)node.dataset.role=role;return node;};
    const text=(tag,copy,token,role)=>use(element(doc,tag,'type',copy),token,role);
    const marker=(parent,token,description)=>{
      if(!token)return;
      const button=element(doc,'button','context-marker',`${description} · ${token.name}`);link(button,token);parent.append(button);
    };
    marker(root,container,'Container');
    const article=element(doc,'article','context-stack context-article');
    article.classList.add(space?`context-${space.id}`:'context-fallback-space');
    marker(article,space,'Padding & spacing');
    article.append(text('p',norwegian?'KULTUR · 26. SEPTEMBER 2026':'FIELD NOTES · 26 SEPTEMBER 2026',detail,'detail'));
    article.append(text('h1',norwegian?'Små øyeblikk. Store opplevelser.':'A place to pause, a reason to stay.',heading,'heading'));
    article.append(text('p',norwegian?'Et godt sted gir rom for både hverdagen og de store begivenhetene. Vi samler mennesker, historier og ideer — og lar de små detaljene gjøre en forskjell.':'Good places make room for everyday life and unexpected discoveries. We bring people, stories and ideas together — and let the small details make a difference.',body,'body'));
    article.append(text('p',norwegian?'Når teksten får flere linjer, blir det lettere å vurdere linjeavstand og rytme. Prøv ulike skjermbredder og se hvordan overskriften og brødteksten fungerer sammen.':'Longer paragraphs reveal the rhythm between lines. Try a narrow screen, then a wider one: does the heading still belong with the body, and is there enough room to read comfortably?',body,'body'));
    const words=text('p',norwegian?'Langord: menneskerettighetsorganisasjon · tilgjengelighetserklæring · kulturminneforvaltning':'Long words: internationalization · accessibility · interdisciplinary',body,'long-words');words.classList.add('context-words');article.append(words);
    const list=element(doc,'ul','context-stack');
    for(const item of norwegian?['Plass til lange titler og nye ideer','Æ, Ø og Å — tall som 1 234,50 kr','En lenket tekst som fortsatt må være leselig']:['Room for longer titles and new ideas','Numbers, punctuation and €1,234.50','A line that needs room to wrap naturally'])list.append(text('li',item,body,'list'));
    article.append(list,element(doc,'hr','context-rule'));root.append(article);
    marker(root,column,'Card width & gutter');
    const cards=element(doc,'section','context-layout');
    if(column)cards.classList.add(`context-columns-${column.id}`);
    for(let i=0;i<2;i++) {
      const card=element(doc,'article','context-card context-stack');
      card.classList.add(column?`context-${column.id}`:'context-fallback-column');
      card.classList.add(space?`context-${space.id}`:'context-fallback-space');
      card.append(text('p',norwegian?'AKTUELT':'UPCOMING',detail,'detail'));
      card.append(text('h2',norwegian?(i?'Nye perspektiver':'En kveld sammen'):(i?'Another point of view':'An evening together'),heading,'card-heading'));
      card.append(text('p',norwegian?'En kort introduksjon som blir til flere linjer på en liten skjerm. Beholder kortet plass til innholdet?':'A short introduction becomes several lines on a small screen. Does the card still have room for its content?',body,'card-body'));
      const button=text('button',norwegian?'Se program og tilgjengelighet':'Explore the programme',detail,'button');button.classList.add('context-action');button.style.padding='.65em 1em';card.append(button);cards.append(card);
    }
    root.append(cards);doc.body.append(root);
  },
  measure(doc) {
    const targets=[...doc.querySelectorAll('[data-role]')];
    const overflowing=targets.filter(node=>node.scrollWidth>node.clientWidth+1);
    const body=doc.querySelector('[data-role=body]'), heading=doc.querySelector('[data-role=heading]');
    const size=node=>node?doc.defaultView.getComputedStyle(node).fontSize:'—';
    document.querySelector('#context-measure').textContent=`Heading ${size(heading)} · Body ${size(body)}${overflowing.length?` · ${overflowing.length} text area(s) overflow — inspect the long words and card widths.`:' · No horizontal text overflow detected in these specimens.'}`;
  },
};
