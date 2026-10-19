# CLAUDE.md — contexto do projeto gmail-organizer-n8n

Automação no n8n (self-hosted, versão 2.34.x) para diagnosticar, classificar e organizar uma caixa Gmail pessoal com cerca de 3.000 e-mails. O repositório é público e serve de portfólio: o código, a documentação e o histórico de commits devem ter qualidade profissional.

## Invariantes de segurança (nunca quebrar)

- **Nada é excluído automaticamente.** "Excluir" significa mover para o marcador `99-REVISAR-EXCLUSAO`. A exclusão real só acontece num workflow manual, com prévia e confirmação.
- **Menor privilégio:** leitura com `gmail.readonly`, envio de relatório com `gmail.send`, marcadores com `gmail.modify`. **Nunca** usar `https://mail.google.com/` nem o nó Gmail nativo do n8n, que pede esse escopo.
- **Categorias protegidas** (financeiro, segurança, saúde, documentos, trabalho) nunca vão para a quarentena. As regras protegidas ficam sempre no topo da lista de regras.
- **Baixa confiança vai para `00-INBOX-ZERO/03-REVISAR`**, nunca para a quarentena.
- A Fase 2/3 **só adiciona marcadores** (`addLabelIds`). Não usar `removeLabelIds` (que arquivaria ou marcaria como lido) sem aprovação explícita.
- Lotes de no máximo 200 e-mails por execução, e `DRY_RUN` como modo padrão.
- Gmail API: respeitar a cota de **6.000 unidades por minuto por usuário**. `messages.get` custa 5 unidades; usar lotes de 10 a cada 1,1 s.
- **Nunca commitar** IDs de planilha, e-mails pessoais, Client ID/Secret, tokens nem exportações de dados (CSV). Os workflows no repositório usam o marcador `COLE_AQUI_O_ID_DA_PLANILHA`.

Essas garantias são verificadas por testes em `tests/`. Toda mudança nos workflows precisa manter os testes passando, e regras novas pedem testes novos.

## Estrutura e fluxo de trabalho

- `workflows/*.json` são a **fonte da verdade** (exportados do n8n).
- `src/code-nodes/<workflow>/` traz o JS dos nós Code, gerado automaticamente. Não editar à mão: rodar `npm run extract`.
- `tests/` reúne os testes com `node --test`, sem dependências. Rodar com `npm test`.
- O CI (`.github/workflows/ci.yml`) valida o JSON, roda os testes e confere se `src/` está sincronizado.
- Após editar um workflow: `npm run extract && npm test`, atualizar `CHANGELOG.md` e a versão em `package.json`.
- Commits em português, no padrão Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`). Cada fase entregue vira uma tag e uma release.

## Estado atual

- **v0.3.1 publicada:** Fase 1, diagnóstico somente leitura, relatório por e-mail (`gmail.send`) e uma aba de relatório por execução.
- **v0.4.0 pronta, ainda não publicada:** Fase 2/3, com `workflows/fase2-3-classificar-aplicar.json`, 15 regras determinísticas (`docs/regras.md`), auditoria na aba `auditoria` e aplicação via `messages.batchModify`. Aguarda validação em DRY_RUN.
- Os marcadores já foram criados no Gmail (estrutura 00 a 99).

## Próximos passos

Validar a Fase 2/3 em `DRY_RUN` → aplicar → Etapa A da quarentena (redes sociais e promoções) → IA para casos ambíguos → Fase 4 (relatórios diário e semanal) → Fase 5 (manutenção e workflow manual "Esvaziar quarentena").

## Contexto local

O diagnóstico real da caixa e as pendências de classificação (remetentes específicos) ficam em `CLAUDE.local.md`, fora do git.
