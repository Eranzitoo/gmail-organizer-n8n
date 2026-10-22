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

// Tema escuro, letras claras e grandes (mesmo visual do Eranzito Brain).
const cor = { texto: '#f1f5fb', suave: '#a9b8cf', borda: '#26375a', fundo: '#0a0f1a', cartao: '#0f1726', painel: '#16223a', linha: '#111b2e', zebra: '#16223a', destaque: '#5eead4', cabecalho: '#10284a', alerta: '#fb7185', alertaFundo: '#2a1418' };
const fonte = 'font-family:Arial,Helvetica,sans-serif';
const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const incompleto = itens.some(i => i.secao === 'COBERTURA' && /^(Fora do limite|Falhas)/.test(i.item) && i.quantidade > 0);

// Cartões com os números principais
const cartoes = [
  ['Analisados', valor('RESUMO', 'Total analisado')],
  ['Não lidos', valor('RESUMO', 'Não lidos')],
  ['Sem marcador', valor('RESUMO', 'Sem label do usuário')],
  ['Newsletters', valor('RESUMO', 'Newsletters / listas')],
].map(([rotulo, n]) => `<td width="25%" style="padding:5px">`
  + `<div style="background:${cor.painel};border:1px solid ${cor.borda};border-top:3px solid ${cor.destaque};border-radius:10px;padding:16px 6px;text-align:center">`
  + `<div style="font-size:30px;font-weight:bold;color:${cor.texto}">${num(n)}</div>`
  + `<div style="font-size:14px;color:${cor.suave};margin-top:6px">${rotulo}</div></div></td>`).join('');

// Detalhes no formato "30.5%" ganham uma barra proporcional
const barra = detalhe => {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(detalhe));
  if (!m) return esc(detalhe);
  const p = Math.min(Number(m[1]), 100);
  return `<div style="font-size:13px;color:${cor.suave}">${esc(detalhe)}</div>`
    + `<div style="background:${cor.fundo};border-radius:4px;height:8px;margin-top:4px">`
    + `<div style="background:${cor.destaque};border-radius:4px;height:8px;width:${p}%"></div></div>`;
};

const tabela = (sec, lista) => `<h3 style="${fonte};font-size:21px;color:${cor.texto};margin:30px 0 12px">${esc(titulos[sec] || sec)}</h3>`
  + `<table width="100%" cellpadding="0" cellspacing="0" style="${fonte};font-size:15px;border-collapse:collapse;border:1px solid ${cor.borda}">`
  + `<tr style="background:${cor.painel};color:${cor.destaque};font-size:12px;text-transform:uppercase;letter-spacing:.8px">`
  + `<th align="left" style="padding:12px 14px">Item</th><th align="right" style="padding:12px 14px">Qtd</th><th align="left" style="padding:12px 14px;width:35%">Detalhe</th></tr>`
  + lista.map((i, n) => `<tr style="background:${n % 2 ? cor.zebra : cor.linha};border-top:1px solid ${cor.borda}">`
    + `<td style="padding:11px 14px;color:${cor.texto};word-break:break-all">${esc(i.item)}</td>`
    + `<td align="right" style="padding:11px 14px;color:${cor.texto};font-weight:bold;white-space:nowrap">${num(i.quantidade)}</td>`
    + `<td style="padding:11px 14px;color:${cor.suave}">${barra(i.detalhe)}</td></tr>`).join('')
  + `</table>`;

let html = `<div style="background:${cor.fundo};padding:24px 8px">`
  + `<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:900px;background:${cor.cartao};border:1px solid ${cor.borda};border-radius:18px;overflow:hidden;${fonte}">`
  + `<tr><td style="background:${cor.cabecalho};background-image:linear-gradient(135deg,#10284a,#0f1f3d 60%,#132a3a);padding:34px 30px 30px;color:#ffffff;border-bottom:3px solid ${cor.destaque}">`
  + `<div style="font-size:32px;line-height:40px;font-weight:bold">📬 Diagnóstico do Gmail</div>`
  + `<div style="font-size:16px;color:#c7d5ea;margin-top:10px">Gerado em ${quando} · somente leitura, nenhuma alteração na caixa</div></td></tr>`
  + `<tr><td style="padding:26px 24px 24px">`;
if (incompleto) {
  html += `<div style="background:${cor.alertaFundo};border-left:4px solid ${cor.alerta};padding:14px 16px;color:${cor.alerta};font-size:15px;margin-bottom:14px">`
    + `<b>Atenção:</b> relatório parcial. Veja a seção Cobertura da leitura.</div>`;
}
html += `<table width="100%" cellpadding="0" cellspacing="0"><tr>${cartoes}</tr></table>`;
for (const [sec, lista] of Object.entries(secoes)) html += tabela(sec, lista);
html += `</td></tr>`
  + `<tr><td style="padding:18px 30px;border-top:1px solid ${cor.borda};background:#0c1320;font-size:13px;color:${cor.suave}">`
  + `gmail-organizer-n8n · Fase 1 (diagnóstico)</td></tr></table></div>`;

return [{ json: { html, assunto: `[Gmail] Diagnóstico – ${new Date().toISOString().slice(0, 10)}` } }];
