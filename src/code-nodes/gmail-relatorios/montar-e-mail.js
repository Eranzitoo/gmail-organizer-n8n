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
const link = (url, texto) => /^https:\/\//.test(String(url)) ? `<a href="${esc(url)}" style="color:#0d6b63;text-decoration:none;font-weight:bold">${esc(texto)}</a>` : esc(texto);

// Identidade visual do relatório: azul-marinho, verde petróleo e cinzas suaves.
const cor = {
  texto: '#152238',
  corpo: '#26364d',
  suave: '#6c7a8d',
  borda: '#e3e8ee',
  fundo: '#eef2f6',
  painel: '#f6f8fa',
  zebra: '#fbfcfd',
  destaque: '#0d6b63',
  cabecalho: '#152238',
  alertaFundo: '#fff8e8',
  alertaBorda: '#d39a27',
  alertaTexto: '#79551a',
  erro: '#a33a45',
};
const fonte = 'font-family:Arial,Helvetica,sans-serif';
const titulo = t => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 12px"><tr><td style="padding:0"><div style="${fonte};font-size:10px;line-height:14px;letter-spacing:1px;text-transform:uppercase;color:${cor.destaque};font-weight:bold">RELATÓRIO</div><div style="${fonte};font-size:17px;line-height:24px;color:${cor.texto};font-weight:bold">${esc(t)}</div></td></tr></table>`;
const tabela = (cabecalho, linhasHtml) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${fonte};font-size:13px;border-collapse:separate;border-spacing:0;border:1px solid ${cor.borda};border-radius:10px;overflow:hidden">`
  + `<tr style="background:${cor.painel};color:${cor.suave};font-size:10px;text-transform:uppercase;letter-spacing:.5px">`
  + cabecalho.map(([t, alinha]) => `<th align="${alinha || 'left'}" style="padding:11px 12px;font-weight:bold">${esc(t)}</th>`).join('') + `</tr>`
  + linhasHtml.map((celulas, n) => `<tr style="background:${n % 2 ? cor.zebra : '#ffffff'}">`
    + celulas.map(([v, alinha]) => `<td align="${alinha || 'left'}" style="padding:11px 12px;color:${cor.corpo};line-height:19px;vertical-align:top;border-top:1px solid ${cor.borda}">${v}</td>`).join('') + `</tr>`).join('')
  + `</table>`;
const mais = (total, mostrados) => total > mostrados
  ? `<div style="${fonte};font-size:12px;line-height:18px;color:${cor.suave};margin-top:6px">e mais ${total - mostrados}, disponíveis na aba emails_novos.</div>` : '';
const quando = l => esc(l.inicio ? br(String(l.inicio).slice(0, 10)) + (String(l.inicio).length > 10 ? ' ' + String(l.inicio).slice(11, 16) : '') : '');

const nomes = { diario: 'diário', semanal: 'semanal', mensal: 'mensal' };
const indicadores = [
  ['Novos', linhas.length, cor.texto], ['Resumidos', resumidos.length, cor.texto], ['Promoções', promocoes.length, cor.texto],
  ['Compromissos', compromissos.length, cor.texto], ['Para revisar', revisar.length, cor.destaque],
];
const cartoes = indicadores.map(([r, n, corNumero]) => `<td width="20%" style="padding:3px;vertical-align:top">`
  + `<div style="background:${cor.painel};border:1px solid ${cor.borda};border-radius:10px;padding:13px 3px;text-align:center">`
  + `<div style="${fonte};font-size:23px;line-height:28px;font-weight:bold;color:${corNumero}">${n.toLocaleString('pt-BR')}</div>`
  + `<div style="${fonte};font-size:10px;line-height:15px;color:${cor.suave};margin-top:4px">${r}</div></div></td>`).join('');

let corpo = '';
if (simulacao) {
  corpo += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td style="background:${cor.alertaFundo};border-left:4px solid ${cor.alertaBorda};padding:12px 14px;color:${cor.alertaTexto};font-size:12px;line-height:18px">`
    + `<strong>Atenção:</strong> esta execução inclui o modo <strong>DRY_RUN</strong>. Marcadores e eventos simulados não foram aplicados.</td></tr></table>`;
}
corpo += `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cartoes}</tr></table>`;
if (!linhas.length) {
  corpo += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td style="${fonte};font-size:14px;line-height:21px;color:${cor.suave};background:${cor.painel};border-radius:10px;padding:16px">Nenhum e-mail novo neste período.</td></tr></table>`;
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
      [`<span style="color:${cor.suave};font-size:11px;line-height:16px">${esc(l.marcador)}</span>`],
      [`<strong>${esc(l.remetente)}</strong><br>${link(l.linkGmail, l.assunto || '(sem assunto)')}`],
      [esc(l.resumo)],
    ])) + mais(resumidos.length, lista.length);
  }
  corpo += titulo('Por marcador') + tabela([['Marcador'], ['Qtd', 'right']],
    contar(linhas, l => l.marcador).map(([m, n]) => [[esc(m)], [`<strong>${n}</strong>`, 'right']]));
  if (promocoes.length) {
    const top = contar(promocoes, l => l.remetente).slice(0, 15);
    corpo += titulo('Promoções e newsletters por remetente') + tabela([['Remetente'], ['Qtd', 'right']],
      top.map(([r, n]) => [[esc(r)], [`<strong>${n}</strong>`, 'right']]));
  }
  if (revisar.length) {
    const lista = revisar.slice(0, LIMITE_LISTA);
    corpo += titulo('Para revisar') + tabela([['E-mail'], ['Motivo']], lista.map(l => [
      [`<strong>${esc(l.remetente)}</strong><br>${link(l.linkGmail, l.assunto || '(sem assunto)')}`],
      [esc(l.status === 'REVISAR' ? l.motivo : 'nenhuma regra nem a IA teve certeza do marcador')],
    ])) + mais(revisar.length, lista.length);
  }
  if (erros.length) {
    corpo += titulo('Falhas') + tabela([['Situação'], ['Qtd', 'right']],
      contar(erros, l => l.status).map(([s, n]) => [[esc(s)], [`<strong>${n}</strong>`, 'right']]));
  }
}

// Texto de prévia (aparece ao lado do assunto na caixa de entrada) e moldura do e-mail.
const preheader = `Resumo ${nomes[periodo]} do Gmail: ${linhas.length.toLocaleString('pt-BR')} novo(s) e-mail(s).`;
const html = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>`
  + `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${cor.fundo};padding:28px 12px">`
  + `<tr><td align="center">`
  + `<table align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;${fonte};box-shadow:0 5px 20px rgba(21,34,56,.08)">`
  + `<tr><td style="background:${cor.cabecalho};padding:30px 34px 28px;color:#ffffff">`
  + `<div style="font-size:10px;line-height:14px;letter-spacing:1.4px;color:#73d2c2;font-weight:bold">RELATÓRIO ${nomes[periodo].toUpperCase()}</div>`
  + `<div style="font-size:26px;line-height:32px;font-weight:bold;margin-top:8px">Resumo do Gmail</div>`
  + `<div style="font-size:13px;line-height:20px;color:#c9d3df;margin-top:8px">Período ${esc(rotulo)} &nbsp;·&nbsp; E-mails recebidos após a ativação</div>`
  + `</td></tr>`
  + `<tr><td style="padding:24px 34px 0">${corpo}</td></tr>`
  + `<tr><td style="border-top:1px solid ${cor.borda};background:#f8fafb;padding:18px 34px;color:${cor.suave};font-size:11px;line-height:17px">`
  + `Gerado automaticamente por <strong style="color:${cor.texto}">gmail-organizer-n8n</strong> · gmail-sync<br>`
  + `<span style="color:#9aa6b5;font-size:10px">Este relatório foi enviado pelo seu fluxo de automação.</span>`
  + `</td></tr></table></td></tr></table>`;

return [{ json: { html, assunto: `[Gmail] Resumo ${nomes[periodo]} – ${rotulo}`, periodo, total: linhas.length } }];
