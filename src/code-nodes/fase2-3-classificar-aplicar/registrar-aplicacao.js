// Nó n8n: "Registrar aplicação" (workflow fase2-3-classificar-aplicar.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Confirma cada chamada ao batchModify: resposta sem erro = marcador aplicado; com erro = falhou.
// A aba auditoria registra a intenção (PENDENTE); esta aba registra o que o Gmail confirmou.
const grupos = $('Agrupar por marcador').all().map(i => i.json);
const cfg = $('Config').first().json;
const agora = new Date().toISOString();
return $input.all().map(({ json: r }, i) => {
  const g = grupos[i] || {};
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
  }};
});
