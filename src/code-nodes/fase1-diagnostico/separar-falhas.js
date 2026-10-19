// Nó n8n: "Separar falhas" (workflow fase1-diagnostico.json; gerado por scripts/extract-code-nodes.js, não edite aqui)
// Separa as leituras que falharam (ex.: cota de 6.000 unidades/min estourada) para uma segunda tentativa.
// O HTTP Request devolve as respostas na mesma ordem da entrada, então o índice liga cada falha ao seu id.
const entrada = $('Limitar lote').all();
const falhas = $input.all()
  .map((item, i) => ({ ok: !!item.json.id && !item.json.error, id: entrada[i] && entrada[i].json.id }))
  .filter(r => !r.ok && r.id)
  .map(r => ({ json: { id: r.id } }));
return falhas.length ? falhas : [{ json: { semFalhas: true } }];
