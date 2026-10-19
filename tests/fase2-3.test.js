// Testes da Fase 2/3 (classificar e aplicar marcadores). Executar com: node --test
const { test } = require('node:test');
const assert = require('node:assert');
const wf = require('../workflows/fase2-3-classificar-aplicar.json');

const byName = n => wf.nodes.find(x => x.name === n);
const code = n => byName(n).parameters.jsCode;
const run = (src, items, refs = {}) =>
  new Function('$input', '$', src)(
    { all: () => items.map(json => ({ json })) },
    name => ({ first: () => ({ json: refs[name] }), all: () => (refs[name] || []).map(json => ({ json })) })
  );

const LABELS = [
  '00-INBOX-ZERO/03-REVISAR', '10-PESSOAL/Documentos', '10-PESSOAL/Saúde', '30-NEWSLETTERS/Ler-depois',
  '30-NEWSLETTERS/Promoções', '40-NOTIFICACOES/Redes sociais', '40-NOTIFICACOES/Ferramentas',
  '40-NOTIFICACOES/Sistemas', '50-FINANCEIRO/Faturas', '60-SEGURANCA/Alertas', '60-SEGURANCA/Login',
  '60-SEGURANCA/Recuperacao', '99-REVISAR-EXCLUSAO',
].map((name, i) => ({ id: `Label_${i + 10}`, name }));

const msg = (id, from, subject, labelIds = ['INBOX'], extra = []) => ({
  id, threadId: 't' + id, internalDate: String(Date.now()), labelIds,
  payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }, ...extra] },
});
const unsub = [{ name: 'List-Unsubscribe', value: '<mailto:x>' }];

const classificar = (msgs, modo = 'DRY_RUN') =>
  run(code('Classificar'), msgs, {
    Config: { modo, execucaoId: '42' },
    'Listar labels': { labels: LABELS },
  }).map(i => i.json);

test('segurança: único POST é batchModify, e só adiciona marcadores', () => {
  const http = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  const posts = http.filter(n => n.parameters.method && n.parameters.method !== 'GET');
  assert.deepStrictEqual(posts.map(n => n.name), ['Aplicar marcadores']);
  assert.match(posts[0].parameters.url, /\/messages\/batchModify$/);
  assert.ok(!/removeLabelIds/.test(posts[0].parameters.jsonBody), 'não pode remover marcadores (arquivar/ler)');
  const tudo = JSON.stringify(wf);
  assert.ok(!/\/(trash|delete|batchDelete|untrash)\b/.test(tudo), 'há endpoint destrutivo');
});

test('segurança: nenhuma regra usa a quarentena 99-REVISAR-EXCLUSAO', () => {
  const src = code('Classificar');
  const usados = [...src.matchAll(/R\('[^']+', '([^']+)'/g), ...src.matchAll(/label: '([^']+)'/g)].map(m => m[1]);
  assert.ok(usados.length >= 10, 'regras não encontradas');
  assert.ok(!usados.some(l => l.startsWith('99-')), `regra aponta para a quarentena: ${usados}`);
});

test('segurança: modo padrão é DRY_RUN e só lê e-mails sem marcador', () => {
  const a = Object.fromEntries(byName('Config').parameters.assignments.assignments.map(x => [x.name, x.value]));
  assert.strictEqual(a.modo, 'DRY_RUN');
  assert.match(a.query, /has:nouserlabels/);
  assert.ok(a.maxAcoes <= 200, 'lote acima de 200');
  assert.ok(!wf.nodes.some(n => /scheduleTrigger|cron/i.test(n.type)), 'há gatilho automático');
});

test('regras protegidas vencem promoções e newsletters', () => {
  const [copel, google, promo, codigo] = classificar([
    msg('1', 'fatura.digital@faturamento.copel.com', 'FATURA DIGITAL', ['INBOX', 'CATEGORY_PROMOTIONS'], unsub),
    msg('2', 'Google <no-reply@accounts.google.com>', 'Alerta de segurança', ['INBOX', 'CATEGORY_UPDATES'], unsub),
    msg('3', 'Shopee <info@mail.shopee.com.br>', 'Ofertas 123456', ['INBOX', 'CATEGORY_PROMOTIONS'], unsub),
    msg('4', 'Loja <news@loja.com>', 'Seu código de verificação é 482913', ['INBOX', 'CATEGORY_PROMOTIONS'], unsub),
  ]);
  assert.strictEqual(copel.labelSugerido, '50-FINANCEIRO/Faturas');
  assert.strictEqual(copel.recomendacao, 'PROTEGIDO');
  assert.strictEqual(google.labelSugerido, '60-SEGURANCA/Alertas');
  assert.strictEqual(promo.labelSugerido, '30-NEWSLETTERS/Promoções');
  assert.strictEqual(codigo.labelSugerido, '60-SEGURANCA/Login');
  assert.ok(!/\d{6}/.test(promo.assunto + codigo.assunto), 'código não mascarado na auditoria');
});

test('sem regra vai para 03-REVISAR com confiança BAIXA', () => {
  const [x] = classificar([msg('9', 'Fulano <fulano@exemplo.com>', 'Oi, tudo bem?')]);
  assert.strictEqual(x.labelSugerido, '00-INBOX-ZERO/03-REVISAR');
  assert.strictEqual(x.recomendacao, 'REVISAR');
  assert.strictEqual(x.confianca, 'BAIXA');
  assert.strictEqual(x.status, 'SIMULADO');
});

test('DRY_RUN não gera nenhuma ação; APLICAR agrupa por marcador', () => {
  const msgs = [msg('1', 'a@shopee.com.br', 'x'), msg('2', 'b@shopee.com.br', 'y'), msg('3', 'c@exemplo.com', 'z')];
  const dry = classificar(msgs, 'DRY_RUN');
  assert.deepStrictEqual(run(code('Agrupar por marcador'), [], { Config: { modo: 'DRY_RUN' }, Classificar: dry }), []);
  const real = classificar(msgs, 'APLICAR');
  const grupos = run(code('Agrupar por marcador'), [], { Config: { modo: 'APLICAR' }, Classificar: real }).map(i => i.json);
  const promo = grupos.find(g => g.label === '30-NEWSLETTERS/Promoções');
  assert.deepStrictEqual(promo.ids, ['1', '2']);
  assert.ok(grupos.every(g => g.ids.length <= 1000));
});

test('marcador inexistente vira erro na auditoria e não é aplicado', () => {
  const [x] = run(code('Classificar'), [msg('1', 'a@shopee.com.br', 'x')], {
    Config: { modo: 'APLICAR', execucaoId: '1' }, 'Listar labels': { labels: [] },
  }).map(i => i.json);
  assert.match(x.status, /^ERRO/);
  const grupos = run(code('Agrupar por marcador'), [], { Config: { modo: 'APLICAR' }, Classificar: [x] });
  assert.strictEqual(grupos.length, 0);
});
