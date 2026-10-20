// Nó n8n: "Agrupar por marcador" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Só agrupa e envia no modo APLICAR. Em DRY_RUN retorna vazio e nada é alterado no Gmail.
// Uma chamada batchModify por marcador, e só para adicionar: nunca arquiva nem marca como lido.
const cfg = $('Config').first().json;
if (cfg.modo !== 'APLICAR') return [];
const grupos = {};
$input.all().forEach(({ json: m }, i) => {
  if (!m.labelId) return;
  const g = (grupos[m.labelId] ||= { labelId: m.labelId, label: m.marcador, ids: [], itens: [] });
  g.ids.push(m.messageId);
  g.itens.push({ item: i });
});
return Object.values(grupos).map(g => ({
  json: { labelId: g.labelId, label: g.label, ids: g.ids, total: g.ids.length },
  pairedItem: g.itens,
}));
