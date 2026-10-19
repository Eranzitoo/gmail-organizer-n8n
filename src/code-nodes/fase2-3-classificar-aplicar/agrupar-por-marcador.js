// Nó n8n: "Agrupar por marcador" (workflow fase2-3-classificar-aplicar.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Só agrupa e envia no modo APLICAR. Em DRY_RUN retorna vazio e nada é alterado no Gmail.
const cfg = $('Config').first().json;
if (cfg.modo !== 'APLICAR') return [];
const grupos = {};
for (const { json: m } of $('Classificar').all()) {
  if (!m.labelId) continue;
  (grupos[m.labelId] ||= { labelId: m.labelId, label: m.labelSugerido, ids: [] }).ids.push(m.messageId);
}
// batchModify aceita até 1000 IDs por chamada
const out = [];
for (const g of Object.values(grupos)) {
  for (let i = 0; i < g.ids.length; i += 1000) {
    const ids = g.ids.slice(i, i + 1000);
    out.push({ json: { labelId: g.labelId, label: g.label, ids, total: ids.length } });
  }
}
return out;
