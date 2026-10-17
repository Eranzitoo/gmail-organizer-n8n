// Testes executados com: node --test
// 1) Segurança: garantem que a Fase 1 não contém nenhuma operação de escrita no Gmail.
// 2) Lógica: rodam o código dos nós Code com mensagens simuladas da Gmail API.
const { test } = require('node:test');
const assert = require('node:assert');
const wf = require('../workflows/fase1-diagnostico.json');

const byName = n => wf.nodes.find(x => x.name === n);
const code = n => byName(n).parameters.jsCode;
const run = (src, items, refs = {}) =>
  new Function('$input', '$', src)(
    { all: () => items.map(json => ({ json })) },
    name => ({ first: () => ({ json: refs[name] }) })
  );

test('segurança: leitura só com GET; único POST é o envio do relatório', () => {
  const http = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  const posts = http.filter(n => n.parameters.method && n.parameters.method !== 'GET');
  assert.deepStrictEqual(posts.map(n => n.name), ['Enviar relatório']);
  assert.match(posts[0].parameters.url, /\/users\/me\/messages\/send$/);
  for (const n of http.filter(n => !posts.includes(n))) {
    assert.match(n.parameters.url, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/(labels|messages|profile)/, n.name);
    assert.ok(!/\/(modify|trash|delete|batchModify|batchDelete|send|import|insert)\b/.test(n.parameters.url), `${n.name} chama endpoint de escrita`);
  }
});

test('segurança: nó Gmail nativo (escopo amplo) não é usado', () => {
  assert.ok(!wf.nodes.some(n => n.type === 'n8n-nodes-base.gmail' && !n.disabled));
});

test('segurança: sem gatilho automático e sem segredos no JSON', () => {
  assert.ok(!wf.nodes.some(n => /scheduleTrigger|cron|gmailTrigger/i.test(n.type)), 'há gatilho automático');
  assert.ok(!/GOCSPX-|client_secret|ya29\.|refresh_token/.test(JSON.stringify(wf)), 'possível segredo no JSON');
});

const now = Date.now();
const mensagens = [
  { id: 'a1', threadId: 't1', internalDate: String(now - 864e5), sizeEstimate: 8e6, snippet: 'Seu código é 483920',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES', 'Label_1'],
    payload: { headers: [{ name: 'From', value: '"Banco X" <no-reply@banco.com>' }, { name: 'Subject', value: 'Código 123456' }] } },
  { id: 'a2', threadId: 't2', internalDate: String(now - 5 * 365 * 864e5), sizeEstimate: 2e4, snippet: 'Promo',
    labelIds: ['CATEGORY_PROMOTIONS'],
    payload: { headers: [{ name: 'From', value: 'loja@news.loja.com' }, { name: 'List-Unsubscribe', value: '<mailto:x>' }] } },
  { error: { message: 'falha simulada' } },
];
const refs = {
  'Listar labels': { labels: [{ id: 'Label_1', name: 'Bancos' }] },
  'Juntar IDs com anexo': { attachmentIds: ['a1'] },
  'Config': { bigSizeMB: 5, oldYears: 3 },
};

test('Normalizar: extrai campos, mascara códigos e ignora erros', () => {
  const out = run(code('Normalizar'), mensagens, refs).map(i => i.json);
  assert.strictEqual(out.length, 2);
  const [banco, loja] = out;
  assert.strictEqual(banco.remetenteEmail, 'no-reply@banco.com');
  assert.strictEqual(banco.dominio, 'banco.com');
  assert.strictEqual(banco.labelsUsuario, 'Bancos');
  assert.ok(!/\d{6}/.test(banco.assunto + banco.trecho), 'código não foi mascarado');
  assert.strictEqual(banco.anexoGrande, true);
  assert.strictEqual(banco.isAutomatico, true);
  assert.strictEqual(loja.isNewsletter, true);
  assert.strictEqual(loja.antigo, true);
  assert.strictEqual(loja.naInbox, false);
});

test('Agregar relatório e Montar e-mail: geram seções e HTML escapado', () => {
  const norm = run(code('Normalizar'), mensagens, refs).map(i => i.json);
  const agg = run(code('Agregar relatório'), norm).map(i => i.json);
  const secoes = new Set(agg.map(r => r.secao));
  for (const s of ['RESUMO', 'TOP_REMETENTES', 'TOP_DOMINIOS', 'POR_ANO', 'TOP_NEWSLETTERS', 'ANEXOS_GRANDES']) {
    assert.ok(secoes.has(s), `faltou a seção ${s}`);
  }
  assert.strictEqual(agg.find(r => r.item === 'Total analisado').quantidade, 2);
  const html = run(code('Montar e-mail'), [...agg, { secao: 'X', item: '<script>', quantidade: 1, detalhe: '' }])[0].json.html;
  assert.ok(!html.includes('<script>'), 'HTML não escapado');
});

test('Codificar e-mail: envia só para o próprio endereço, em MIME válido', () => {
  const out = run(code('Codificar e-mail'), [], {
    'Obter meu e-mail': { emailAddress: 'eu@gmail.com' },
    'Montar e-mail': { html: '<p>Relatório ção</p>', assunto: '[Gmail] Diagnóstico – teste' },
  })[0].json;
  assert.strictEqual(out.para, 'eu@gmail.com');
  assert.match(out.raw, /^[A-Za-z0-9_-]+$/, 'raw não está em base64url');
  const mime = Buffer.from(out.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.match(mime, /^To: eu@gmail\.com\r\nFrom: eu@gmail\.com\r\n/);
  const corpo = Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.strictEqual(corpo, '<p>Relatório ção</p>');
});

test('relatório: cada execução grava numa aba nova com data e hora', () => {
  const cfg = byName('Config').parameters.assignments.assignments.find(a => a.name === 'abaRelatorio');
  assert.match(cfg.value, /^=relatorio_\{\{ \$now/);
  assert.strictEqual(byName('Criar aba da execução').parameters.operation, 'create');
  assert.match(byName('Salvar relatório').parameters.sheetName.value, /abaRelatorio/);
  const rows = [{ secao: 'RESUMO', item: 'Total analisado', quantidade: 1 }];
  const out = new Function('$', code('Repassar linhas'))(() => ({ all: () => rows.map(json => ({ json })) }));
  assert.deepStrictEqual(out.map(i => i.json), rows);
});
