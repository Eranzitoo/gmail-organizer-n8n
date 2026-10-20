// Nó n8n: "Filtrar novas" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Escolhe os e-mails que ainda não foram processados, com base no histórico da aba emails_novos.
// APLICAR só considera linhas APLICAR; DRY_RUN considera qualquer modo, para não reenviar o mesmo e-mail à IA.
// Erros contam tentativas por modo (máximo 3). ERRO_COTA_IA não conta: é só falta de cota do Gemini.
const cfg = $('Config').first().json;
const modo = cfg.modo === 'APLICAR' ? 'APLICAR' : 'DRY_RUN';
const FINAIS = ['CRIADO', 'SIMULADO', 'DUPLICADO', 'SEM_EVENTO', 'REVISAR', 'SEM_RESUMO', 'IGNORADO_PRIVACIDADE', 'IGNORADO_CONVITE'];
const ERROS = ['ERRO_LEITURA', 'ERRO_IA', 'ERRO_AGENDA'];
const MAX_TENTATIVAS = 3;

const processadas = new Set();
const erros = {};
for (const { json: l } of $('Ler histórico').all()) {
  if (!l || !l.messageId) continue;
  const id = String(l.messageId);
  const status = String(l.status || '');
  const modoLinha = String(l.modo || '');
  if (FINAIS.includes(status) && (modo === 'DRY_RUN' || modoLinha === 'APLICAR')) processadas.add(id);
  if (ERROS.includes(status) && modoLinha === modo) erros[id] = (erros[id] || 0) + 1;
}

const limite = Number(cfg.maxEmails) || 0;
const out = [];
for (const m of $input.first().json.messages || []) {
  if (out.length >= limite) break;
  if (processadas.has(m.id)) continue;
  const falhas = erros[m.id] || 0;
  if (falhas >= MAX_TENTATIVAS) continue;
  out.push({ json: { id: m.id, tentativa: falhas + 1 }, pairedItem: { item: 0 } });
}
return out;
