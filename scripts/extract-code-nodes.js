// Extrai o JavaScript dos nós Code de cada workflow para src/code-nodes/<workflow>/ (versão legível para revisão).
// Os JSON em workflows/ são a fonte da verdade; rode este script após editar um workflow no n8n.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
fs.rmSync(path.join(root, 'src', 'code-nodes'), { recursive: true, force: true });
for (const f of fs.readdirSync(path.join(root, 'workflows')).filter(f => f.endsWith('.json'))) {
  const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflows', f), 'utf8'));
  const outDir = path.join(root, 'src', 'code-nodes', f.replace(/\.json$/, ''));
  fs.mkdirSync(outDir, { recursive: true });
  for (const n of wf.nodes.filter(n => n.type === 'n8n-nodes-base.code')) {
    const file = path.join(outDir, `${slug(n.name)}.js`);
    fs.writeFileSync(file, `// Nó n8n: "${n.name}" (workflow ${f}; gerado por scripts/extract-code-nodes.js, não edite aqui)\n${n.parameters.jsCode}`);
    console.log('extraído:', path.relative(root, file));
  }
}
