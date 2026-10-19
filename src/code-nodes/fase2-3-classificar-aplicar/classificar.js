// Nó n8n: "Classificar" (workflow fase2-3-classificar-aplicar.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// =====================================================================
// REGRAS DE CLASSIFICAÇÃO — a ordem importa: a PRIMEIRA regra que casar vence.
// Regras PROTEGIDAS vêm primeiro, para nunca perderem para promoção/newsletter.
// Nenhuma regra usa 99-REVISAR-EXCLUSAO: a quarentena só entra na Etapa A, após aprovação.
// =====================================================================
const R = (id, label, recomendacao, cond, confianca = 'ALTA') => ({ id, label, recomendacao, confianca, ...cond });
const REGRAS = [
  R('SEG-01', '60-SEGURANCA/Alertas', 'PROTEGIDO', { from: /accounts\.google\.com|accountprotection\.microsoft\.com/ }),
  R('SEG-02', '60-SEGURANCA/Login', 'PROTEGIDO', { from: /mail\.accounts\.riotgames\.com|id\.supercell\.com/ }),
  R('SEG-03', '60-SEGURANCA/Login', 'PROTEGIDO', { subject: /c[oó]digo de (verifica[cç][aã]o|acesso|seguran[cç]a)|verification code|security code|redefin(i[cç][aã]o de|ir (sua )?)senha|reset your password/i }),
  R('SEG-04', '60-SEGURANCA/Recuperacao', 'PROTEGIDO', { subject: /recupera[cç][aã]o de conta|account recovery/i }),
  R('SEG-05', '60-SEGURANCA/Alertas', 'PROTEGIDO', { from: /security\.asaas\.com/ }),
  R('FIN-01', '50-FINANCEIRO/Faturas', 'PROTEGIDO', { from: /faturamento\.copel\.com|cobranca@afya\.com\.br/ }),
  R('FIN-02', '50-FINANCEIRO/Faturas', 'PROTEGIDO', { subject: /\bboleto\b|fatura (digital|dispon[ií]vel|fechada)|nota fiscal/i }),
  R('FIN-03', '50-FINANCEIRO/Bancos', 'PROTEGIDO', { from: /mail\.bybit\.com|infinitepay\.io/ }),
  R('FIN-04', '50-FINANCEIRO/Faturas', 'PROTEGIDO', { from: /@vivo\.com\.br$/ }),
  R('DOC-01', '10-PESSOAL/Documentos', 'PROTEGIDO', { from: /servicos\.gov\.br|totvsassinatura\.com\.br|docusign\.net/ }),
  R('DOC-02', '10-PESSOAL/Documentos', 'PROTEGIDO', { from: /celepar\.pr\.gov\.br/ }),
  R('SAU-01', '10-PESSOAL/Saúde', 'PROTEGIDO', { from: /unimed/ }),
  R('TRB-01', '20-TRABALHO/Projetos', 'PROTEGIDO', { from: /cieepr\.org\.br|greenhouse-mail\.io/ }),
  R('SIS-01', '40-NOTIFICACOES/Sistemas', 'MANTER', { subject: /^\[Gmail\] Diagn[oó]stico/ }),
  R('SOC-01', '40-NOTIFICACOES/Redes sociais', 'MANTER', { from: /service\.tiktok\.com|linkedin\.com|facebookmail\.com/ }),
  R('SOC-02', '40-NOTIFICACOES/Redes sociais', 'MANTER', { categoria: 'SOCIAL' }, 'MEDIA'),
  R('FER-01', '40-NOTIFICACOES/Ferramentas', 'MANTER', { from: /noreply@github\.com|discord\.com|steampowered\.com|strava\.com|drive-shares-dm-noreply@google\.com/ }),
  R('NEWS-01', '30-NEWSLETTERS/Ler-depois', 'MANTER', { from: /codecademy\.com|codedex\.io|cursoemvideo\.com|tryhackme\.com|email\.openai\.com|thenewscc\.com\.br/ }),
  R('NEWS-02', '30-NEWSLETTERS/Ler-depois', 'MANTER', { from: /n\.dribbble\.com|mail\.spline\.design/ }),
  R('VAG-01', '30-NEWSLETTERS/Ler-depois', 'MANTER', { from: /catho\.com\.br|infojobs\.com\.br|netvagas\.com\.br/ }),
  R('PROMO-01', '30-NEWSLETTERS/Promoções', 'MANTER', { from: /shop2gether\.com\.br|shopee\.com\.br|lojakallucci\.com\.br|mail\.vivo\.com\.br|samsung\.com|engage\.canva\.com|novidades\.serasa\.com\.br|econodata\.com\.br|pluto\.tv|a\.mercadolivre\.com\.br/ }),
  R('PROMO-03', '30-NEWSLETTERS/Promoções', 'MANTER', { from: /mkt-produtor\.sympla\.com\.br|descubra\.jusbrasil\.com\.br|selections\.aliexpress\.com|notify\.bonifiq\.com\.br|info\.veloxtickets\.com|afya\.com\.br/ }),
  R('PROMO-02', '30-NEWSLETTERS/Promoções', 'MANTER', { categoria: 'PROMOTIONS', newsletter: true }, 'MEDIA'),
];
// Sem regra = baixa confiança = revisão humana (nunca quarentena)
const PADRAO = { id: 'PADRAO', label: '00-INBOX-ZERO/03-REVISAR', recomendacao: 'REVISAR', confianca: 'BAIXA' };
// =====================================================================

const cfg = $('Config').first().json;
const labelsApi = $('Listar labels').first().json.labels || [];
const idPorNome = Object.fromEntries(labelsApi.map(l => [l.name, l.id]));
const nomePorId = Object.fromEntries(labelsApi.map(l => [l.id, l.name]));
const header = (hs, n) => (hs.find(h => (h.name || '').toLowerCase() === n.toLowerCase()) || {}).value || '';
const mascarar = s => String(s || '').replace(/\b\d{6,8}\b/g, '••••••');
const casa = (r, m) =>
  (!r.from || r.from.test(m.email)) &&
  (!r.subject || r.subject.test(m.assuntoOriginal)) &&
  (!r.categoria || m.categoria === r.categoria) &&
  (!r.newsletter || m.isNewsletter);

const agora = new Date().toISOString();
const aplicar = cfg.modo === 'APLICAR';
const out = [];
for (const { json: j } of $input.all()) {
  if (!j.id || j.error) continue;
  const hs = (j.payload && j.payload.headers) || [];
  const from = header(hs, 'From');
  const mm = from.match(/<([^>]+)>/);
  const email = (mm ? mm[1] : from).trim().toLowerCase();
  const labelIds = j.labelIds || [];
  const m = {
    email,
    assuntoOriginal: header(hs, 'Subject'),
    categoria: (labelIds.find(id => id.startsWith('CATEGORY_')) || '').replace('CATEGORY_', ''),
    isNewsletter: !!(header(hs, 'List-Unsubscribe') || header(hs, 'List-Id')),
  };
  const regra = REGRAS.find(r => casa(r, m)) || PADRAO;
  const labelId = idPorNome[regra.label] || '';
  out.push({ json: {
    timestamp: agora,
    execucaoId: cfg.execucaoId,
    modo: cfg.modo,
    messageId: j.id,
    threadId: j.threadId,
    remetente: email,
    dominio: email.split('@')[1] || '',
    assunto: mascarar(m.assuntoOriginal).slice(0, 300),
    dataEmail: new Date(Number(j.internalDate)).toISOString(),
    labelsAntes: labelIds.map(id => nomePorId[id] || id).join(', '),
    categoria: m.categoria || 'SEM_CATEGORIA',
    labelSugerido: regra.label,
    labelId,
    recomendacao: regra.recomendacao,
    confianca: regra.confianca,
    origemDecisao: 'REGRA',
    regraId: regra.id,
    acaoSugerida: 'ADICIONAR_LABEL',
    acaoExecutada: !labelId ? 'NENHUMA' : aplicar ? 'ADICIONAR_LABEL' : 'NENHUMA (DRY_RUN)',
    status: !labelId ? 'ERRO: marcador não existe no Gmail' : aplicar ? 'PENDENTE' : 'SIMULADO',
    linkGmail: `https://mail.google.com/mail/u/0/#all/${j.threadId}`,
  }});
}
return out;
