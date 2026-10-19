// Nó n8n: "Montar e-mail" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Monta o relatório em HTML (usado apenas se você ativar o nó de envio)
const itens = $input.all().map(i => i.json);
const titulos = {
  COBERTURA: 'Cobertura da leitura', RESUMO: 'Resumo', TOP_REMETENTES: 'Top 30 remetentes', TOP_DOMINIOS: 'Top domínios',
  POR_ANO: 'E-mails por ano', POR_LABEL: 'E-mails por label', POR_CATEGORIA_GMAIL: 'Categorias do Gmail',
  TOP_NEWSLETTERS: 'Principais newsletters', TOP_NOTIFICACOES: 'Principais notificações',
  ANTIGOS_POR_REMETENTE: 'E-mails antigos por remetente', ANEXOS_GRANDES: 'Anexos grandes (MB)',
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const secoes = {};
for (const i of itens) (secoes[i.secao] ||= []).push(i);

const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let html = `<div style="font-family:Arial,sans-serif;font-size:13px"><h2>Diagnóstico do Gmail (DRY RUN)</h2>`
  + `<p>Gerado em ${quando}. Nenhuma alteração foi feita na caixa.</p>`;
const incompleto = itens.some(i => i.secao === 'COBERTURA' && /^(Fora do limite|Falhas)/.test(i.item) && i.quantidade > 0);
if (incompleto) html += `<p style="color:#b00020"><b>Atenção:</b> relatório parcial. Veja a seção Cobertura da leitura.</p>`;
for (const [sec, lista] of Object.entries(secoes)) {
  html += `<h3>${titulos[sec] || sec}</h3><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">`
    + `<tr><th align="left">Item</th><th>Qtd</th><th align="left">Detalhe</th></tr>`;
  for (const i of lista) html += `<tr><td>${esc(i.item)}</td><td align="right">${esc(i.quantidade)}</td><td>${esc(i.detalhe)}</td></tr>`;
  html += `</table>`;
}
html += `</div>`;
return [{ json: { html, assunto: `[Gmail] Diagnóstico – ${new Date().toISOString().slice(0, 10)}` } }];
