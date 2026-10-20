// Nó n8n: "Codificar e-mail" (workflow gmail-relatorios.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Monta a mensagem MIME (RFC 2822) e codifica em base64url, formato exigido pela Gmail API
const to = $('Obter meu e-mail').first().json.emailAddress;
const { html, assunto } = $('Montar e-mail').first().json;
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const mime = [
  `To: ${to}`,
  `From: ${to}`,
  `Subject: =?UTF-8?B?${b64(assunto)}?=`,
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64(html).replace(/.{76}/g, '$&\r\n'),
].join('\r\n');
const raw = b64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
return [{ json: { para: to, raw } }];
