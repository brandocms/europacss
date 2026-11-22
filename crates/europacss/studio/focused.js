'use strict';
// Proposals target authored scalar leaves. References and wildcard rules
// stay references and wildcard rules; resolved defaults are never serialized back.
window.EuropaFocused = {create({editor, getContext}) {
  const $=s=>document.querySelector(s), panel=$('#focused'), fields=$('#focused-fields');
  let selected, snapshot, proposal, generation=0;
  function message(text) {$('#focused-status').textContent=text;}
  function invalidate() {
    ++generation;proposal=null;$('#focused-apply').disabled=true;
    if(selected && snapshot!==editor.value) message('The JSON5 changed. Select the token again to refresh these fields.');
  }
  function show(token) {
    invalidate();selected=token;snapshot=editor.value;panel.hidden=false;
    $('#focused-title').textContent=`Edit ${token.name}`;
    requestAnimationFrame(()=>panel.scrollIntoView({block:'nearest'}));
    $('#focused-diff').textContent='';fields.replaceChildren();
    const context=getContext();
    $('#focused-review').disabled=!context.valid;
    if(!context.valid) {message('Wait for the current configuration to compile, then select the token again.');return;}
    try {
      const authored=editor.fields(token.config_paths);
      if(!authored.length) {message(token.config_paths.length?'This entry has no editable scalar values. Use JSON5 for arrays and new properties.':'This token comes from an inherited config or the built-in defaults. Add an override in the JSON5 editor to customize it.');$('#focused-review').disabled=true;return;}
      if(authored.length>128) {message('This entry has more than 128 fields. Select a smaller entry in the JSON5 editor.');$('#focused-review').disabled=true;return;}
      for(const field of authored) {
        const label=document.createElement('label'), title=document.createElement('span'), input=document.createElement('input');
        const origin=token.config_paths.find(path=>path.every((key,i)=>key===field.path[i]));
        title.textContent=field.path.slice(origin.length).join(' › ') || 'Value';
        label.title=field.path.join(' › ');input.dataset.path=JSON.stringify(field.path);
        input.value=typeof field.value==='string'?field.value:field.literal;
        input.dataset.type=typeof field.value==='string'?'string':'json5';
        input.authoredValue=field.value;input.initialValue=input.value;
        input.spellcheck=false;input.setAttribute('aria-label',title.textContent);
        input.addEventListener('input',()=>{invalidate();message('Review the proposed change before applying it.');});
        label.append(title,input);fields.append(label);
      }
      message('Edit authored values, including * fallbacks and __base__ properties. Shared references stay linked. Edit arrays and add new properties in JSON5.');
    } catch(error) {message(error.message);$('#focused-review').disabled=true;}
  }
  $('#focused-close').addEventListener('click',()=>{invalidate();selected=null;panel.hidden=true;});
  $('#focused-source').addEventListener('click',()=>{if(selected)editor.highlight(selected.config_paths,{reveal:true});});
  $('#focused-review').addEventListener('click',async()=>{
    const version=++generation;proposal=null;$('#focused-apply').disabled=true;
    try {
      if(snapshot!==editor.value || !getContext().valid) throw Error('The source changed. Select the token again before reviewing.');
      const plan=editor.plan([...fields.querySelectorAll('input')].map(input=>({path:JSON.parse(input.dataset.path),value:input.value===input.initialValue?input.authoredValue:input.dataset.type==='string'?input.value:editor.parse(input.value)})));
      $('#focused-diff').textContent=plan.changes.map(change=>`${change.path.join(' › ')}\n− ${change.old}\n+ ${change.insert}`).join('\n\n');
      if(!plan.changes.length) {message('No changes yet.');return;}
      message('Checking the proposed configuration…');
      const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:plan.source})});
      const data=await response.json();
      if(version!==generation || snapshot!==editor.value) return;
      if(!response.ok) throw Error(data.error || 'The proposed configuration could not compile.');
      const before=getContext().data;
      const newErrors=data.specimens.filter(s=>s.error && !before.specimens.some(old=>old.kind===s.kind && old.name===s.name && old.error===s.error));
      if(newErrors.length) throw Error(newErrors.map(s=>`${s.name}: ${s.error}`).join('\n'));
      const newNotes=data.notes.filter(note=>!before.notes.includes(note));
      if(newNotes.length) throw Error(newNotes.join('\n'));
      proposal=plan;$('#focused-apply').disabled=false;message('Ready to apply. Comments and other values stay untouched; Undo restores the edit.');
    } catch(error) {if(version===generation) message(error.message);}
  });
  $('#focused-apply').addEventListener('click',()=>{
    if(!proposal)return;
    try {editor.apply(proposal);snapshot=editor.value;invalidate();message('Applied to the JSON5. The preview is updating. Export to keep your changes.');}
    catch(error) {invalidate();message(error.message);}
  });
  return {show,invalidate};
}};
