# Arquitetura — Fase 1

## Por que HTTP Request em vez do nó Gmail

O nó Gmail nativo do n8n usa uma credencial que pede, entre outros, o escopo `https://mail.google.com/` (acesso total, inclusive exclusão permanente). Para a leitura, o workflow usa nós **HTTP Request** com a credencial genérica **Google OAuth2 API**, na qual o escopo é definido manualmente como `gmail.readonly`.

## Nó a nó

| # | Nó | Endpoint / função | Observações |
|---|---|---|---|
| 1 | Iniciar diagnóstico | Manual Trigger | Sem gatilho agendado nesta fase |
| 2 | Config | Set | `query`, `maxEmails`, `bigSizeMB`, `oldYears`, `modo` |
| 3 | Listar labels | `GET /users/me/labels` | Mapeia `Label_123` para o nome |
| 4 | Listar IDs com anexo | `GET /users/me/messages?q=... has:attachment` | Paginado por `pageToken`, 500 por página |
| 5 | Juntar IDs com anexo | Code | Consolida as páginas em um `Set` |
| 6 | Listar mensagens | `GET /users/me/messages?q=...` | Inclui arquivados; exclui spam e lixeira por padrão |
| 7 | Separar mensagens | Split Out | Um item por mensagem |
| 8 | Limitar lote | Limit | Mais recentes primeiro |
| 9 | Buscar metadados | `GET /users/me/messages/{id}?format=metadata` | Lotes de 10 a cada 1 s (~3.000 unidades/min), 5 tentativas, erro não interrompe e é contado no relatório |
| 10 | Separar falhas | Code | Liga cada leitura com erro ao seu id (pela ordem da resposta) |
| 11 | Há falhas? | If | Sem falhas, segue direto para o Normalizar |
| 12 | Esperar cota | Wait (65 s) | A cota do Gmail é por minuto; a espera libera a janela |
| 13 | Reler falhas | `GET /users/me/messages/{id}?format=metadata` | Só os que falharam, mais devagar: lotes de 5 a cada 1,1 s |
| 14 | Normalizar | Code | Junta 1ª passada e releitura, extrai os campos e mascara números de 6 a 8 dígitos |
| 15 | Salvar diagnóstico | Google Sheets (append, RAW) | `RAW` evita injeção de fórmulas vindas de assuntos |
| 16 | Agregar relatório | Code | Gera linhas `secao / item / quantidade / detalhe`, incluindo a Cobertura da leitura |
| 17 | Salvar relatório | Google Sheets (append, RAW) | |
| 18 | Montar e-mail | Code | HTML com estilos inline, escape de caracteres e alerta de relatório parcial |
| 19 | Enviar relatório | Gmail (send) | **Desativado** |

## Decisões técnicas

- **`format=metadata`** em vez de `full`: menos dados trafegados, sem baixar o corpo nem os anexos, e mais privacidade. O trecho inicial vem do campo `snippet`.
- **Detecção de anexo** por uma busca separada `has:attachment`, porque `format=metadata` não retorna as partes MIME. "Anexo grande" é `temAnexo && sizeEstimate >= bigSizeMB`.
- **Newsletter** é identificada pelos cabeçalhos `List-Unsubscribe`, `List-Id` ou `Precedence: bulk|list`.
- **Notificação automática** é identificada por remetente `no-reply`/`notification`/`alert` ou pelo cabeçalho `Auto-Submitted`.
- **Cota da Gmail API:** o limite que vale na prática é o de **6.000 unidades por minuto por usuário** (`totalQueryCostPerMinutePerUser`), e `messages.get` custa 5 unidades. O ritmo inicial, de cerca de 18 req/s (~5.400 unidades/min), somado às listagens, estourou esse limite com erro 403 `rateLimitExceeded`. O ritmo atual, de cerca de 9 req/s (~2.700 unidades/min), deixa uma folga de mais de 50%. Todos os nós HTTP têm 5 tentativas com 5 s de espera.
- **Caixas grandes:** acima de cerca de 10 mil mensagens, recomenda-se executar por ano, via `query`, para respeitar limites de memória e tempo.
