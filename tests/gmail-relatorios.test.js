// Testes dos relatórios diário, semanal e mensal dos e-mails novos. Executar com: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const wf = require('../workflows/gmail-relatorios.json');
const fase1 = require('../workflows/fase1-diagnostico.json');

const byName = n => wf.nodes.find(x => x.name === n);
const code = n => byName(n).parameters.jsCode;
const run = (src, refs) =>
  new Function('$input', '$', src)(
    { all: () => [] },
    name => ({ first: () => ({ json: refs[name] }), all: () => (Array.isArray(refs[name]) ? refs[name] : []).map(json => ({ json })) })
  );

const DIA = 86400000;
// Instante em America/Sao_Paulo (UTC-3) a partir de "hoje" local
const hojeLocal = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somaDias = (data, n) => new Date(Date.parse(data + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
const instante = (data, hora = '10:00') => new Date(`${data}T${hora}:00-03:00`).toISOString();
const linha = (id, data, extra = {}) => ({
  timestamp: new Date().toISOString(), modo: 'APLICAR', messageId: id, remetente: `r${id}@empresa.com`, assunto: `Assunto ${id}`,
  dataEmail: data, resumo: '', marcador: '20-TRABALHO/Projetos', status: 'SEM_EVENTO', motivo: '',
  linkGmail: `https://mail.google.com/mail/#all/t${id}`, titulo: '', inicio: '', linkEvento: '', ...extra,
});
const relatorio = (periodo, linhas) => run(code('Montar e-mail'), {
  Config: { periodo, fuso: 'America/Sao_Paulo' },
  'Ler e-mails novos': linhas,
})[0].json;

test('segurança: só lê a planilha, descobre o próprio e-mail e envia para ele', () => {
  const http = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  assert.deepStrictEqual(http.map(n => [n.name, n.parameters.method || 'GET', n.parameters.url]), [
    ['Obter meu e-mail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/profile'],
    ['Enviar relatório', 'POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'],
  ]);
  const sheets = wf.nodes.filter(n => n.type === 'n8n-nodes-base.googleSheets');
  assert.deepStrictEqual(sheets.map(n => [n.parameters.operation || 'read', n.parameters.sheetName.value, n.parameters.documentId.value]),
    [['read', 'emails_novos', 'COLE_AQUI_O_ID_DA_PLANILHA']]);
  assert.ok(!/generativelanguage|calendar\/v3|batchModify/.test(JSON.stringify(wf)), 'relatório não chama IA nem altera nada');
  assert.ok(!/GOCSPX-|AIza[0-9A-Za-z_-]{20,}|client_secret|ya29\.|refresh_token/.test(JSON.stringify(wf)), 'possível segredo no JSON');
});

test('segurança: Codificar e-mail é o mesmo da Fase 1 (destinatário = dono da conta)', () => {
  assert.strictEqual(code('Codificar e-mail'), fase1.nodes.find(n => n.name === 'Codificar e-mail').parameters.jsCode);
});

test('gatilhos: diário às 22h, semanal no domingo e mensal no dia 1, todos desativados', () => {
  const gatilhos = Object.fromEntries(wf.nodes.filter(n => n.type === 'n8n-nodes-base.scheduleTrigger')
    .map(n => [n.name, { ...n.parameters.rule.interval[0], disabled: n.disabled }]));
  assert.deepStrictEqual(Object.keys(gatilhos).sort(), ['Todo dia 1, 8h', 'Todo dia, 22h', 'Todo domingo, 22h']);
  assert.ok(Object.values(gatilhos).every(g => g.disabled === true), 'gatilhos precisam vir desativados');
  assert.strictEqual(gatilhos['Todo dia, 22h'].triggerAtHour, 22);
  assert.deepStrictEqual(gatilhos['Todo domingo, 22h'].triggerAtDay, [0]);
  assert.strictEqual(gatilhos['Todo dia 1, 8h'].triggerAtDayOfMonth, 1);
  assert.strictEqual(wf.settings.timezone, 'America/Sao_Paulo');
  const periodo = byName('Config').parameters.assignments.assignments.find(a => a.name === 'periodo').value;
  assert.match(periodo, /\$\('Todo domingo, 22h'\)\.isExecuted \? 'semanal'/);
  assert.match(periodo, /\$\('Todo dia 1, 8h'\)\.isExecuted \? 'mensal'/);
});

test('diário: só o que chegou hoje, um e-mail por linha e resumos agrupados', () => {
  const hoje = hojeLocal();
  const r = relatorio('diario', [
    {},
    linha('1', instante(hoje, '23:30'), { resumo: 'Entrevista confirmada.', marcador: '20-TRABALHO/Projetos' }),
    linha('1', instante(hoje, '23:30'), { modo: 'DRY_RUN', resumo: 'versão simulada', timestamp: '2099-01-01' }),
    linha('2', instante(hoje, '08:00'), { status: 'SEM_RESUMO', marcador: '30-NEWSLETTERS/Promoções', remetente: 'loja@x.com' }),
    linha('3', instante(hoje, '23:00'), { status: 'SEM_RESUMO', marcador: '30-NEWSLETTERS/Promoções', remetente: 'loja@x.com' }),
    linha('4', instante(somaDias(hoje, -1), '23:00'), { resumo: 'de ontem' }),
    linha('5', instante(hoje, '07:00'), { status: 'CRIADO', resumo: 'Prova.', titulo: 'Prova de cálculo', inicio: `${somaDias(hoje, 3)}T19:00:00`, linkEvento: 'https://www.google.com/calendar/event?eid=1' }),
    linha('6', instante(hoje, '07:30'), { marcador: '00-INBOX-ZERO/03-REVISAR', resumo: 'Algo estranho.' }),
  ]);
  assert.strictEqual(r.periodo, 'diario');
  assert.strictEqual(r.total, 5, 'e-mail repetido conta uma vez e o de ontem fica de fora');
  assert.match(r.assunto, /^\[Gmail\] Resumo diário – \d{2}\/\d{2}\/\d{4}$/);
  assert.match(r.html, /Entrevista confirmada\./);
  assert.ok(!/versão simulada/.test(r.html), 'linha APLICAR vence a DRY_RUN');
  assert.ok(!/de ontem/.test(r.html));
  assert.match(r.html, /Compromissos na agenda[\s\S]*Prova de cálculo/);
  assert.match(r.html, /Promoções e newsletters por remetente[\s\S]*loja@x\.com[\s\S]*<b>2<\/b>/);
  assert.match(r.html, /Para revisar[\s\S]*Assunto 6/);
  assert.ok(!/DRY_RUN/.test(r.html), 'sem aviso de simulação quando tudo é APLICAR');
});

test('assunto do relatório casa com a regra SIS-01, para não ir à IA quando chegar', () => {
  const regra = /^\[Gmail\] (Diagn[oó]stico|Resumo)/;
  assert.ok(require('../workflows/fase2-3-classificar-aplicar.json').nodes.find(n => n.name === 'Classificar')
    .parameters.jsCode.includes(String(regra).slice(1, -1)));
  for (const p of ['diario', 'semanal', 'mensal']) assert.match(relatorio(p, []).assunto, regra);
});

test('semanal e mensal: janelas certas, sem resumos no mensal e aviso de simulação', () => {
  const hoje = hojeLocal();
  const semana = relatorio('semanal', [
    linha('a', instante(somaDias(hoje, -6), '00:10'), { resumo: 'início da semana' }),
    linha('b', instante(somaDias(hoje, -7), '23:50'), { resumo: 'fora da semana' }),
    linha('c', instante(hoje), { resumo: 'hoje', modo: 'DRY_RUN', status: 'SIMULADO', titulo: 'Reunião', inicio: `${hoje}T15:00:00` }),
  ]);
  assert.strictEqual(semana.total, 2);
  assert.match(semana.assunto, /^\[Gmail\] Resumo semanal – \d{2}\/\d{2} a \d{2}\/\d{2}\/\d{4}$/);
  assert.match(semana.html, /DRY_RUN/);
  assert.match(semana.html, /simulado/);

  const [ano, mes] = hoje.split('-').map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
  const mensal = relatorio('mensal', [
    linha('m1', instante(`${anterior}-01`, '00:05'), { resumo: 'resumo que não aparece' }),
    linha('m2', instante(`${anterior}-15`), { status: 'ERRO_IA' }),
    linha('m3', instante(hoje.slice(0, 8) + '01', '00:05'), { resumo: 'mês atual' }),
  ]);
  assert.strictEqual(mensal.total, 2);
  assert.match(mensal.assunto, /^\[Gmail\] Resumo mensal – \S+ de \d{4}$/);
  assert.ok(!/resumo que não aparece/.test(mensal.html), 'mensal mostra só números');
  assert.match(mensal.html, /Por marcador/);
  assert.match(mensal.html, /Falhas[\s\S]*ERRO_IA/);
});

test('período vazio e conteúdo escapado', () => {
  const vazio = relatorio('diario', [{}]);
  assert.strictEqual(vazio.total, 0);
  assert.match(vazio.html, /Nenhum e-mail novo neste período/);
  const r = relatorio('diario', [linha('x', instante(hojeLocal()), {
    resumo: '<script>alert(1)</script>', assunto: '"><img src=x>', linkGmail: 'javascript:alert(1)',
  })]);
  assert.ok(!/<script>|<img src=x>|href="javascript/.test(r.html), 'HTML não escapado');
});
