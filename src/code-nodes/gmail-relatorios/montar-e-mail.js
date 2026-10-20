// Nó n8n: "Montar e-mail" (workflow gmail-relatorios.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Monta o relatório dos e-mails novos (diário, semanal ou mensal) a partir da aba emails_novos.
// Não lê o Gmail nem chama a IA: usa só o que o gmail-sync já registrou.
// Clientes de e-mail ignoram CSS externo e <style>, então todo o visual usa estilos inline e tabelas.
const cfg = $('Config').first().json;
const periodo = ['diario', 'semanal', 'mensal'].includes(cfg.periodo) ? cfg.periodo : 'diario';
const fuso = cfg.fuso || 'America/Sao_Paulo';
const LIMITE_RESUMOS = { diario: 200, semanal: 60, mensal: 0 };
const LIMITE_LISTA = 50;
const REVISAR = '00-INBOX-ZERO/03-REVISAR';
const DIA = 86400000;

// Janela do período no fuso configurado
const partesNoFuso = (epoch, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(new Date(epoch)).map(x => [x.type, x.value]));
const offsetDoFuso = (epoch, tz) => {
  const p = partesNoFuso(epoch, tz);
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(epoch / 1000) * 1000) / 60000;
};
const meiaNoite = data => {
  const utc = Date.parse(data + 'T00:00:00Z');
  return utc - offsetDoFuso(utc - offsetDoFuso(utc, fuso) * 60000, fuso) * 60000;
};
const dataNoFuso = epoch => { const p = partesNoFuso(epoch, fuso); return `${p.year}-${p.month}-${p.day}`; };
const somaDias = (data, n) => new Date(Date.parse(data + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
const br = data => data.split('-').reverse().join('/');

const hoje = dataNoFuso(Date.now());
let inicio, fim, rotulo;
if (periodo === 'semanal') {
  inicio = meiaNoite(somaDias(hoje, -6));
  fim = meiaNoite(somaDias(hoje, 1));
  rotulo = `${br(somaDias(hoje, -6)).slice(0, 5)} a ${br(hoje)}`;
} else if (periodo === 'mensal') {
  const [ano, mes] = hoje.split('-').map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12-01` : `${ano}-${String(mes - 1).padStart(2, '0')}-01`;
  inicio = meiaNoite(anterior);
  fim = meiaNoite(hoje.slice(0, 8) + '01');
  rotulo = new Date(anterior + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
} else {
  inicio = meiaNoite(hoje);
  fim = meiaNoite(somaDias(hoje, 1));
  rotulo = br(hoje);
}

// Uma linha por e-mail: prefere APLICAR, depois sucesso, depois a mais recente
const peso = l => [l.modo === 'APLICAR' ? 1 : 0, String(l.status).startsWith('ERRO') ? 0 : 1, String(l.timestamp)];
const compara = (a, b) => { const x = peso(a), y = peso(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
const porId = {};
for (const { json: l } of $('Ler e-mails novos').all()) {
  if (!l || !l.messageId) continue;
  const t = Date.parse(l.dataEmail);
  if (!(t >= inicio && t < fim)) continue;
  if (!porId[l.messageId] || compara(porId[l.messageId], l) < 0) porId[l.messageId] = l;
}
const linhas = Object.values(porId).sort((a, b) => String(b.dataEmail).localeCompare(String(a.dataEmail)));

const resumidos = linhas.filter(l => l.resumo);
const promocoes = linhas.filter(l => l.status === 'SEM_RESUMO');
const compromissos = linhas.filter(l => ['CRIADO', 'SIMULADO'].includes(l.status));
const revisar = linhas.filter(l => l.marcador === REVISAR || l.status === 'REVISAR');
const erros = linhas.filter(l => String(l.status).startsWith('ERRO'));
const simulacao = linhas.some(l => l.modo !== 'APLICAR');
const contar = (lista, chave) => Object.entries(lista.reduce((c, l) => ((c[chave(l) || '(sem marcador)'] = (c[chave(l) || '(sem marcador)'] || 0) + 1), c), {}))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

// HTML
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (url, texto) => /^https:\/\//.test(String(url)) ? `<a href="${esc(url)}" style="color:#2563eb;text-decoration:none">${esc(texto)}</a>` : esc(texto);
const cor = { texto: '#1f2937', suave: '#6b7280', borda: '#e5e7eb', fundo: '#f3f4f6', zebra: '#f9fafb', destaque: '#2563eb', alerta: '#b00020' };
const fonte = 'font-family:Arial,Helvetica,sans-serif';
const titulo = t => `<h3 style="${fonte};font-size:15px;color:${cor.texto};margin:24px 0 8px">${esc(t)}</h3>`;
const tabela = (cabecalho, linhasHtml) => `<table width="100%" cellpadding="0" cellspacing="0" style="${fonte};font-size:13px;border-collapse:collapse;border:1px solid ${cor.borda}">`
  + `<tr style="background:${cor.fundo};color:${cor.suave};font-size:11px;text-transform:uppercase">`
  + cabecalho.map(([t, alinha]) => `<th align="${alinha || 'left'}" style="padding:8px">${esc(t)}</th>`).join('') + `</tr>`
  + linhasHtml.map((celulas, n) => `<tr style="background:${n % 2 ? cor.zebra : '#ffffff'};border-top:1px solid ${cor.borda}">`
    + celulas.map(([v, alinha]) => `<td align="${alinha || 'left'}" style="padding:7px 8px;color:${cor.texto};vertical-align:top">${v}</td>`).join('') + `</tr>`).join('')
  + `</table>`;
const mais = (total, mostrados) => total > mostrados
  ? `<div style="font-size:12px;color:${cor.suave};margin-top:4px">e mais ${total - mostrados}, na aba emails_novos.</div>` : '';
const quando = l => esc(l.inicio ? br(String(l.inicio).slice(0, 10)) + (String(l.inicio).length > 10 ? ' ' + String(l.inicio).slice(11, 16) : '') : '');

const nomes = { diario: 'diário', semanal: 'semanal', mensal: 'mensal' };
const cartoes = [
  ['Novos', linhas.length], ['Resumidos', resumidos.length], ['Promoções', promocoes.length],
  ['Compromissos', compromissos.length], ['Para revisar', revisar.length],
].map(([r, n]) => `<td width="20%" style="padding:4px">`
  + `<div style="background:#ffffff;border:1px solid ${cor.borda};border-radius:8px;padding:12px 4px;text-align:center">`
  + `<div style="font-size:22px;font-weight:bold;color:${cor.texto}">${n.toLocaleString('pt-BR')}</div>`
  + `<div style="font-size:12px;color:${cor.suave};margin-top:2px">${r}</div></div></td>`).join('');

let corpo = '';
if (simulacao) {
  corpo += `<div style="background:#fff7e6;border-left:4px solid #d97706;padding:10px 12px;color:#92400e;font-size:13px;margin-bottom:12px">`
    + `Inclui execuções em <b>DRY_RUN</b>: marcadores e eventos marcados como simulados não foram aplicados.</div>`;
}
corpo += `<table width="100%" cellpadding="0" cellspacing="0"><tr>${cartoes}</tr></table>`;
if (!linhas.length) {
  corpo += `<p style="${fonte};font-size:14px;color:${cor.suave};margin:24px 0">Nenhum e-mail novo neste período.</p>`;
} else {
  if (compromissos.length) {
    const lista = compromissos.slice(0, LIMITE_LISTA);
    corpo += titulo('Compromissos na agenda') + tabela([['Quando'], ['Compromisso'], ['Situação']], lista.map(l => [
      [quando(l)], [link(l.linkEvento || l.linkGmail, l.titulo)], [l.status === 'CRIADO' ? 'criado' : 'simulado'],
    ])) + mais(compromissos.length, lista.length);
  }
  const limite = LIMITE_RESUMOS[periodo];
  if (limite && resumidos.length) {
    const lista = [...resumidos].sort((a, b) => String(a.marcador).localeCompare(String(b.marcador))).slice(0, limite);
    corpo += titulo('Resumo dos e-mails') + tabela([['Marcador'], ['E-mail'], ['Resumo']], lista.map(l => [
      [`<span style="color:${cor.suave};font-size:12px">${esc(l.marcador)}</span>`],
      [`<b>${esc(l.remetente)}</b><br>${link(l.linkGmail, l.assunto || '(sem assunto)')}`],
      [esc(l.resumo)],
    ])) + mais(resumidos.length, lista.length);
  }
  corpo += titulo('Por marcador') + tabela([['Marcador'], ['Qtd', 'right']],
    contar(linhas, l => l.marcador).map(([m, n]) => [[esc(m)], [`<b>${n}</b>`, 'right']]));
  if (promocoes.length) {
    const top = contar(promocoes, l => l.remetente).slice(0, 15);
    corpo += titulo('Promoções e newsletters por remetente') + tabela([['Remetente'], ['Qtd', 'right']],
      top.map(([r, n]) => [[esc(r)], [`<b>${n}</b>`, 'right']]));
  }
  if (revisar.length) {
    const lista = revisar.slice(0, LIMITE_LISTA);
    corpo += titulo('Para revisar') + tabela([['E-mail'], ['Motivo']], lista.map(l => [
      [`<b>${esc(l.remetente)}</b><br>${link(l.linkGmail, l.assunto || '(sem assunto)')}`],
      [esc(l.status === 'REVISAR' ? l.motivo : 'nenhuma regra nem a IA teve certeza do marcador')],
    ])) + mais(revisar.length, lista.length);
  }
  if (erros.length) {
    corpo += titulo('Falhas') + tabela([['Situação'], ['Qtd', 'right']],
      contar(erros, l => l.status).map(([s, n]) => [[esc(s)], [`<b>${n}</b>`, 'right']]));
  }
}

const html = `<div style="background:${cor.fundo};padding:16px 0">`
  + `<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:10px;${fonte}">`
  + `<tr><td style="background:${cor.destaque};border-radius:10px 10px 0 0;padding:20px 24px;color:#ffffff">`
  + `<div style="font-size:20px;font-weight:bold">📬 Resumo ${nomes[periodo]} do Gmail</div>`
  + `<div style="font-size:13px;opacity:0.9;margin-top:4px">${esc(rotulo)} · só e-mails que chegaram depois da ativação</div></td></tr>`
  + `<tr><td style="padding:16px 20px 24px">${corpo}</td></tr>`
  + `<tr><td style="padding:12px 24px;border-top:1px solid ${cor.borda};font-size:11px;color:${cor.suave}">`
  + `gmail-organizer-n8n · gmail-sync</td></tr></table></div>`;

return [{ json: { html, assunto: `[Gmail] Resumo ${nomes[periodo]} – ${rotulo}`, periodo, total: linhas.length } }];
