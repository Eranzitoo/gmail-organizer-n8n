# Esquema das planilhas

## `Gmail - Diagnóstico`

**Aba `dados`** (uma linha por e-mail)

| Coluna | Tipo | Descrição |
|---|---|---|
| messageId, threadId | texto | IDs da Gmail API |
| data, ano | data, número | `internalDate` em ISO 8601 |
| remetenteNome, remetenteEmail, dominio | texto | Extraídos do cabeçalho From |
| destinatario | texto | Cabeçalho To (até 200 caracteres) |
| assunto, trecho | texto | Com códigos mascarados |
| labels, labelsUsuario | texto | Separados por vírgula |
| semLabelUsuario, naInbox, naoLido | booleano | |
| categoriaGmail | texto | PROMOTIONS, SOCIAL, UPDATES, FORUMS, PERSONAL |
| temAnexo, anexoGrande, tamanhoMB | booleano, número | |
| isNewsletter, isAutomatico, temListUnsubscribe | booleano | Heurísticas por cabeçalho |
| antigo | booleano | Mais velho que `oldYears` |
| linkGmail | URL | Abre a conversa |
| coletadoEm | data | Momento da coleta |

**Abas `relatorio_AAAA-MM-DD_HH-mm`** (uma por execução, criadas automaticamente): `geradoEm, secao, item, quantidade, detalhe`

A aba `dados` é sobrescrita a cada execução, porque representa o estado atual da caixa.

## `Gmail - Auditoria` (a partir da Fase 2)

Duas abas com as mesmas colunas (podem ficar na mesma planilha do diagnóstico ou em uma separada):

- **`simulacao`**: recebe as execuções em `DRY_RUN` e é limpa no início de cada uma, então sempre mostra só a simulação mais recente.
- **`auditoria`**: recebe as execuções em `APLICAR`, uma linha por ação, e **nunca é limpa**. É o registro permanente do que foi alterado no Gmail.

Colunas:

`timestamp, execucaoId, modo (DRY_RUN/APLICAR), messageId, threadId, remetente, dominio, assunto, dataEmail, labelsAntes, categoria, labelSugerido, labelId, recomendacao (MANTER/REVISAR/PROTEGIDO), confianca (ALTA/MEDIA/BAIXA), origemDecisao (REGRA), regraId, acaoSugerida, acaoExecutada, status (SIMULADO/PENDENTE/ERRO), linkGmail`

No modo APLICAR o status fica `PENDENTE`: a linha registra a intenção, não a confirmação.

**Aba `aplicacoes`** (só no modo APLICAR, nunca é limpa): uma linha por chamada ao `batchModify`, com o que o Gmail de fato confirmou.

`timestamp, execucaoId, label, labelId, total, status (CONFIRMADO/ERRO), erro, messageIds`

Para saber se um e-mail foi marcado, cruze `execucaoId` + `labelId` da `auditoria` com a `aplicacoes`.

## Aba `agenda` (gmail-sync)

Uma linha por e-mail analisado pelo [gmail-sync](gmail-sync.md), em qualquer desfecho. **Nunca é limpa**: além de auditoria, ela é o histórico que impede o workflow de processar o mesmo e-mail duas vezes. Crie a aba vazia; o cabeçalho é criado na primeira execução.

`timestamp, execucaoId, modo (DRY_RUN/APLICAR), messageId, remetente, assunto (mascarado), dataEmail, tipo, confianca, titulo, inicio, fim, diaInteiro, status, motivo, tentativa, eventId, linkEvento, linkGmail, modeloIA`

Os valores de `status` estão explicados em [`docs/gmail-sync.md`](gmail-sync.md#status-da-aba-agenda).

---

O cabeçalho das abas é criado na primeira execução. Para ver os domínios sem regra: `=QUERY(simulacao!A:Q; "select G, count(G) where Q = 'PADRAO' group by G order by count(G) desc"; 1)`.
