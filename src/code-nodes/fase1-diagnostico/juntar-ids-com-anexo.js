// Nó n8n: "Juntar IDs com anexo" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Junta todos os IDs de mensagens com anexo (todas as páginas) em um único item
const ids = [];
for (const item of $input.all()) {
  for (const m of (item.json.messages || [])) ids.push(m.id);
}
return [{ json: { attachmentIds: ids, total: ids.length } }];
