// Testes do gmail-sync (e-mails com data viram eventos no Google Agenda). Executar com: node --test
// 1) Segurança: Gmail só leitura, Calendar só insert sem convidados, nada sensível vai ao Gemini.
// 2) Lógica: rodam o código dos nós Code com respostas simuladas do Gmail, do Gemini e do Calendar.
const { test } = require('node:test');
const assert = require('node:assert');
const wf = require('../workflows/gmail-sync-agenda.json');
const fase23 = require('../workflows/fase2-3-classificar-aplicar.json');

const byName = n => wf.nodes.find(x => x.name === n);
const code = n => byName(n).parameters.jsCode;
const cfg = (extra = {}) => ({
  ...Object.fromEntries(byName('Config').parameters.assignments.assignments.map(a => [a.name, a.value])),
  execucaoId: '7',
  ...extra,
});
// O mock de $(nome) imita o n8n: first(), all(), itemMatching(i) e item.
const run = (src, items, refs = {}) =>
  new Function('$input', '$', src)(
    { all: () => items.map(json => ({ json })), first: () => ({ json: items[0] }) },
    name => {
      const ref = refs[name];
      const lista = Array.isArray(ref) ? ref : [ref];
      return {
        first: () => ({ json: lista[0] }),
        all: () => lista.map(json => ({ json })),
        itemMatching: i => ({ json: lista[i] }),
        item: { json: lista[0] },
      };
    }
  );

const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const DIA = 86400000;
// Data local (America/Sao_Paulo, UTC-3) daqui a n dias, para os testes não envelhecerem.
const dataLocal = n => new Date(Date.now() - 3 * 3600000 + n * DIA).toISOString().slice(0, 10);

// ---------------------------------------------------------------- segurança e configuração

test('Config: DRY_RUN, marcadores no lugar dos IDs e nenhum remetente pessoal', () => {
  const c = cfg();
  assert.deepStrictEqual(Object.keys(c).sort(), [
    'calendarId', 'duracaoPadraoMin', 'execucaoId', 'fuso', 'limiarConfianca', 'maxCaracteres', 'maxEmails',
    'modeloIA', 'modo', 'query', 'remetentesIgnorados',
  ]);
  assert.strictEqual(c.modo, 'DRY_RUN');
  assert.strictEqual(c.calendarId, 'COLE_AQUI_O_ID_DA_AGENDA');
  assert.strictEqual(c.remetentesIgnorados, '');
  assert.match(c.query, /in:inbox/);
  assert.match(c.modeloIA, /^gemini/);
});

test('segurança: gatilho manual ativo e agendado desativado por padrão', () => {
  const manual = wf.nodes.find(n => n.type === 'n8n-nodes-base.manualTrigger');
  const agendado = wf.nodes.filter(n => n.type === 'n8n-nodes-base.scheduleTrigger');
  assert.ok(manual && !manual.disabled, 'falta o gatilho manual');
  assert.strictEqual(agendado.length, 1);
  assert.strictEqual(agendado[0].disabled, true, 'gatilho agendado precisa vir desativado');
});

test('segurança: sem segredos e sem nós nativos de escopo amplo', () => {
  const tudo = JSON.stringify(wf);
  assert.ok(!/GOCSPX-|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]|client_secret|ya29\.|refresh_token/.test(tudo), 'possível segredo no JSON');
  assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(cfg().remetentesIgnorados), 'e-mail pessoal em remetentesIgnorados');
  const tipos = wf.nodes.map(n => n.type);
  assert.ok(!tipos.some(t => /n8n-nodes-base\.(gmail|googleCalendar)$|gmailTrigger/.test(t)), 'nó nativo do Gmail ou do Calendar');
});

test('segurança: Gmail só com GET e sem endpoints de escrita', () => {
  const gmail = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest' && /gmail\.googleapis\.com/.test(n.parameters.url));
  assert.strictEqual(gmail.length, 2);
  for (const n of gmail) {
    assert.ok(!n.parameters.method || n.parameters.method === 'GET', `${n.name} não é GET`);
    assert.ok(!/\/(modify|batchModify|trash|delete|send|import|insert)\b/.test(n.parameters.url), `${n.name} chama endpoint de escrita`);
  }
});

test('segurança: Calendar só lista e insere eventos, sem avisar ninguém', () => {
  const cal = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest' && /googleapis\.com\/calendar/.test(n.parameters.url));
  assert.strictEqual(cal.length, 3);
  for (const n of cal) {
    assert.match(n.parameters.url, /^=https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/\{\{[^}]+\}\}\/events(\?sendUpdates=none)?$/, n.name);
    assert.ok(['GET', 'POST', undefined].includes(n.parameters.method), `${n.name} usa ${n.parameters.method}`);
  }
  const posts = cal.filter(n => n.parameters.method === 'POST');
  assert.deepStrictEqual(posts.map(n => n.name), ['Criar evento']);
  assert.match(posts[0].parameters.url, /sendUpdates=none$/);
  assert.ok(!/attendees/.test(posts[0].parameters.jsonBody + code('Decidir')), 'evento não pode ter convidados');
  assert.ok(!/DELETE|PUT|PATCH|\/move|\/import|calendarList/.test(JSON.stringify(cal)), 'endpoint destrutivo no Calendar');
});

test('segurança: o único POST ao Gemini é o Classificar com IA, com chave no cabeçalho', () => {
  const ia = wf.nodes.filter(n => /generativelanguage\.googleapis\.com/.test(n.parameters.url || ''));
  assert.deepStrictEqual(ia.map(n => n.name), ['Classificar com IA']);
  const n = ia[0];
  assert.strictEqual(n.parameters.method, 'POST');
  assert.match(n.parameters.url, /:generateContent$/);
  assert.strictEqual(n.parameters.genericAuthType, 'httpHeaderAuth', 'chave deve ir no cabeçalho, nunca na URL');
  assert.ok(!/[?&]key=/.test(n.parameters.url));
  assert.strictEqual(n.maxTries, 3);
  assert.strictEqual(n.onError, 'continueRegularOutput');
  assert.ok(n.parameters.options.timeout >= 30000);
});

test('segurança: regras SEG idênticas às da Fase 2/3', () => {
  const seg = src => src.split('\n').filter(l => l.trim().startsWith("R('SEG-")).map(l => l.trim());
  const aqui = seg(code('Preparar'));
  const la = seg(fase23.nodes.find(n => n.name === 'Classificar').parameters.jsCode);
  assert.strictEqual(aqui.length, 5);
  assert.deepStrictEqual(aqui, la);
});

test('auditoria: aba agenda em RAW, nunca limpa, e cada ramo chega ao Montar linha', () => {
  const sheets = wf.nodes.filter(n => n.type === 'n8n-nodes-base.googleSheets');
  assert.strictEqual(sheets.length, 2);
  for (const n of sheets) {
    assert.strictEqual(n.parameters.documentId.value, 'COLE_AQUI_O_ID_DA_PLANILHA');
    assert.strictEqual(n.parameters.sheetName.value, 'agenda');
    assert.ok(!['clear', 'delete'].includes(n.parameters.operation), `${n.name} apaga dados`);
  }
  assert.strictEqual(byName('Salvar agenda').parameters.options.cellFormat, 'RAW');
  const chegam = Object.entries(wf.connections).flatMap(([de, c]) =>
    c.main.flatMap((saida, i) => saida.filter(d => d.node === 'Montar linha').map(() => `${de}:${i}`)));
  assert.deepStrictEqual(chegam.sort(), ['Apto e APLICAR?:1', 'Enviar à IA?:1', 'Registrar criação:0', 'status vazio?:1']);
  const apto = JSON.stringify(byName('Apto e APLICAR?').parameters);
  assert.match(apto, /"rightValue":"APLICAR"/);
});

test('ligação entre itens: nós Code devolvem pairedItem e Buscar no dia usa o item do Decidir', () => {
  for (const n of ['Filtrar novas', 'Preparar', 'Decidir', 'Verificar duplicado', 'Registrar criação']) {
    assert.match(code(n), /pairedItem/, n);
  }
  const q = JSON.stringify(byName('Buscar no dia').parameters);
  assert.match(q, /\$\('Decidir'\)\.item\.json\.diaMin/);
});

// ---------------------------------------------------------------- Filtrar novas

const filtrar = (messages, linhas, extra = {}) =>
  run(code('Filtrar novas'), [{ messages: messages.map(id => ({ id })) }], {
    Config: cfg(extra),
    'Ler aba agenda': linhas,
  });

test('Filtrar novas: aba vazia, ordem preservada e limite maxEmails', () => {
  const out = filtrar(['a', 'b', 'c'], [{}], { maxEmails: 2 });
  assert.deepStrictEqual(out.map(i => i.json), [{ id: 'a', tentativa: 1 }, { id: 'b', tentativa: 1 }]);
  assert.deepStrictEqual(out[1].pairedItem, { item: 0 });
});

test('Filtrar novas: histórico por modo e tentativas de erro', () => {
  const linhas = [
    { messageId: 'sim', modo: 'DRY_RUN', status: 'SIMULADO' },
    { messageId: 'criado', modo: 'APLICAR', status: 'CRIADO' },
    { messageId: 'e2', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e2', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_LEITURA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_AGENDA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
  ];
  const ids = ['sim', 'criado', 'e2', 'e3', 'cota'];
  const dry = Object.fromEntries(filtrar(ids, linhas).map(i => [i.json.id, i.json.tentativa]));
  assert.deepStrictEqual(dry, { e2: 3, cota: 1 }, 'DRY_RUN bloqueia qualquer modo; 3 erros descartam; cota não conta');
  const apl = Object.fromEntries(filtrar(ids, linhas, { modo: 'APLICAR' }).map(i => [i.json.id, i.json.tentativa]));
  assert.deepStrictEqual(apl, { sim: 1, e2: 1, e3: 1, cota: 1 }, 'APLICAR ignora linhas e erros do DRY_RUN');
  const xyz = filtrar(ids, linhas, { modo: 'xyz' }).map(i => i.json.id);
  assert.deepStrictEqual(xyz, ['e2', 'cota'], 'modo inválido vira DRY_RUN');
});

// ---------------------------------------------------------------- Preparar

const msg = (id, { from = 'Ana <ana@empresa.com>', subject = 'Reunião', plain, html, ics = false, messageId = '<abc@mail>', internalDate } = {}) => {
  const parts = [];
  if (plain !== undefined) parts.push({ mimeType: 'text/plain', body: { data: b64(plain) } });
  if (html !== undefined) parts.push({ mimeType: 'text/html', body: { data: b64(html) } });
  if (ics) parts.push({ mimeType: 'text/calendar', body: { data: b64('BEGIN:VCALENDAR') } });
  const headers = [{ name: 'From', value: from }, { name: 'Subject', value: subject }];
  if (messageId) headers.push({ name: 'Message-ID', value: messageId });
  return {
    id, threadId: 't' + id, internalDate: String(internalDate || Date.now()),
    payload: { mimeType: 'multipart/alternative', headers, parts: [{ mimeType: 'multipart/alternative', parts }] },
  };
};
const preparar = (msgs, extra = {}) =>
  run(code('Preparar'), msgs, {
    Config: cfg(extra),
    'Filtrar novas': msgs.map((m, i) => ({ id: m.id || 'err' + i, tentativa: 2 })),
  });

test('Preparar: extrai o corpo, converte HTML, trunca e monta o link do Gmail', () => {
  const [plain, html, longo, semId] = preparar([
    msg('1', { plain: 'Entrevista amanhã às 14h', html: '<p>ignorado</p>' }),
    msg('2', { html: '<style>.x{}</style><p>Prova&nbsp;dia 10</p><script>alert(1)</script><br>Sala &amp; bloco' }),
    msg('3', { plain: 'a'.repeat(9000) }),
    msg('4', { plain: 'oi', messageId: '' }),
  ], { maxCaracteres: 100 });
  assert.strictEqual(plain.json.corpo, 'Entrevista amanhã às 14h');
  assert.strictEqual(html.json.corpo, 'Prova dia 10\nSala & bloco');
  assert.strictEqual(longo.json.corpo.length, 100);
  assert.strictEqual(plain.json.linkGmail, 'https://mail.google.com/mail/#search/rfc822msgid:' + encodeURIComponent('abc@mail'));
  assert.strictEqual(semId.json.linkGmail, 'https://mail.google.com/mail/#all/t4');
  assert.strictEqual(plain.json.remetente, 'ana@empresa.com');
  assert.ok(plain.json.enviarIA && plain.json.requisicaoIA);
  assert.deepStrictEqual([plain, html, longo, semId].map(i => i.pairedItem.item), [0, 1, 2, 3]);
});

test('Preparar: convites e erros de leitura não vão para a IA', () => {
  const [convite, avisoAgenda, erro] = preparar([
    msg('1', { plain: 'convite', ics: true }),
    msg('2', { from: 'Google Agenda <calendar-notification@google.com>', plain: 'lembrete' }),
    { error: { message: 'rateLimitExceeded' } },
  ]);
  assert.strictEqual(convite.json.status, 'IGNORADO_CONVITE');
  assert.strictEqual(avisoAgenda.json.status, 'IGNORADO_CONVITE');
  assert.strictEqual(erro.json.status, 'ERRO_LEITURA');
  assert.strictEqual(erro.json.messageId, 'err2', 'id vem do Filtrar novas');
  assert.strictEqual(erro.json.tentativa, 2);
  for (const i of [convite, avisoAgenda, erro]) assert.ok(!i.json.enviarIA && !i.json.requisicaoIA);
});

test('Preparar: privacidade e mascaramento antes do Gemini', () => {
  const [google, codigo, ignorado, boleto] = preparar([
    msg('1', { from: 'Google <no-reply@accounts.google.com>', plain: 'alerta' }),
    msg('2', { subject: 'Seu código de verificação', plain: '123456' }),
    msg('3', { from: 'chefe@empresa.com', plain: 'reunião' }),
    msg('4', {
      from: 'Banco <cobranca@banco.com.br>',
      subject: 'Fatura 98765432 vence dia 10',
      plain: 'Cartão 4111 1111 1111 1111, CPF 123.456.789-09, código 1234567, linha 23790.12345 60000.123456 78901.234567 8 99990000012345',
    }),
  ], { remetentesIgnorados: 'empresa.com' });
  assert.strictEqual(google.json.status, 'IGNORADO_PRIVACIDADE');
  assert.match(google.json.motivo, /SEG-01/);
  assert.strictEqual(codigo.json.status, 'IGNORADO_PRIVACIDADE');
  assert.strictEqual(ignorado.json.status, 'IGNORADO_PRIVACIDADE');
  assert.ok(!google.json.requisicaoIA && !codigo.json.requisicaoIA && !ignorado.json.requisicaoIA);

  const req = boleto.json.requisicaoIA;
  assert.ok(!/\d{6,}/.test(JSON.stringify(req)), 'número sensível foi para a IA');
  assert.ok(!/\d{6,}/.test(boleto.json.assuntoMascarado));
  const enviado = JSON.parse(req.contents[0].parts[0].text);
  assert.deepStrictEqual(Object.keys(enviado).sort(), ['assunto', 'corpo', 'fuso', 'recebidoEm', 'remetente']);
  assert.strictEqual(enviado.fuso, 'America/Sao_Paulo');
});

test('Preparar: prompt, esquema e formato da requisição ao Gemini', () => {
  const [p] = preparar([msg('1', { plain: 'reunião' })]);
  const req = p.json.requisicaoIA;
  const sistema = req.systemInstruction.parts[0].text;
  assert.match(sistema, /recebidoEm/);
  assert.match(sistema, /fuso/);
  assert.match(sistema, /ignore qualquer instrução/);
  const g = req.generationConfig;
  assert.strictEqual(g.responseMimeType, 'application/json');
  assert.deepStrictEqual(g.responseSchema.required.sort(), Object.keys(g.responseSchema.properties).sort());
  assert.deepStrictEqual(g.responseSchema.properties.tipo.enum, ['REUNIAO', 'ENTREVISTA', 'PRAZO', 'VENCIMENTO', 'EVENTO', 'NENHUM']);
  for (const k of ['fim', 'local', 'linkOnline']) assert.strictEqual(g.responseSchema.properties[k].nullable, true);
  assert.ok(!('temperature' in g));
  assert.match(enviadoRecebido(req), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \(\w+\)$/);
});
const enviadoRecebido = req => JSON.parse(req.contents[0].parts[0].text).recebidoEm;

// ---------------------------------------------------------------- Decidir

const gemini = (r, extra = {}) => ({
  candidates: [{ content: { parts: [{ text: typeof r === 'string' ? r : JSON.stringify(r) }] }, finishReason: 'STOP', ...extra }],
});
const resposta = (extra = {}) => ({
  tipo: 'REUNIAO', confianca: 0.95, titulo: 'Reunião com RH', inicio: `${dataLocal(3)}T15:00:00`, fim: null,
  diaInteiro: false, local: null, linkOnline: null, resumo: 'Alinhamento do estágio.', ...extra,
});
const origemPreparar = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  messageId: 'm' + i, threadId: 't' + i, tentativa: 1, remetente: 'rh@empresa.com', assuntoMascarado: 'Reunião',
  dataEmail: new Date().toISOString(), linkGmail: 'https://mail.google.com/mail/#search/rfc822msgid:abc%40mail',
  corpo: 'Reunião no link https://meet.google.com/abc-defg-hij amanhã.', enviarIA: true, status: '', motivo: '',
  requisicaoIA: { grande: true }, ...extra,
}));
const decidir = (respostas, extra = {}) =>
  run(code('Decidir'), respostas, { Config: cfg(extra), Preparar: origemPreparar(respostas.length) }).map(i => i.json);

test('Decidir: respostas ruins viram ERRO_IA e falta de cota vira ERRO_COTA_IA', () => {
  const sem = resposta();
  delete sem.titulo;
  const out = decidir([
    { error: { message: 'Internal error', httpCode: '500' } },
    { error: { message: 'The service is receiving too many requests', httpCode: '429' } },
    { promptFeedback: { blockReason: 'SAFETY' } },
    gemini(resposta(), { finishReason: 'MAX_TOKENS' }),
    gemini('isto não é JSON'),
    gemini(sem),
    gemini(resposta({ confianca: 1.5 })),
    gemini(resposta({ tipo: 'FESTA' })),
  ]);
  assert.deepStrictEqual(out.map(o => o.status), [
    'ERRO_IA', 'ERRO_COTA_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA',
  ]);
  assert.ok(out.every(o => o.apto === false && o.motivo));
  assert.ok(out.every(o => !('requisicaoIA' in o)), 'requisição não deve seguir adiante');
});

test('Decidir: NENHUM, confiança baixa e saneamento do que veio da IA', () => {
  const [nada, baixa, ok, fora] = decidir([
    gemini(resposta({ tipo: 'NENHUM', titulo: '', inicio: '' })),
    gemini(resposta({ confianca: 0.79 })),
    gemini(resposta({ titulo: 'x'.repeat(300), linkOnline: 'https://meet.google.com/abc-defg-hij' })),
    gemini(resposta({ linkOnline: 'https://golpe.example.com/login' })),
  ]);
  assert.strictEqual(nada.status, 'SEM_EVENTO');
  assert.strictEqual(baixa.status, 'REVISAR');
  assert.strictEqual(ok.titulo.length, 120);
  assert.strictEqual(ok.eventoBody.location, 'https://meet.google.com/abc-defg-hij');
  assert.ok(!fora.eventoBody.location, 'link que não está no e-mail é descartado');
  assert.strictEqual(ok.linkGmail, origemPreparar(1)[0].linkGmail, 'campos de origem preservados');
  assert.strictEqual(ok.tentativa, 1);
  assert.strictEqual(ok.modeloIA, cfg().modeloIA);
});

test('Decidir: datas no passado, longe demais ou inválidas vão para revisão', () => {
  const out = decidir([
    gemini(resposta({ inicio: `${dataLocal(-2)}T10:00:00` })),
    gemini(resposta({ inicio: `${dataLocal(400)}T10:00:00` })),
    gemini(resposta({ inicio: '2026-02-30T10:00:00' })),
    gemini(resposta({ tipo: 'PRAZO', inicio: dataLocal(-1), diaInteiro: true })),
  ]);
  assert.deepStrictEqual(out.map(o => o.status), ['REVISAR', 'REVISAR', 'REVISAR', 'REVISAR']);
  assert.deepStrictEqual(out.map(o => o.motivo), ['data no passado', 'data a mais de 365 dias', 'data de início inválida', 'data no passado']);
});

test('Decidir: dia inteiro, vários dias e duração padrão no fuso configurado', () => {
  const hoje = dataLocal(0);
  const [prazo, varios, semFim, comFim] = decidir([
    gemini(resposta({ tipo: 'PRAZO', inicio: `${hoje}T23:59:00`, diaInteiro: false })),
    gemini(resposta({ tipo: 'EVENTO', inicio: dataLocal(5), fim: dataLocal(7), diaInteiro: true })),
    gemini(resposta()),
    gemini(resposta({ fim: `${dataLocal(3)}T16:30:00` })),
  ]);
  assert.strictEqual(prazo.status, 'SIMULADO', 'prazo de hoje continua válido');
  assert.deepStrictEqual([prazo.eventoBody.start, prazo.eventoBody.end], [{ date: hoje }, { date: dataLocal(1) }]);
  assert.deepStrictEqual(varios.eventoBody.end, { date: dataLocal(8) }, 'end.date é exclusivo');
  assert.deepStrictEqual(semFim.eventoBody.start, { dateTime: `${dataLocal(3)}T15:00:00`, timeZone: 'America/Sao_Paulo' });
  assert.deepStrictEqual(semFim.eventoBody.end, { dateTime: `${dataLocal(3)}T16:00:00`, timeZone: 'America/Sao_Paulo' });
  assert.strictEqual(comFim.eventoBody.end.dateTime, `${dataLocal(3)}T16:30:00`);
  assert.strictEqual(semFim.inicioEpoch, Date.parse(`${dataLocal(3)}T15:00:00-03:00`));
  assert.strictEqual(semFim.diaMin, `${dataLocal(3)}T00:00:00-03:00`);
  assert.strictEqual(semFim.diaMax, `${dataLocal(4)}T00:00:00-03:00`);
});

test('Decidir: evento montado sem convidados, com lembrete, link do e-mail e id de origem', () => {
  const [hora, dia] = decidir([
    gemini(resposta()),
    gemini(resposta({ tipo: 'VENCIMENTO', inicio: dataLocal(10), diaInteiro: true })),
  ]);
  const ev = hora.eventoBody;
  assert.strictEqual(ev.summary, 'Reunião com RH');
  assert.match(ev.description, /Alinhamento do estágio\./);
  assert.match(ev.description, /De: rh@empresa\.com/);
  assert.match(ev.description, /rfc822msgid:abc%40mail/);
  assert.ok(!('attendees' in ev));
  assert.deepStrictEqual(ev.extendedProperties.private, { gmailMessageId: 'm0', origem: 'gmail-sync' });
  assert.strictEqual(ev.reminders.overrides[0].minutes, 30);
  assert.strictEqual(dia.eventoBody.reminders.overrides[0].minutes, 1440);
  assert.strictEqual(hora.status, 'SIMULADO');
  assert.strictEqual(hora.modo, 'DRY_RUN');

  const [aplicar] = decidir([gemini(resposta())], { modo: 'APLICAR' });
  assert.deepStrictEqual([aplicar.status, aplicar.apto, aplicar.modo], ['', true, 'APLICAR']);
});

// ---------------------------------------------------------------- Verificar duplicado, Registrar criação, Montar linha

const decidido = (extra = {}) => ({
  ...origemPreparar(1)[0], modo: 'APLICAR', apto: true, status: '', diaInteiro: false,
  inicio: '2026-11-10T15:00:00', inicioEpoch: Date.parse('2026-11-10T15:00:00-03:00'),
  eventoBody: { summary: 'Reunião com RH!' }, ...extra,
});
const verificar = (porId, porDia, origens) =>
  run(code('Verificar duplicado'), porDia, { 'Buscar por messageId': porId, Decidir: origens }).map(i => i.json);

test('Verificar duplicado: acha pelo id do e-mail, por título e início, e para em erro', () => {
  const vazio = { items: [] };
  const out = verificar(
    [{ items: [{ id: 'ev1', status: 'cancelled' }] }, vazio, vazio, vazio, { error: { message: 'Forbidden' } }, vazio],
    [
      vazio,
      { items: [{ id: 'ev2', summary: 'reuniao com rh', start: { dateTime: '2026-11-10T15:00:00-03:00' } }] },
      { items: [{ id: 'ev3', summary: 'Reunião com RH', start: { dateTime: '2026-11-10T16:00:00-03:00' } }] },
      { items: [{ id: 'ev4', summary: 'Vencimento', start: { date: '2026-11-12' } }] },
      vazio,
      { error: { message: 'Not Found' } },
    ],
    [
      decidido(), decidido(), decidido(),
      decidido({ diaInteiro: true, inicio: '2026-11-12', eventoBody: { summary: 'Vencimento' } }),
      decidido(), decidido(),
    ]
  );
  assert.deepStrictEqual(out.map(o => o.status), ['DUPLICADO', 'DUPLICADO', '', 'DUPLICADO', 'ERRO_AGENDA', 'ERRO_AGENDA']);
  assert.strictEqual(out[2].linkGmail, decidido().linkGmail);
});

test('Registrar criação: CRIADO só com a confirmação do Google', () => {
  const out = run(code('Registrar criação'), [
    { id: 'ev9', htmlLink: 'https://www.google.com/calendar/event?eid=x' },
    { error: { message: 'Calendar usage limits exceeded' } },
  ], { 'Verificar duplicado': [decidido(), decidido()] });
  assert.deepStrictEqual(out.map(o => [o.json.status, o.json.eventId]), [['CRIADO', 'ev9'], ['ERRO_AGENDA', '']]);
  assert.match(out[1].json.motivo, /usage limits/);
  assert.deepStrictEqual(out.map(o => o.pairedItem.item), [0, 1]);
});

test('Montar linha: mesmas 20 colunas em qualquer desfecho', () => {
  const COLUNAS = ['timestamp', 'execucaoId', 'modo', 'messageId', 'remetente', 'assunto', 'dataEmail', 'tipo', 'confianca',
    'titulo', 'inicio', 'fim', 'diaInteiro', 'status', 'motivo', 'tentativa', 'eventId', 'linkEvento', 'linkGmail', 'modeloIA'];
  const out = run(code('Montar linha'), [
    { ...decidido({ modo: 'DRY_RUN' }), status: 'SIMULADO' },
    { messageId: 'x', tentativa: 1, status: 'ERRO_LEITURA', motivo: 'falhou', enviarIA: false },
    { ...decidido(), status: 'CRIADO', eventId: 'ev9', linkEvento: 'https://x' },
    { ...decidido(), status: 'DUPLICADO' },
  ], { Config: cfg() }).map(i => i.json);
  for (const linha of out) {
    assert.deepStrictEqual(Object.keys(linha), COLUNAS);
    assert.ok(Object.values(linha).every(v => v !== undefined && v !== null && typeof v !== 'object'));
  }
  assert.deepStrictEqual(out.map(l => l.status), ['SIMULADO', 'ERRO_LEITURA', 'CRIADO', 'DUPLICADO']);
  assert.strictEqual(out[1].modo, 'DRY_RUN');
  assert.strictEqual(out[0].assunto, 'Reunião');
  assert.strictEqual(out[0].execucaoId, '7');
});
