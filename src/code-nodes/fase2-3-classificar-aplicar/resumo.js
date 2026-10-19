// Nó n8n: "Resumo" (workflow fase2-3-classificar-aplicar.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Resumo da execução, por marcador e por recomendação
const itens = $('Classificar').all().map(i => i.json);
const cfg = $('Config').first().json;
const cont = (k) => itens.reduce((m, i) => (m[i[k]] = (m[i[k]] || 0) + 1, m), {});
return [{ json: {
  modo: cfg.modo,
  total: itens.length,
  porMarcador: cont('labelSugerido'),
  porRecomendacao: cont('recomendacao'),
  erros: itens.filter(i => i.status.startsWith('ERRO')).length,
}}];
