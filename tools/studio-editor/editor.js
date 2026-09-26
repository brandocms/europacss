import {EditorState, StateEffect, StateField, Compartment} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, Decoration} from '@codemirror/view';
import {javascriptLanguage} from '@codemirror/lang-javascript';
import {indentOnInput, indentUnit, bracketMatching, foldGutter, foldKeymap, foldedRanges, unfoldEffect, syntaxHighlighting, HighlightStyle} from '@codemirror/language';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {closeBrackets, closeBracketsKeymap} from '@codemirror/autocomplete';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import JSON5 from 'json5';

// The expression grammar understands JSON5 comments, unquoted keys, single
// quotes and trailing commas. Rust remains the config validator.
const language = javascriptLanguage.configure({top:'SingleExpression'});
const linkedRanges = StateEffect.define();
const links = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(linkedRanges)) value = Decoration.set(effect.value.map(range => Decoration.mark({class:'cm-source-link'}).range(range.from,range.to)),true);
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
const colors = HighlightStyle.define([
  {tag:[tags.propertyName,tags.definition(tags.propertyName)],color:'#6c42ad'},
  {tag:tags.string,color:'#2d7459'},
  {tag:tags.number,color:'#b3651f'},
  {tag:[tags.bool,tags.null,tags.keyword],color:'#ad427b'},
  {tag:tags.comment,color:'#878895',fontStyle:'italic'},
  {tag:[tags.brace,tags.squareBracket,tags.punctuation],color:'#77809a'},
]);
const theme = EditorView.theme({
  '&':{height:'100%',fontSize:'13px',backgroundColor:'#fff',color:'#4a4359'},
  '.cm-scroller':{overflow:'auto',fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',lineHeight:'1.7'},
  '.cm-content':{padding:'14px 0',caretColor:'#5844c0'},
  '.cm-line':{padding:'0 12px 0 8px'},
  '.cm-gutters':{backgroundColor:'#fcfbfe',border:'none',color:'#aaa3ba',fontSize:'10px'},
  '.cm-lineNumbers .cm-gutterElement':{padding:'0 6px 0 8px'},
  '.cm-activeLine, .cm-activeLineGutter':{backgroundColor:'#f4f1fb'},
  '.cm-source-link':{backgroundColor:'#e6dcff',boxShadow:'0 1px #b5a0ef'},
  '&.cm-focused':{outline:'none'},
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground':{backgroundColor:'#ddd5f3'},
  '.cm-foldPlaceholder':{backgroundColor:'#f0ecfb',border:'none',color:'#817198'},
  '.cm-searchMatch':{backgroundColor:'#f7e9b4'},
  '.cm-panels':{backgroundColor:'#f8f6fc',fontSize:'11px'},
});

export function create(host) {
  let raw = '', indexedDoc, ranges = [], index = new Map();
  const wrapping = new Compartment();
  let wrap = 'off';
  const extensions = [
    language, indentUnit.of('  '), lineNumbers(), foldGutter(), history(),
    drawSelection(), dropCursor(), indentOnInput(), bracketMatching(), closeBrackets(),
    highlightActiveLine(), highlightActiveLineGutter(), highlightSelectionMatches(),
    syntaxHighlighting(colors), links, theme, wrapping.of([]),
    keymap.of([...closeBracketsKeymap,...defaultKeymap,...historyKeymap,...foldKeymap,...searchKeymap,indentWithTab]),
    EditorView.contentAttributes.of({'aria-label':'JSON5 configuration',spellcheck:'false',autocapitalize:'off',autocomplete:'off'}),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        // Keep untouched CRLF/mixed line endings and comments byte-for-byte.
        {
          const starts = [0], newline = raw.match(/\r\n|\r|\n/)?.[0] || '\n';
          for(const match of raw.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
          const offset = position => {const line=update.startState.doc.lineAt(position);return starts[line.number-1]+position-line.from;};
          const changes = [];
          update.changes.iterChanges((from,to,_a,_b,text) => changes.push({from:offset(from),to:offset(to),text:text.toString().replace(/\n/g,newline)}));
          for(const change of changes.reverse()) raw=raw.slice(0,change.from)+change.text+raw.slice(change.to);
        }
        indexedDoc = undefined;
        queueMicrotask(() => host.dispatchEvent(new Event('input')));
      }
      if(update.docChanged || update.selectionSet && !update.startState.selection.eq(update.state.selection)) queueMicrotask(() => host.dispatchEvent(new Event('cursorchange')));
    }),
  ];
  const view = new EditorView({parent:host, extensions});
  function indexSource() {
    if(indexedDoc === view.state.doc) return;
    indexedDoc = view.state.doc; ranges=[]; index=new Map();
    const source = view.state.doc.toString();
    const tree = language.parser.parse(source);
    function object(node,path,depth=0) {
      if(depth>128) return;
      for(let property=node.firstChild;property;property=property.nextSibling) {
        if(property.name !== 'Property') continue;
        const key = property.firstChild;
        if(!key || !['PropertyDefinition','String','Number'].includes(key.name)) continue;
        let name;
        try { name=Object.keys(JSON5.parse(`{${source.slice(key.from,key.to)}:null}`))[0]; } catch {continue;}
        if(name === undefined) continue;
        const next=[...path,name], encoded=JSON.stringify(next);
        const range={path:next,from:property.from,to:property.to,keyFrom:key.from,keyTo:key.to};
        ranges.push(range); index.set(encoded,index.has(encoded)?null:range);
        for(let value=key.nextSibling;value;value=value.nextSibling) if(value.name==='ObjectExpression') object(value,next,depth+1);
      }
    }
    for(let root=tree.topNode.firstChild;root;root=root.nextSibling) if(root.name === 'ObjectExpression') {object(root,[]);break;}
  }
  const api = {
    view,
    get value() {return raw;},
    set value(value) {
      raw=String(value); indexedDoc=undefined;
      view.setState(EditorState.create({doc:raw.replace(/\r\n|\r/g,'\n'), extensions}));
      api.wrap=wrap;
    },
    get wrap(){return wrap;},
    set wrap(value){wrap=value;host.dataset.wrap=wrap;view.dispatch({effects:wrapping.reconfigure(wrap==='soft'?EditorView.lineWrapping:[])});},
    get selectionStart(){return view.state.selection.main.head;},
    addEventListener:(...args)=>host.addEventListener(...args),
    focus:()=>view.focus(),
    pathAtCursor() {
      indexSource(); const position=view.state.selection.main.head;
      return ranges.filter(range=>range.from<=position && range.to>=position).sort((a,b)=>b.path.length-a.path.length)[0]?.path || [];
    },
    range(path) {indexSource();return index.get(JSON.stringify(path)) || null;},
    highlight(paths,{reveal=false}={}) {
      indexSource();
      const found=paths.map(path=>index.get(JSON.stringify(path))).filter(Boolean);
      const unique=found.filter((range,i)=>!found.some((other,j)=>j!==i && other.from<=range.from && other.to>=range.to && (other.from<range.from || other.to>range.to || j<i)));
      const effects=[linkedRanges.of(unique)];
      const first=found[0];
      if(reveal && first) {
        foldedRanges(view.state).between(0,view.state.doc.length,(from,to)=>{if(from<=first.to && to>=first.from) effects.push(unfoldEffect.of({from,to}));});
        effects.push(EditorView.scrollIntoView(first.keyFrom,{y:'center',x:'start'}));
      }
      view.dispatch({effects,...(reveal && first?{selection:{anchor:first.keyFrom}}:{})});
      if(reveal && first) view.focus();
      return first?{...first,line:view.state.doc.lineAt(first.from).number}:null;
    },
  };
  host.dataset.wrap='off'; host.europaEditor=api;
  return api;
}
