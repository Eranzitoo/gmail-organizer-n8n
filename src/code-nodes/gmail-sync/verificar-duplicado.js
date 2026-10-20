// Nó n8n: "Verificar duplicado" (workflow gmail-sync.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Evita evento repetido: procura pelo id do e-mail (inclusive eventos já apagados)
// e por um evento no mesmo dia com o mesmo título e o mesmo início. Erro em qualquer busca impede a criação.
const normalizarTitulo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const msgErro = r => { const e = r.error || {}; return String(e.message || e.description || JSON.stringify(e)).slice(0, 300); };

const itens = $input.all();
const out = [];
for (let i = 0; i < itens.length; i++) {
  const porDia = itens[i].json;
  const porId = $('Buscar por messageId').itemMatching(i).json;
  const origem = $('Decidir').itemMatching(i).json;
  let status = '';
  let motivo = '';
  if (porId.error || porDia.error) {
    status = 'ERRO_AGENDA';
    motivo = 'busca de duplicados falhou: ' + msgErro(porId.error ? porId : porDia);
  } else if ((porId.items || []).length > 0) {
    status = 'DUPLICADO';
    motivo = 'já existe evento deste e-mail (id ' + porId.items[0].id + ')';
  } else {
    const titulo = normalizarTitulo(origem.eventoBody.summary);
    const igual = (porDia.items || []).find(ev => {
      if (normalizarTitulo(ev.summary) !== titulo || !ev.start) return false;
      return origem.diaInteiro ? ev.start.date === origem.inicio : Date.parse(ev.start.dateTime) === Number(origem.inicioEpoch);
    });
    if (igual) {
      status = 'DUPLICADO';
      motivo = 'evento com o mesmo título e início (id ' + igual.id + ')';
    }
  }
  out.push({ json: { ...origem, status, motivo }, pairedItem: { item: i } });
}
return out;
