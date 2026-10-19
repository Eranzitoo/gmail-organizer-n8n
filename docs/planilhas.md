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

Aba `auditoria`, uma linha por e-mail avaliado (pode ficar na mesma planilha do diagnóstico ou em uma separada):

`timestamp, execucaoId, modo (DRY_RUN/APLICAR), messageId, threadId, remetente, dominio, assunto, dataEmail, labelsAntes, categoria, labelSugerido, labelId, recomendacao (MANTER/REVISAR/PROTEGIDO), confianca (ALTA/MEDIA/BAIXA), origemDecisao (REGRA), regraId, acaoSugerida, acaoExecutada, status (SIMULADO/ENVIADO/ERRO), linkGmail`

O cabeçalho é criado na primeira execução. Para ver os domínios sem regra: `=QUERY(auditoria!A:Q; "select G, count(G) where Q = 'PADRAO' group by G order by count(G) desc"; 1)`.
