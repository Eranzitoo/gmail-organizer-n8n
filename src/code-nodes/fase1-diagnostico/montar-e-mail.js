// Nó n8n: "Montar e-mail" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Monta o relatório em HTML para e-mail. Clientes de e-mail ignoram CSS externo e <style>,
// então todo o visual usa estilos inline e tabelas.
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
const valor = (sec, item) => ((secoes[sec] || []).find(i => i.item === item) || {}).quantidade ?? 0;
const num = n => typeof n === 'number' ? n.toLocaleString('pt-BR') : esc(n);

const cor = { texto: '#1f2937', suave: '#6b7280', borda: '#e5e7eb', fundo: '#f3f4f6', zebra: '#f9fafb', destaque: '#2563eb', alerta: '#b00020' };
const fonte = 'font-family:Arial,Helvetica,sans-serif';
const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const incompleto = itens.some(i => i.secao === 'COBERTURA' && /^(Fora do limite|Falhas)/.test(i.item) && i.quantidade > 0);

// Cartões com os números principais
const cartoes = [
  ['Analisados', valor('RESUMO', 'Total analisado')],
  ['Não lidos', valor('RESUMO', 'Não lidos')],
  ['Sem marcador', valor('RESUMO', 'Sem label do usuário')],
  ['Newsletters', valor('RESUMO', 'Newsletters / listas')],
].map(([rotulo, n]) => `<td width="25%" style="padding:4px">`
  + `<div style="background:#ffffff;border:1px solid ${cor.borda};border-radius:8px;padding:12px 6px;text-align:center">`
  + `<div style="font-size:22px;font-weight:bold;color:${cor.texto}">${num(n)}</div>`
  + `<div style="font-size:12px;color:${cor.suave};margin-top:2px">${rotulo}</div></div></td>`).join('');

// Detalhes no formato "30.5%" ganham uma barra proporcional
const barra = detalhe => {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(detalhe));
  if (!m) return esc(detalhe);
  const p = Math.min(Number(m[1]), 100);
  return `<div style="font-size:11px;color:${cor.suave}">${esc(detalhe)}</div>`
    + `<div style="background:${cor.fundo};border-radius:3px;height:6px;margin-top:3px">`
    + `<div style="background:${cor.destaque};border-radius:3px;height:6px;width:${p}%"></div></div>`;
};

const tabela = (sec, lista) => `<h3 style="${fonte};font-size:15px;color:${cor.texto};margin:24px 0 8px">${esc(titulos[sec] || sec)}</h3>`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="${fonte};font-size:13px;border-collapse:collapse;border:1px solid ${cor.borda}">`
  + `<tr style="background:${cor.fundo};color:${cor.suave};font-size:11px;text-transform:uppercase">`
  + `<th align="left" style="padding:8px">Item</th><th align="right" style="padding:8px">Qtd</th><th align="left" style="padding:8px;width:35%">Detalhe</th></tr>`
  + lista.map((i, n) => `<tr style="background:${n % 2 ? cor.zebra : '#ffffff'};border-top:1px solid ${cor.borda}">`
    + `<td style="padding:7px 8px;color:${cor.texto};word-break:break-all">${esc(i.item)}</td>`
    + `<td align="right" style="padding:7px 8px;color:${cor.texto};font-weight:bold;white-space:nowrap">${num(i.quantidade)}</td>`
    + `<td style="padding:7px 8px;color:${cor.suave}">${barra(i.detalhe)}</td></tr>`).join('')
  + `</table>`;

let html = `<div style="background:${cor.fundo};padding:16px 0">`
  + `<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:10px;${fonte}">`
  + `<tr><td style="background:${cor.destaque};border-radius:10px 10px 0 0;padding:20px 24px;color:#ffffff">`
  + `<div style="font-size:20px;font-weight:bold">📬 Diagnóstico do Gmail</div>`
  + `<div style="font-size:13px;opacity:0.9;margin-top:4px">Gerado em ${quando} · somente leitura, nenhuma alteração na caixa</div></td></tr>`
  + `<tr><td style="padding:16px 20px 24px">`;
if (incompleto) {
  html += `<div style="background:#fdecee;border-left:4px solid ${cor.alerta};padding:10px 12px;color:${cor.alerta};font-size:13px;margin-bottom:12px">`
    + `<b>Atenção:</b> relatório parcial. Veja a seção Cobertura da leitura.</div>`;
}
html += `<table width="100%" cellpadding="0" cellspacing="0"><tr>${cartoes}</tr></table>`;
for (const [sec, lista] of Object.entries(secoes)) html += tabela(sec, lista);
html += `</td></tr>`
  + `<tr><td style="padding:12px 24px;border-top:1px solid ${cor.borda};font-size:11px;color:${cor.suave}">`
  + `gmail-organizer-n8n · Fase 1 (diagnóstico)</td></tr></table></div>`;

return [{ json: { html, assunto: `[Gmail] Diagnóstico – ${new Date().toISOString().slice(0, 10)}` } }];
