// Nó n8n: "Agregar relatório" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Gera as tabelas do relatório de diagnóstico (uma linha por item, agrupadas por seção)
const rows = $input.all().map(i => i.json);
const geradoEm = new Date().toISOString();
const out = [];
const add = (secao, item, quantidade, detalhe = '') =>
  out.push({ json: { geradoEm, secao, item: String(item), quantidade, detalhe } });

const contar = (lista, chaveFn) => {
  const m = new Map();
  for (const r of lista) {
    for (const k of [].concat(chaveFn(r))) {
      if (k === undefined || k === null || k === '') continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const total = rows.length;
const pct = n => total ? ((n / total) * 100).toFixed(1) + '%' : '0%';
const nomes = {};
for (const r of rows) if (r.remetenteNome && !nomes[r.remetenteEmail]) nomes[r.remetenteEmail] = r.remetenteNome;

const resumo = {
  'Total analisado': total,
  'Na caixa de entrada': rows.filter(r => r.naInbox).length,
  'Arquivados (fora da inbox)': rows.filter(r => !r.naInbox).length,
  'Não lidos': rows.filter(r => r.naoLido).length,
  'Sem label do usuário': rows.filter(r => r.semLabelUsuario).length,
  'Newsletters / listas': rows.filter(r => r.isNewsletter).length,
  'Notificações automáticas': rows.filter(r => r.isAutomatico && !r.isNewsletter).length,
  'Com anexo': rows.filter(r => r.temAnexo).length,
  'Com anexo grande': rows.filter(r => r.anexoGrande).length,
  'Antigos': rows.filter(r => r.antigo).length,
};
// Cobertura: quantos e-mails a busca encontrou, quantos o limite cortou e quantas leituras falharam.
// Sem isso, falhas de leitura somem em silêncio e o relatório parece completo sem ser.
const encontrados = $('Separar mensagens').all().length;
const dentroDoLimite = $('Limitar lote').all().length;
const falhas = $('Buscar metadados').all().filter(i => !i.json.id || i.json.error).length;
add('COBERTURA', 'Encontrados na busca', encontrados);
add('COBERTURA', 'Fora do limite maxEmails', encontrados - dentroDoLimite, encontrados > dentroDoLimite ? 'aumente maxEmails no Config' : '');
add('COBERTURA', 'Falhas de leitura', falhas, falhas ? 'não entram no relatório; rode de novo' : '');
add('COBERTURA', 'Analisados', total, encontrados ? ((total / encontrados) * 100).toFixed(1) + '% do encontrado' : '');

for (const [k, v] of Object.entries(resumo)) add('RESUMO', k, v, pct(v));

for (const [k, v] of contar(rows, r => r.remetenteEmail).slice(0, 30)) add('TOP_REMETENTES', k, v, nomes[k] || '');
for (const [k, v] of contar(rows, r => r.dominio).slice(0, 30)) add('TOP_DOMINIOS', k, v, pct(v));
for (const [k, v] of contar(rows, r => r.ano).sort((a, b) => b[0] - a[0])) add('POR_ANO', k, v, pct(v));
for (const [k, v] of contar(rows, r => r.labels ? r.labels.split(', ') : [])) add('POR_LABEL', k, v, pct(v));
for (const [k, v] of contar(rows, r => r.categoriaGmail || 'SEM_CATEGORIA')) add('POR_CATEGORIA_GMAIL', k, v, pct(v));

const news = rows.filter(r => r.isNewsletter);
for (const [k, v] of contar(news, r => r.remetenteEmail).slice(0, 25)) {
  const naoLidos = news.filter(r => r.remetenteEmail === k && r.naoLido).length;
  add('TOP_NEWSLETTERS', k, v, `${nomes[k] || ''} | não lidos: ${naoLidos}`);
}
const notif = rows.filter(r => r.isAutomatico && !r.isNewsletter);
for (const [k, v] of contar(notif, r => r.remetenteEmail).slice(0, 25)) add('TOP_NOTIFICACOES', k, v, nomes[k] || '');

const antigos = rows.filter(r => r.antigo);
for (const [k, v] of contar(antigos, r => r.remetenteEmail).slice(0, 20)) add('ANTIGOS_POR_REMETENTE', k, v, nomes[k] || '');

rows.filter(r => r.anexoGrande)
  .sort((a, b) => b.tamanhoMB - a.tamanhoMB)
  .slice(0, 30)
  .forEach(r => add('ANEXOS_GRANDES', r.remetenteEmail, r.tamanhoMB, `${r.data.slice(0, 10)} | ${r.assunto}`));

return out;
