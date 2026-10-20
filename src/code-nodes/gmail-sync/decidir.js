// Nó n8n: "Decidir" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// A IA só sugere; quem decide são as regras abaixo.
// Marcador: o da regra, se houver; senão o da IA com confiança suficiente; senão 03-REVISAR.
// Evento: resposta inválida vira ERRO_IA, falta de cota vira ERRO_COTA_IA, NENHUM vira SEM_EVENTO,
// e confiança baixa ou data impossível vira REVISAR. Só o que passa em tudo é apto.
const cfg = $('Config').first().json;
const modo = cfg.modo === 'APLICAR' ? 'APLICAR' : 'DRY_RUN';
const REVISAR = '00-INBOX-ZERO/03-REVISAR';
const idPorNome = Object.fromEntries(($('Listar labels').first().json.labels || []).map(l => [l.name, l.id]));
const marcar = (marcador, origemMarcador) => {
  const labelId = idPorNome[marcador] || '';
  const statusMarcador = !labelId ? 'ERRO: marcador não existe no Gmail' : modo === 'APLICAR' ? 'PENDENTE' : 'SIMULADO';
  return { marcador, origemMarcador, labelId, statusMarcador };
};
const fuso = cfg.fuso || 'America/Sao_Paulo';
const limiar = Number(cfg.limiarConfianca);
const duracaoMin = Number(cfg.duracaoPadraoMin) || 60;
const TIPOS = ['REUNIAO', 'ENTREVISTA', 'PRAZO', 'VENCIMENTO', 'EVENTO', 'NENHUM'];
const DIA = 86400000;

const validarResposta = resp => {
  if (!resp || resp.error) {
    const e = (resp && resp.error) || {};
    const msg = String(e.message || e.description || JSON.stringify(e)).slice(0, 300);
    const cota = /429|RESOURCE_EXHAUSTED|quota|too many requests/i.test(JSON.stringify(e));
    return { erro: 'Gemini: ' + msg, cota };
  }
  if (resp.promptFeedback && resp.promptFeedback.blockReason) return { erro: 'bloqueado: ' + resp.promptFeedback.blockReason };
  const c = (resp.candidates || [])[0];
  if (!c) return { erro: 'resposta sem candidatos' };
  if (c.finishReason !== 'STOP') return { erro: 'resposta interrompida: ' + c.finishReason };
  const texto = ((c.content || {}).parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
  let r;
  try { r = JSON.parse(texto); } catch (e) { return { erro: 'JSON inválido' }; }
  if (!r || typeof r !== 'object') return { erro: 'JSON inválido' };
  for (const k of ['fim', 'local', 'linkOnline']) if (r[k] === undefined) r[k] = null;
  const tipos = {
    resumo: 'string', marcador: 'string', confiancaMarcador: 'number',
    tipo: 'string', confianca: 'number', titulo: 'string', inicio: 'string', diaInteiro: 'boolean',
  };
  for (const [k, t] of Object.entries(tipos)) if (typeof r[k] !== t) return { erro: `campo ${k} ausente ou inválido` };
  for (const k of ['fim', 'local', 'linkOnline']) if (r[k] !== null && typeof r[k] !== 'string') return { erro: `campo ${k} inválido` };
  if (!TIPOS.includes(r.tipo)) return { erro: 'tipo fora da lista: ' + r.tipo };
  if (!(r.confianca >= 0 && r.confianca <= 1)) return { erro: 'confianca fora de 0 a 1' };
  if (!(r.confiancaMarcador >= 0 && r.confiancaMarcador <= 1)) return { erro: 'confiancaMarcador fora de 0 a 1' };
  return { r };
};

// Datas no fuso configurado, sem bibliotecas: Intl dá o deslocamento do fuso naquele instante.
const partesNoFuso = (epoch, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(new Date(epoch)).map(x => [x.type, x.value]));
const offsetDoFuso = (epoch, tz) => {
  const p = partesNoFuso(epoch, tz);
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(epoch / 1000) * 1000) / 60000;
};
const paraEpoch = (local, tz) => {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(local)) return Date.parse(local);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(local).trim());
  if (!m) return NaN;
  const [ano, mes, dia, h, min, s] = [m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0].map(Number);
  const utc = Date.UTC(ano, mes - 1, dia, h, min, s);
  const d = new Date(utc);
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia || h > 23 || min > 59 || s > 59) return NaN;
  const aprox = utc - offsetDoFuso(utc, tz) * 60000;
  return utc - offsetDoFuso(aprox, tz) * 60000;
};
const localISO = (epoch, tz) => {
  const p = partesNoFuso(epoch, tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
};
const comOffset = (epoch, tz) => {
  const off = offsetDoFuso(epoch, tz);
  const a = Math.abs(off);
  return localISO(epoch, tz) + (off < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
};
const hojeNoFuso = tz => localISO(Date.now(), tz).slice(0, 10);
const somaDias = (data, n) => new Date(Date.parse(data + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
const limitesDoDia = (data, tz) => ({ diaMin: comOffset(paraEpoch(data, tz), tz), diaMax: comOffset(paraEpoch(somaDias(data, 1), tz), tz) });

const normalizarDatas = r => {
  const agora = Date.now();
  const temHora = /T\d{2}:\d{2}/.test(r.inicio);
  const diaInteiro = r.diaInteiro || r.tipo === 'PRAZO' || r.tipo === 'VENCIMENTO' || !temHora;
  if (diaInteiro) {
    const inicio = r.inicio.slice(0, 10);
    const inicioEpoch = paraEpoch(inicio, fuso);
    if (isNaN(inicioEpoch)) return { erro: 'data de início inválida' };
    if (inicio < hojeNoFuso(fuso)) return { erro: 'data no passado' };
    if (inicioEpoch - agora > 365 * DIA) return { erro: 'data a mais de 365 dias' };
    let fim = r.fim ? r.fim.slice(0, 10) : '';
    if (!fim || isNaN(paraEpoch(fim, fuso)) || fim < inicio) fim = inicio;
    return { diaInteiro: true, inicio, fim, fimExclusivo: somaDias(fim, 1), inicioEpoch, ...limitesDoDia(inicio, fuso) };
  }
  const inicioEpoch = paraEpoch(r.inicio, fuso);
  if (isNaN(inicioEpoch)) return { erro: 'data de início inválida' };
  if (inicioEpoch < agora) return { erro: 'data no passado' };
  if (inicioEpoch - agora > 365 * DIA) return { erro: 'data a mais de 365 dias' };
  let fimEpoch = r.fim ? paraEpoch(r.fim, fuso) : NaN;
  if (!(fimEpoch > inicioEpoch)) fimEpoch = inicioEpoch + duracaoMin * 60000;
  const inicio = localISO(inicioEpoch, fuso);
  return { diaInteiro: false, inicio, fim: localISO(fimEpoch, fuso), inicioEpoch, ...limitesDoDia(inicio.slice(0, 10), fuso) };
};

const montarEvento = (r, d, item) => {
  const evento = {
    summary: r.titulo,
    description: [r.resumo, '', 'De: ' + item.remetente, 'E-mail: ' + item.linkGmail, '(criado automaticamente pelo gmail-sync)'].join('\n'),
    start: d.diaInteiro ? { date: d.inicio } : { dateTime: d.inicio, timeZone: fuso },
    end: d.diaInteiro ? { date: d.fimExclusivo } : { dateTime: d.fim, timeZone: fuso },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: d.diaInteiro ? 1440 : 30 }] },
    extendedProperties: { private: { gmailMessageId: item.messageId, origem: 'gmail-sync' } },
  };
  const local = r.local || r.linkOnline;
  if (local) evento.location = local;
  return evento;
};

const itens = $input.all();
const out = [];
for (let i = 0; i < itens.length; i++) {
  const { requisicaoIA, ...origem } = $('Preparar').itemMatching(i).json;
  const permitidos = requisicaoIA.generationConfig.responseSchema.properties.marcador.enum;
  const item = {
    ...origem, modo, modeloIA: cfg.modeloIA,
    tipo: '', confianca: '', titulo: '', inicio: '', fim: '', diaInteiro: '',
    apto: false, eventoBody: null, inicioEpoch: '', diaMin: '', diaMax: '', status: '', motivo: '',
  };
  const v = validarResposta(itens[i].json);
  if (v.erro) {
    // Sem resposta da IA, só aplica o marcador da regra; os outros esperam a nova tentativa.
    out.push({ json: { ...item, status: v.cota ? 'ERRO_COTA_IA' : 'ERRO_IA', motivo: v.erro }, pairedItem: { item: i } });
    continue;
  }
  const r = v.r;
  r.titulo = r.titulo.trim().slice(0, 120);
  r.resumo = r.resumo.trim().slice(0, 1000);
  r.local = r.local ? r.local.trim().slice(0, 200) : null;
  const link = r.linkOnline ? r.linkOnline.trim() : '';
  r.linkOnline = /^https:\/\//.test(link) && !/••|\[número oculto\]/.test(link) && String(origem.corpo).includes(link) ? link : null;
  Object.assign(item, { resumo: r.resumo, tipo: r.tipo, confianca: r.confianca, titulo: r.titulo, inicio: r.inicio, fim: r.fim || '', diaInteiro: r.diaInteiro });
  if (origem.origemMarcador !== 'REGRA') {
    const daIA = permitidos.includes(r.marcador) && r.confiancaMarcador >= limiar;
    Object.assign(item, daIA ? marcar(r.marcador, 'IA') : marcar(REVISAR, 'PADRAO'));
  }

  if (r.tipo === 'NENHUM') {
    out.push({ json: { ...item, status: 'SEM_EVENTO', motivo: 'sem compromisso' }, pairedItem: { item: i } });
    continue;
  }
  if (r.confianca < limiar) {
    out.push({ json: { ...item, status: 'REVISAR', motivo: `confiança ${r.confianca} abaixo de ${limiar}` }, pairedItem: { item: i } });
    continue;
  }
  if (!r.titulo) {
    out.push({ json: { ...item, status: 'REVISAR', motivo: 'título vazio' }, pairedItem: { item: i } });
    continue;
  }
  const d = normalizarDatas(r);
  if (d.erro) {
    out.push({ json: { ...item, status: 'REVISAR', motivo: d.erro }, pairedItem: { item: i } });
    continue;
  }
  out.push({ json: {
    ...item,
    inicio: d.inicio, fim: d.fim, diaInteiro: d.diaInteiro,
    inicioEpoch: d.inicioEpoch, diaMin: d.diaMin, diaMax: d.diaMax,
    apto: true,
    eventoBody: montarEvento(r, d, origem),
    status: modo === 'APLICAR' ? '' : 'SIMULADO',
  }, pairedItem: { item: i } });
}
return out;
