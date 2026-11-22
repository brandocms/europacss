// Maintainer-only bundle regeneration. Cargo builds use the checked-in assets.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const destination = resolve('../../crates/europacss/studio');
const result = await build({entryPoints:['editor.js'],bundle:true,format:'iife',globalName:'EuropaEditor',target:'es2020',minify:true,metafile:true,legalComments:'inline',outfile:join(destination,'editor.bundle.js')});
const packages = new Map();
for(const input of Object.keys(result.metafile.inputs)) {
  if(!input.includes('node_modules/')) continue;
  let dir = dirname(resolve(input));
  while(!existsSync(join(dir,'package.json'))) dir = dirname(dir);
  const pkg = JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  const license = ['LICENSE','LICENSE.txt','LICENSE.md'].find(name=>existsSync(join(dir,name)));
  if(!license) throw Error(`Missing license for ${pkg.name}`);
  packages.set(pkg.name,{name:pkg.name,version:pkg.version,license:pkg.license,text:readFileSync(join(dir,license),'utf8')});
}
const deps=[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name));
writeFileSync(join(destination,'editor.LICENSES.txt'),deps.map(p=>`${p.name} ${p.version}\n${p.text}`).join('\n\n'));
writeFileSync(join(destination,'editor.dependencies.json'),JSON.stringify(deps.map(({text,...p})=>p),null,2)+'\n');
