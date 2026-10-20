// Nó n8n: "Montar linha" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Uma linha por e-mail na aba emails_novos, com as mesmas colunas em qualquer desfecho.
// É o histórico que os relatórios diário, semanal e mensal leem.
// Recebe itens de quatro ramos diferentes, por isso só usa $input e o Config.
const cfg = $('Config').first().json;
const COLUNAS = ['timestamp', 'execucaoId', 'modo', 'messageId', 'remetente', 'assunto', 'dataEmail', 'categoria', 'resumo',
  'marcador', 'origemMarcador', 'regraId', 'statusMarcador', 'tipo', 'confianca', 'titulo', 'inicio', 'fim', 'diaInteiro',
  'status', 'motivo', 'tentativa', 'eventId', 'linkEvento', 'linkGmail', 'modeloIA'];
const agora = new Date().toISOString();
const modoPadrao = cfg.modo === 'APLICAR' ? 'APLICAR' : 'DRY_RUN';

return $input.all().map(({ json: j }) => {
  const valores = {
    ...j,
    timestamp: agora,
    execucaoId: cfg.execucaoId,
    modo: j.modo || modoPadrao,
    assunto: j.assuntoMascarado,
  };
  return { json: Object.fromEntries(COLUNAS.map(c => [c, valores[c] === undefined || valores[c] === null ? '' : valores[c]])) };
});
