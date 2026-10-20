// Testes do gmail-sync (e-mails novos: resumo, marcador e evento na agenda). Executar com: node --test
// 1) Segurança: Gmail só lê e adiciona marcadores, Calendar só insere sem convidados, nada sensível vai ao Gemini.
// 2) Lógica: rodam o código dos nós Code com respostas simuladas do Gmail, do Gemini e do Calendar.
const { test } = require('node:test');
const assert = require('node:assert');
const wf = require('../workflows/gmail-sync.json');
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

const blocoRegras = src => src.match(/const R = [\s\S]*?\nconst PADRAO = [^\n]*\n/)[0];
const ROTULOS = [...new Set([...blocoRegras(code('Preparar')).matchAll(/'(\d\d-[^']+)'/g)].map(m => m[1]))];
const LABELS = { labels: ROTULOS.map((name, i) => ({ id: `Label_${i + 10}`, name })) };
const idDe = nome => LABELS.labels.find(l => l.name === nome).id;
const REVISAR = '00-INBOX-ZERO/03-REVISAR';

// ---------------------------------------------------------------- segurança e configuração

test('Config: DRY_RUN, só e-mails novos e marcadores no lugar dos IDs', () => {
  const c = cfg();
  assert.deepStrictEqual(Object.keys(c).sort(), [
    'calendarId', 'duracaoPadraoMin', 'execucaoId', 'fuso', 'inicioEm', 'limiarConfianca', 'maxCaracteres', 'maxEmails',
    'modeloIA', 'modo', 'query', 'remetentesIgnorados',
  ]);
  assert.strictEqual(c.modo, 'DRY_RUN');
  assert.strictEqual(c.calendarId, 'COLE_AQUI_O_ID_DA_AGENDA');
  assert.strictEqual(c.remetentesIgnorados, '');
  assert.match(c.modeloIA, /^gemini/);
  assert.ok(!isNaN(Date.parse(c.inicioEm)), 'inicioEm precisa ser uma data válida');
  assert.match(c.query, /newer_than:\d+d/);
  const q = byName('Listar mensagens').parameters.queryParameters.parameters.find(p => p.name === 'q').value;
  assert.match(q, /' after:' \+ Math\.floor\(new Date\(\$\('Config'\)\.first\(\)\.json\.inicioEm\)/, 'busca precisa respeitar inicioEm');
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

test('segurança: Gmail só lê e adiciona marcadores (batchModify sem remover)', () => {
  const gmail = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest' && /gmail\.googleapis\.com/.test(n.parameters.url));
  assert.strictEqual(gmail.length, 4);
  const posts = gmail.filter(n => n.parameters.method && n.parameters.method !== 'GET');
  assert.deepStrictEqual(posts.map(n => n.name), ['Aplicar marcadores']);
  assert.match(posts[0].parameters.url, /\/users\/me\/messages\/batchModify$/);
  assert.match(posts[0].parameters.jsonBody, /addLabelIds/);
  assert.ok(!/removeLabelIds/.test(posts[0].parameters.jsonBody), 'não pode remover marcadores (arquivar/ler)');
  for (const n of gmail.filter(n => !posts.includes(n))) {
    assert.ok(!/\/(modify|batchModify|trash|delete|send|import|insert)\b/.test(n.parameters.url), `${n.name} chama endpoint de escrita`);
  }
  assert.ok(!/\/(trash|delete|batchDelete|untrash)\b/.test(JSON.stringify(wf)), 'há endpoint destrutivo');
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

test('regras: as mesmas da Fase 2/3, e a IA nunca escolhe a quarentena', () => {
  const classificar = fase23.nodes.find(n => n.name === 'Classificar').parameters.jsCode;
  assert.strictEqual(blocoRegras(code('Preparar')), blocoRegras(classificar));
  const [p] = preparar([msg('1', { plain: 'oi' })]);
  const enumIA = p.json.requisicaoIA.generationConfig.responseSchema.properties.marcador.enum;
  assert.deepStrictEqual([...enumIA].sort(), [...ROTULOS].sort(), 'a IA escolhe entre os marcadores das regras');
  assert.ok(enumIA.includes(REVISAR));
  assert.ok(!enumIA.some(m => m.startsWith('99-')), 'quarentena na lista da IA');
});

test('auditoria: abas em RAW, nunca limpas, e cada ramo chega ao seu destino', () => {
  const sheets = Object.fromEntries(wf.nodes.filter(n => n.type === 'n8n-nodes-base.googleSheets').map(n => [n.name, n.parameters]));
  assert.deepStrictEqual(Object.keys(sheets).sort(), ['Ler histórico', 'Salvar aplicações', 'Salvar linha']);
  for (const p of Object.values(sheets)) {
    assert.strictEqual(p.documentId.value, 'COLE_AQUI_O_ID_DA_PLANILHA');
    assert.ok(!['clear', 'delete'].includes(p.operation), 'nó apaga dados');
  }
  assert.strictEqual(sheets['Ler histórico'].sheetName.value, 'emails_novos');
  assert.strictEqual(sheets['Salvar linha'].sheetName.value, 'emails_novos');
  assert.strictEqual(sheets['Salvar aplicações'].sheetName.value, 'aplicacoes');
  assert.strictEqual(sheets['Salvar linha'].options.cellFormat, 'RAW');
  assert.strictEqual(sheets['Salvar aplicações'].options.cellFormat, 'RAW');
  const chegam = destino => Object.entries(wf.connections).flatMap(([de, c]) =>
    c.main.flatMap((saida, i) => saida.filter(d => d.node === destino).map(() => `${de}:${i}`))).sort();
  assert.deepStrictEqual(chegam('Montar linha'), ['Apto e APLICAR?:1', 'Enviar à IA?:1', 'Registrar criação:0', 'status vazio?:1']);
  assert.deepStrictEqual(chegam('Agrupar por marcador'), ['Decidir:0', 'Enviar à IA?:1']);
  assert.match(JSON.stringify(byName('Apto e APLICAR?').parameters), /"rightValue":"APLICAR"/);
});

test('ligação entre itens: nós Code devolvem pairedItem e Buscar no dia usa o item do Decidir', () => {
  for (const n of ['Filtrar novas', 'Preparar', 'Decidir', 'Verificar duplicado', 'Registrar criação', 'Agrupar por marcador', 'Registrar aplicação']) {
    assert.match(code(n), /pairedItem/, n);
  }
  assert.match(JSON.stringify(byName('Buscar no dia').parameters), /\$\('Decidir'\)\.item\.json\.diaMin/);
});

// ---------------------------------------------------------------- Filtrar novas

const filtrar = (messages, linhas, extra = {}) =>
  run(code('Filtrar novas'), [{ messages: messages.map(id => ({ id })) }], {
    Config: cfg(extra),
    'Ler histórico': linhas,
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
    { messageId: 'promo', modo: 'DRY_RUN', status: 'SEM_RESUMO' },
    { messageId: 'e2', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e2', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_IA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_LEITURA' },
    { messageId: 'e3', modo: 'DRY_RUN', status: 'ERRO_AGENDA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
    { messageId: 'cota', modo: 'DRY_RUN', status: 'ERRO_COTA_IA' },
  ];
  const ids = ['sim', 'criado', 'promo', 'e2', 'e3', 'cota'];
  const dry = Object.fromEntries(filtrar(ids, linhas).map(i => [i.json.id, i.json.tentativa]));
  assert.deepStrictEqual(dry, { e2: 3, cota: 1 }, 'DRY_RUN bloqueia qualquer modo; 3 erros descartam; cota não conta');
  const apl = Object.fromEntries(filtrar(ids, linhas, { modo: 'APLICAR' }).map(i => [i.json.id, i.json.tentativa]));
  assert.deepStrictEqual(apl, { sim: 1, promo: 1, e2: 1, e3: 1, cota: 1 }, 'APLICAR ignora linhas e erros do DRY_RUN');
  const xyz = filtrar(ids, linhas, { modo: 'xyz' }).map(i => i.json.id);
  assert.deepStrictEqual(xyz, ['e2', 'cota'], 'modo inválido vira DRY_RUN');
});

// ---------------------------------------------------------------- Preparar

const msg = (id, { from = 'Ana <ana@empresa.com>', subject = 'Reunião', plain, html, ics = false, messageId = '<abc@mail>', labelIds = ['INBOX'], extra = [] } = {}) => {
  const parts = [];
  if (plain !== undefined) parts.push({ mimeType: 'text/plain', body: { data: b64(plain) } });
  if (html !== undefined) parts.push({ mimeType: 'text/html', body: { data: b64(html) } });
  if (ics) parts.push({ mimeType: 'text/calendar', body: { data: b64('BEGIN:VCALENDAR') } });
  const headers = [{ name: 'From', value: from }, { name: 'Subject', value: subject }, ...extra];
  if (messageId) headers.push({ name: 'Message-ID', value: messageId });
  return {
    id, threadId: 't' + id, internalDate: String(Date.now()), labelIds,
    payload: { mimeType: 'multipart/alternative', headers, parts: [{ mimeType: 'multipart/alternative', parts }] },
  };
};
const preparar = (msgs, extra = {}) =>
  run(code('Preparar'), msgs, {
    Config: cfg(extra),
    'Listar labels': LABELS,
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

test('Preparar: marcador pela regra; sem regra, a IA decide depois', () => {
  const unsub = [{ name: 'List-Unsubscribe', value: '<mailto:x>' }];
  const [ciee, desconhecido, promo, social, relatorio] = preparar([
    msg('1', { from: 'CIEE <vagas@cieepr.org.br>', plain: 'Entrevista dia 10' }),
    msg('2', { from: 'loja@desconhecida.com', plain: 'Seu pedido' }),
    msg('3', { from: 'oferta@loja.com', plain: 'Promoção', labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'], extra: unsub }),
    msg('4', { from: 'x@service.tiktok.com', plain: 'curtiu' }),
    msg('5', { from: 'eu@gmail.com', subject: '[Gmail] Resumo diário – 20/10/2026', plain: 'relatório' }),
  ]);
  assert.deepStrictEqual(
    [ciee.json.marcador, ciee.json.origemMarcador, ciee.json.labelId, ciee.json.statusMarcador, ciee.json.enviarIA],
    ['20-TRABALHO/Projetos', 'REGRA', idDe('20-TRABALHO/Projetos'), 'SIMULADO', true],
    'regra decide o marcador, mas o e-mail ainda vai para o resumo'
  );
  assert.deepStrictEqual([desconhecido.json.marcador, desconhecido.json.labelId, desconhecido.json.enviarIA], ['', '', true]);
  for (const [item, rotulo] of [[promo, '30-NEWSLETTERS/Promoções'], [social, '40-NOTIFICACOES/Redes sociais'], [relatorio, '40-NOTIFICACOES/Sistemas']]) {
    assert.strictEqual(item.json.status, 'SEM_RESUMO');
    assert.strictEqual(item.json.marcador, rotulo);
    assert.ok(!item.json.enviarIA && !item.json.requisicaoIA, `${rotulo} não vai para a IA`);
  }
  const [aplicar] = preparar([msg('1', { from: 'vagas@cieepr.org.br', plain: 'x' })], { modo: 'APLICAR' });
  assert.strictEqual(aplicar.json.statusMarcador, 'PENDENTE');
});

test('Preparar: convites e erros de leitura não vão para a IA', () => {
  const [convite, avisoAgenda, erro] = preparar([
    msg('1', { plain: 'convite', ics: true }),
    msg('2', { from: 'Google Agenda <calendar-notification@google.com>', plain: 'lembrete' }),
    { error: { message: 'rateLimitExceeded' } },
  ]);
  assert.strictEqual(convite.json.status, 'IGNORADO_CONVITE');
  assert.strictEqual(convite.json.marcador, REVISAR);
  assert.strictEqual(avisoAgenda.json.status, 'IGNORADO_CONVITE');
  assert.strictEqual(erro.json.status, 'ERRO_LEITURA');
  assert.strictEqual(erro.json.messageId, 'err2', 'id vem do Filtrar novas');
  assert.strictEqual(erro.json.tentativa, 2);
  assert.strictEqual(erro.json.labelId, '', 'sem leitura, sem marcador');
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
  assert.strictEqual(google.json.marcador, '60-SEGURANCA/Alertas', 'alerta de segurança ainda recebe o marcador');
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
  assert.match(sistema, /resumo/);
  for (const m of ROTULOS) assert.ok(sistema.includes(m), `prompt não explica o marcador ${m}`);
  const g = req.generationConfig;
  assert.strictEqual(g.responseMimeType, 'application/json');
  assert.deepStrictEqual([...g.responseSchema.required].sort(), Object.keys(g.responseSchema.properties).sort());
  assert.deepStrictEqual(g.responseSchema.properties.tipo.enum, ['REUNIAO', 'ENTREVISTA', 'PRAZO', 'VENCIMENTO', 'EVENTO', 'NENHUM']);
  for (const k of ['fim', 'local', 'linkOnline']) assert.strictEqual(g.responseSchema.properties[k].nullable, true);
  assert.ok(!('temperature' in g));
  assert.match(JSON.parse(req.contents[0].parts[0].text).recebidoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} \(\w+\)$/);
});

// ---------------------------------------------------------------- Decidir

const gemini = (r, extra = {}) => ({
  candidates: [{ content: { parts: [{ text: typeof r === 'string' ? r : JSON.stringify(r) }] }, finishReason: 'STOP', ...extra }],
});
const resposta = (extra = {}) => ({
  resumo: 'Alinhamento do estágio.', marcador: '20-TRABALHO/Projetos', confiancaMarcador: 0.9,
  tipo: 'REUNIAO', confianca: 0.95, titulo: 'Reunião com RH', inicio: `${dataLocal(3)}T15:00:00`, fim: null,
  diaInteiro: false, local: null, linkOnline: null, ...extra,
});
const [modeloPreparar] = preparar([msg('0', { plain: 'x' })]);
const origemPreparar = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  messageId: 'm' + i, threadId: 't' + i, tentativa: 1, remetente: 'rh@empresa.com', assuntoMascarado: 'Reunião',
  dataEmail: new Date().toISOString(), linkGmail: 'https://mail.google.com/mail/#search/rfc822msgid:abc%40mail',
  categoria: 'SEM_CATEGORIA', regraId: 'PADRAO', marcador: '', origemMarcador: '', labelId: '', statusMarcador: '', resumo: '',
  corpo: 'Reunião no link https://meet.google.com/abc-defg-hij amanhã.', enviarIA: true, status: '', motivo: '',
  requisicaoIA: modeloPreparar.json.requisicaoIA, ...extra,
}));
const decidir = (respostas, extra = {}, origem = {}) =>
  run(code('Decidir'), respostas, {
    Config: cfg(extra), 'Listar labels': LABELS, Preparar: origemPreparar(respostas.length, origem),
  }).map(i => i.json);

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
    gemini(resposta({ confiancaMarcador: -1 })),
  ]);
  assert.deepStrictEqual(out.map(o => o.status), [
    'ERRO_IA', 'ERRO_COTA_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA', 'ERRO_IA',
  ]);
  assert.ok(out.every(o => o.apto === false && o.motivo));
  assert.ok(out.every(o => !('requisicaoIA' in o)), 'requisição não deve seguir adiante');
  assert.ok(out.every(o => o.labelId === ''), 'sem resposta da IA e sem regra, o marcador espera a nova tentativa');
  const [comRegra] = decidir([{ error: { message: 'x' } }], {}, {
    marcador: '20-TRABALHO/Projetos', origemMarcador: 'REGRA', labelId: idDe('20-TRABALHO/Projetos'), statusMarcador: 'SIMULADO',
  });
  assert.strictEqual(comRegra.labelId, idDe('20-TRABALHO/Projetos'), 'marcador da regra vale mesmo com a IA fora');
});

test('Decidir: marcador da IA só com confiança, nunca acima da regra', () => {
  const [ia, incerto, inventado] = decidir([
    gemini(resposta()),
    gemini(resposta({ confiancaMarcador: 0.5 })),
    gemini(resposta({ marcador: '99-REVISAR-EXCLUSAO' })),
  ]);
  assert.deepStrictEqual([ia.marcador, ia.origemMarcador, ia.labelId, ia.statusMarcador],
    ['20-TRABALHO/Projetos', 'IA', idDe('20-TRABALHO/Projetos'), 'SIMULADO']);
  assert.deepStrictEqual([incerto.marcador, incerto.origemMarcador], [REVISAR, 'PADRAO']);
  assert.deepStrictEqual([inventado.marcador, inventado.origemMarcador], [REVISAR, 'PADRAO'], 'marcador fora da lista é ignorado');
  const [regra] = decidir([gemini(resposta({ marcador: '30-NEWSLETTERS/Promoções' }))], {}, {
    marcador: '50-FINANCEIRO/Faturas', origemMarcador: 'REGRA', labelId: idDe('50-FINANCEIRO/Faturas'), statusMarcador: 'SIMULADO',
  });
  assert.strictEqual(regra.marcador, '50-FINANCEIRO/Faturas', 'regra vence a IA');
  assert.strictEqual(regra.resumo, 'Alinhamento do estágio.');
  const [aplicar] = decidir([gemini(resposta())], { modo: 'APLICAR' });
  assert.strictEqual(aplicar.statusMarcador, 'PENDENTE');
});

test('Decidir: NENHUM, confiança baixa e saneamento do que veio da IA', () => {
  const [nada, baixa, ok, fora] = decidir([
    gemini(resposta({ tipo: 'NENHUM', titulo: '', inicio: '' })),
    gemini(resposta({ confianca: 0.79 })),
    gemini(resposta({ titulo: 'x'.repeat(300), linkOnline: 'https://meet.google.com/abc-defg-hij' })),
    gemini(resposta({ linkOnline: 'https://golpe.example.com/login' })),
  ]);
  assert.strictEqual(nada.status, 'SEM_EVENTO');
  assert.strictEqual(nada.resumo, 'Alinhamento do estágio.', 'resumo vale mesmo sem compromisso');
  assert.strictEqual(nada.marcador, '20-TRABALHO/Projetos');
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

// ---------------------------------------------------------------- marcadores no Gmail

test('Agrupar por marcador: nada em DRY_RUN; em APLICAR, uma chamada por marcador', () => {
  const itens = [
    { messageId: 'a', labelId: 'L1', marcador: 'X' },
    { messageId: 'b', labelId: '', marcador: '' },
    { messageId: 'c', labelId: 'L2', marcador: 'Y' },
    { messageId: 'd', labelId: 'L1', marcador: 'X' },
  ];
  assert.deepStrictEqual(run(code('Agrupar por marcador'), itens, { Config: cfg() }), []);
  const out = run(code('Agrupar por marcador'), itens, { Config: cfg({ modo: 'APLICAR' }) });
  assert.deepStrictEqual(out.map(o => o.json), [
    { labelId: 'L1', label: 'X', ids: ['a', 'd'], total: 2 },
    { labelId: 'L2', label: 'Y', ids: ['c'], total: 1 },
  ]);
  assert.deepStrictEqual(out[0].pairedItem, [{ item: 0 }, { item: 3 }]);
});

test('Registrar aplicação: CONFIRMADO só quando o Gmail aceita', () => {
  const grupos = [{ labelId: 'L1', label: 'X', ids: ['a', 'd'], total: 2 }, { labelId: 'L2', label: 'Y', ids: ['c'], total: 1 }];
  const out = run(code('Registrar aplicação'), [{}, { error: { message: 'Invalid label' } }], {
    Config: cfg(), 'Agrupar por marcador': grupos,
  }).map(o => o.json);
  assert.deepStrictEqual(out.map(o => [o.status, o.messageIds]), [['CONFIRMADO', 'a,d'], ['ERRO', 'c']]);
  assert.match(out[1].erro, /Invalid label/);
  const colunasFase23 = ['timestamp', 'execucaoId', 'label', 'labelId', 'total', 'status', 'erro', 'messageIds'];
  assert.deepStrictEqual(Object.keys(out[0]), colunasFase23, 'mesmas colunas da aba aplicacoes da Fase 2/3');
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

test('Montar linha: mesmas colunas em qualquer desfecho', () => {
  const COLUNAS = ['timestamp', 'execucaoId', 'modo', 'messageId', 'remetente', 'assunto', 'dataEmail', 'categoria', 'resumo',
    'marcador', 'origemMarcador', 'regraId', 'statusMarcador', 'tipo', 'confianca', 'titulo', 'inicio', 'fim', 'diaInteiro',
    'status', 'motivo', 'tentativa', 'eventId', 'linkEvento', 'linkGmail', 'modeloIA'];
  const out = run(code('Montar linha'), [
    { ...decidido({ modo: 'DRY_RUN' }), status: 'SIMULADO', resumo: 'Reunião marcada.' },
    { messageId: 'x', tentativa: 1, status: 'ERRO_LEITURA', motivo: 'falhou', enviarIA: false },
    { ...decidido(), status: 'CRIADO', eventId: 'ev9', linkEvento: 'https://x' },
    { ...origemPreparar(1)[0], status: 'SEM_RESUMO', marcador: '30-NEWSLETTERS/Promoções', requisicaoIA: undefined },
  ], { Config: cfg() }).map(i => i.json);
  for (const linha of out) {
    assert.deepStrictEqual(Object.keys(linha), COLUNAS);
    assert.ok(Object.values(linha).every(v => v !== undefined && v !== null && typeof v !== 'object'));
  }
  assert.deepStrictEqual(out.map(l => l.status), ['SIMULADO', 'ERRO_LEITURA', 'CRIADO', 'SEM_RESUMO']);
  assert.strictEqual(out[0].resumo, 'Reunião marcada.');
  assert.strictEqual(out[1].modo, 'DRY_RUN');
  assert.strictEqual(out[0].assunto, 'Reunião');
  assert.strictEqual(out[0].execucaoId, '7');
});
