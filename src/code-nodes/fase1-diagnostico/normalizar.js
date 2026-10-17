// Nó n8n: "Normalizar" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Normaliza os metadados de cada e-mail. Somente leitura: nada é alterado no Gmail.
const labelsResp = $('Listar labels').first().json.labels || [];
const labelMap = Object.fromEntries(labelsResp.map(l => [l.id, l.name]));
const attachmentIds = new Set($('Juntar IDs com anexo').first().json.attachmentIds || []);
const cfg = $('Config').first().json;
const bigBytes = cfg.bigSizeMB * 1024 * 1024;
const oldMs = cfg.oldYears * 365.25 * 24 * 3600 * 1000;
const agora = Date.now();

const header = (headers, name) => {
  const h = headers.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
};
const parseFrom = (from) => {
  const m = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : from).trim().toLowerCase();
  const nome = (m ? m[1] : '').replace(/^"|"$/g, '').trim();
  return { nome, email };
};
// Mascara sequências de 6 a 8 dígitos (códigos de verificação) antes de gravar na planilha
const mascarar = (s) => String(s || '').replace(/\b\d{6,8}\b/g, '••••••');

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (!j.id || j.error) continue;
  const headers = (j.payload && j.payload.headers) || [];
  const { nome, email } = parseFrom(header(headers, 'From'));
  const dominio = email.includes('@') ? email.split('@')[1] : '';
  const ts = Number(j.internalDate);
  const data = new Date(ts);
  const labelIds = j.labelIds || [];
  const labelsUsuario = labelIds.filter(id => id.startsWith('Label_')).map(id => labelMap[id] || id);
  const categoriaGmail = (labelIds.find(id => id.startsWith('CATEGORY_')) || '').replace('CATEGORY_', '');
  const listUnsub = header(headers, 'List-Unsubscribe');
  const listId = header(headers, 'List-Id');
  const precedence = header(headers, 'Precedence').toLowerCase();
  const autoSub = header(headers, 'Auto-Submitted').toLowerCase();
  const isNewsletter = !!(listUnsub || listId) || precedence === 'bulk' || precedence === 'list';
  const isNoReply = /no-?reply|notifica|notification|alert|mailer-daemon|bounce/.test(email);
  const temAnexo = attachmentIds.has(j.id);

  out.push({ json: {
    messageId: j.id,
    threadId: j.threadId,
    data: data.toISOString(),
    ano: data.getFullYear(),
    remetenteNome: nome,
    remetenteEmail: email,
    dominio,
    destinatario: header(headers, 'To').slice(0, 200),
    assunto: mascarar(header(headers, 'Subject')).slice(0, 300),
    trecho: mascarar(j.snippet).slice(0, 200),
    labels: labelIds.map(id => labelMap[id] || id).join(', '),
    labelsUsuario: labelsUsuario.join(', '),
    semLabelUsuario: labelsUsuario.length === 0,
    categoriaGmail,
    naInbox: labelIds.includes('INBOX'),
    naoLido: labelIds.includes('UNREAD'),
    temAnexo,
    tamanhoMB: Math.round(((j.sizeEstimate || 0) / 1048576) * 100) / 100,
    anexoGrande: temAnexo && (j.sizeEstimate || 0) >= bigBytes,
    isNewsletter,
    isAutomatico: isNoReply || (!!autoSub && autoSub !== 'no'),
    temListUnsubscribe: !!listUnsub,
    antigo: (agora - ts) > oldMs,
    linkGmail: `https://mail.google.com/mail/u/0/#all/${j.threadId}`,
    coletadoEm: new Date().toISOString(),
  }});
}
return out;
