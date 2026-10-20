// Nó n8n: "Registrar aplicação" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Confirma cada chamada ao batchModify: resposta sem erro = marcador aplicado; com erro = falhou.
// Mesmas colunas da aba aplicacoes da Fase 2/3.
const cfg = $('Config').first().json;
const agora = new Date().toISOString();
return $input.all().map(({ json: r }, i) => {
  const g = $('Agrupar por marcador').itemMatching(i).json;
  const erro = r.error ? String(r.error.message || JSON.stringify(r.error)).slice(0, 300) : '';
  return { json: {
    timestamp: agora,
    execucaoId: cfg.execucaoId,
    label: g.label,
    labelId: g.labelId,
    total: g.total,
    status: erro ? 'ERRO' : 'CONFIRMADO',
    erro,
    messageIds: (g.ids || []).join(','),
  }, pairedItem: { item: i } };
});
