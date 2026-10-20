// Nó n8n: "Registrar criação" (workflow gmail-sync-agenda.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Registra a confirmação do Google Agenda: CRIADO só quando a API devolve o evento criado.
const itens = $input.all();
const out = [];
for (let i = 0; i < itens.length; i++) {
  const resp = itens[i].json;
  const origem = $('Verificar duplicado').itemMatching(i).json;
  if (resp.id && resp.htmlLink && !resp.error) {
    out.push({ json: { ...origem, status: 'CRIADO', eventId: resp.id, linkEvento: resp.htmlLink, motivo: '' }, pairedItem: { item: i } });
  } else {
    const e = resp.error || {};
    const motivo = String(e.message || e.description || 'resposta sem id do evento').slice(0, 300);
    out.push({ json: { ...origem, status: 'ERRO_AGENDA', eventId: '', linkEvento: '', motivo }, pairedItem: { item: i } });
  }
}
return out;
