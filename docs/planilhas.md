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

`timestamp, execucaoId, modo (DRY_RUN/REAL), messageId, threadId, remetente, dominio, assunto, dataEmail, labelsAntes, categoria, labelSugerido, recomendacao (MANTER/ARQUIVAR/REVISAR/QUARENTENA/PROTEGIDO), confianca, origemDecisao (REGRA/IA), regraId, acaoSugerida, acaoExecutada, motivo, labelsDepois, status, erro`
