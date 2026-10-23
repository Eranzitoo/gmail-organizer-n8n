# gmail-sync e relatórios — e-mails novos resumidos, marcados e na agenda

Dois workflows tratam **só os e-mails que chegam a partir de uma data** (`inicioEm`). O acúmulo antigo continua com as Fases 1 a 3.

- [`workflows/gmail-sync.json`](../workflows/gmail-sync.json) roda a cada 60 minutos, com no máximo 5 chamadas ao Gemini por execução. Para cada e-mail novo, ele:
  1. aplica o marcador certo: as regras da Fase 2/3 decidem quando casam, e o Gemini escolhe quando nenhuma casa;
  2. pede ao **Gemini** um resumo de até 2 frases (menos promoções, newsletters, redes sociais e alertas de segurança);
  3. cria um evento numa agenda dedicada do Google Agenda quando o e-mail traz um compromisso com data;
  4. registra tudo numa linha da aba `emails_novos`.
- [`workflows/gmail-relatorios.json`](../workflows/gmail-relatorios.json) lê a aba `emails_novos` e manda para o seu e-mail:
  - **todo dia às 9h**, as últimas 24 horas;
  - **toda sexta às 15h**, os últimos 7 dias;
  - **todo dia 1 às 8h**, o mês anterior (só números, sem os resumos).

As garantias do projeto continuam valendo:

- O Gmail só ganha marcadores (`addLabelIds`). Nada é arquivado, marcado como lido ou excluído, e a IA nunca escolhe a quarentena `99`.
- A IA só sugere. Regras fixas decidem o marcador (regra > IA com confiança > `03-REVISAR`) e o evento (confiança, datas válidas e busca de duplicados).
- Alertas de segurança nunca vão para a IA, e números sensíveis são mascarados antes do envio.
- `DRY_RUN` é o padrão, e os quatro gatilhos agendados vêm desativados.

## gmail-sync nó a nó

| # | Nó | Endpoint / função | Observações |
|---|---|---|---|
| 1 | Iniciar / A cada 60 min | Manual / Schedule Trigger | O agendado **vem desativado** |
| 2 | Config | Set | Parâmetros (tabela abaixo) |
| 3 | Ler histórico | Google Sheets (read) | Aba `emails_novos`, para não processar o mesmo e-mail duas vezes |
| 4 | Listar labels | `GET /gmail/v1/users/me/labels` | Nome → ID dos marcadores |
| 5 | Listar mensagens | `GET /messages?q={query} after:{inicioEm}` | Só e-mails posteriores a `inicioEm` |
| 6 | Filtrar novas | Code | Tira os já processados, conta tentativas de erro e limita a `maxEmails` |
| 7 | Buscar e-mail | `GET /messages/{id}?format=full` | 1 a cada 800 ms (~375 unidades/min) |
| 8 | Preparar | Code | Regras da Fase 2/3, filtros de privacidade, mascaramento e requisição ao Gemini |
| 9 | Enviar à IA? | If | Promoções, newsletters, convites, alertas e erros seguem sem IA |
| 10 | Classificar com IA | `POST generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` | Resumo, marcador e compromisso num JSON de esquema fixo; no máximo `maxIA` (5) por execução, 1 a cada 12 s, tempo limite de 20 s, sem nova tentativa imediata |
| 11 | Decidir | Code | Valida a resposta, escolhe o marcador, normaliza datas e monta o evento |
| 12 | Agrupar por marcador | Code | Só em `APLICAR`: uma chamada por marcador |
| 13 | Aplicar marcadores | `POST /messages/batchModify` | Só `addLabelIds` |
| 14 | Registrar aplicação / Salvar aplicações | Code / Google Sheets | Confirmação do Gmail na aba `aplicacoes` (a mesma da Fase 2/3) |
| 15 | Apto e APLICAR? | If | No `DRY_RUN`, nada vai para o Calendar |
| 16 | Buscar por messageId / Buscar no dia | `GET /calendar/v3/calendars/{id}/events` | Duplicados: pelo id do e-mail (inclusive apagados) e por título e início |
| 17 | Verificar duplicado / status vazio? | Code / If | `DUPLICADO`, `ERRO_AGENDA` ou segue |
| 18 | Criar evento / Registrar criação | `POST .../events?sendUpdates=none` / Code | Sem convidados; `CRIADO` só com a confirmação do Google |
| 19 | Montar linha / Salvar linha | Code / Google Sheets (append, RAW) | Uma linha por e-mail; a aba nunca é limpa |

## Configuração

1. **Data de início.** Em `inicioEm` no `Config`, coloque a data e a hora a partir das quais quer processar (ex.: `2026-10-20T00:00:00-03:00`). Nada anterior a isso é lido.
2. **Agenda dedicada.** No Google Agenda, crie uma agenda nova (ex.: "Gmail – automático"). Em *Configurações da agenda → Integrar agenda*, copie o **ID da agenda** e cole em `calendarId`.
3. **Aba `emails_novos`.** Na planilha de auditoria da Fase 2/3, crie uma aba vazia `emails_novos`. O cabeçalho é criado na primeira execução. Cole o ID da planilha nos nós do Sheets dos dois workflows. A aba `aplicacoes` é a mesma da Fase 2/3.
4. **Credenciais no n8n:**

   | Credencial | Tipo | Usada em | Escopo / conteúdo |
   |---|---|---|---|
   | Google account | Google OAuth2 API | leituras do Gmail e Obter meu e-mail | só `https://www.googleapis.com/auth/gmail.readonly` |
   | Gmail Organizar | Google OAuth2 API | Aplicar marcadores | `https://www.googleapis.com/auth/gmail.modify` (a mesma da Fase 2/3) |
   | Google account 2 | Google OAuth2 API | Enviar relatório | só `https://www.googleapis.com/auth/gmail.send` |
   | Gemini API | Header Auth | Classificar com IA | nome `x-goog-api-key`, valor = chave do [Google AI Studio](https://aistudio.google.com/apikey) |
   | Google Agenda (eventos) | Google OAuth2 API | nós do Calendar | só `https://www.googleapis.com/auth/calendar.events.owned` (ou `calendar.events`) |
   | Google Sheets account | Google Sheets OAuth2 | planilhas | a mesma das outras fases |

   Confira na tela de consentimento do Google que cada credencial pede só o escopo da tabela. Isso não dá para verificar por teste, porque o escopo fica na credencial do n8n, fora do JSON.
5. **Modelo.** `modeloIA` vem como `gemini-flash-lite-latest`, que aponta para o Flash-Lite mais recente: é o que tem a maior cota no plano gratuito e resume bem. Para mais qualidade, troque por `gemini-flash-latest`, sabendo que a cota gratuita dele é menor. Confira os limites do seu projeto em *AI Studio → Rate limits*.

### Campos do `Config` (gmail-sync)

| Campo | Padrão | Para que serve |
|---|---|---|
| `modo` | `DRY_RUN` | `APLICAR` aplica marcadores e cria eventos; qualquer outro valor é tratado como `DRY_RUN` |
| `inicioEm` | `2026-10-20T00:00:00-03:00` | Só e-mails que chegaram depois disso |
| `query` | `newer_than:2d -in:sent -in:drafts -in:chats` | Janela de busca a cada execução |
| `maxEmails` | 30 | E-mails lidos por execução |
| `maxIA` | 5 | Chamadas ao Gemini por execução; o que passar fica para a próxima, sem registro |
| `maxCaracteres` | 8000 | Tamanho máximo do corpo enviado à IA |
| `modeloIA` | `gemini-flash-lite-latest` | Modelo do Gemini |
| `limiarConfianca` | 0.8 | Abaixo disso, o marcador da IA vira `03-REVISAR` e o compromisso vira `REVISAR` |
| `duracaoPadraoMin` | 60 | Duração do evento quando o e-mail não diz o término |
| `calendarId` | `COLE_AQUI_O_ID_DA_AGENDA` | Agenda dedicada |
| `fuso` | `America/Sao_Paulo` | Fuso das datas e dos eventos |
| `remetentesIgnorados` | vazio | E-mails ou domínios, separados por vírgula, que nunca vão para a IA |

## Como o marcador é escolhido

1. Se uma regra da Fase 2/3 casa, vale o marcador da regra. As regras são copiadas do nó `Classificar` pelo script de montagem, e um teste garante que continuam idênticas.
2. Se nenhuma casa e o e-mail vai para a IA, vale o marcador sugerido pelo Gemini, desde que esteja na lista permitida e com confiança de pelo menos `limiarConfianca`.
3. Fora isso, o e-mail vai para `00-INBOX-ZERO/03-REVISAR`.

A lista que a IA pode escolher é a dos marcadores das regras mais `03-REVISAR`. A quarentena `99-REVISAR-EXCLUSAO` nunca está nela. Se a IA falhar, o e-mail sem regra fica sem marcador até a próxima tentativa, e, se todas falharem, a Fase 2/3 (`has:nouserlabels`) ainda o pega.

## Status da aba `emails_novos`

| Status | Significado | Volta a ser processado? |
|---|---|---|
| `SEM_RESUMO` | Promoção, newsletter, rede social ou relatório do próprio sistema: só recebe o marcador | Não |
| `SEM_EVENTO` | Resumido e marcado; não há compromisso | Não |
| `CRIADO` | Resumido, marcado e com evento criado (veja `linkEvento`) | Não |
| `SIMULADO` | O evento seria criado, mas o modo é `DRY_RUN` | Não no DRY_RUN; sim no APLICAR |
| `DUPLICADO` | Já existe evento deste e-mail, ou com o mesmo título e início | Não |
| `REVISAR` | Compromisso com confiança baixa ou data no passado, inválida ou a mais de 365 dias | Não (confira à mão) |
| `IGNORADO_PRIVACIDADE` | Alerta de segurança (regras `SEG-*`) ou remetente em `remetentesIgnorados`: só recebe o marcador | Não |
| `IGNORADO_CONVITE` | Convite `.ics` ou aviso do próprio Google Agenda: só recebe o marcador | Não |
| `ERRO_LEITURA`, `ERRO_IA`, `ERRO_AGENDA` | Falha na leitura, na IA ou no Calendar | Sim, até 3 tentativas por modo |
| `ERRO_COTA_IA` | O Gemini recusou por cota (429) ou ficou instável (5xx, conexão abortada, tempo esgotado) | Sim, sem gastar tentativa, enquanto o e-mail estiver na janela da busca |

A coluna `statusMarcador` diz o que aconteceu com o marcador: `SIMULADO` (DRY_RUN), `PENDENTE` (enviado ao Gmail; a confirmação fica na aba `aplicacoes`) ou `ERRO: marcador não existe no Gmail`.

## Cotas

- **Gmail:** no máximo ~380 unidades/min de leitura, mais uma chamada `batchModify` por marcador. Somado à Fase 2/3 fica abaixo de 2.500, mas **não rode junto com a Fase 1**.
- **Gemini:** no máximo 5 chamadas por execução (`maxIA`), 1 a cada 12 s, com tempo limite de 20 s, e execuções a cada 60 minutos. Normalmente uma execução leva cerca de 1 minuto; no pior caso, com todas as chamadas esgotando o tempo limite, leva menos de 3, então duas execuções nunca rodam ao mesmo tempo (o gatilho do n8n dispara mesmo com a anterior ainda rodando) e nunca passam de 5 chamadas por minuto, o limite gratuito. Só vão para a IA os e-mails que não são promoção, newsletter, vaga, rede social nem alerta de segurança. O nó não repete na hora, porque repetir dentro do mesmo minuto só gera mais recusas: o e-mail fica como `ERRO_COTA_IA` e volta na execução seguinte. Um teste garante que esses números continuam coerentes.

## Teste manual

1. Ajuste `inicioEm` para alguns minutos atrás e mande para você mesmo: uma reunião "amanhã às 15h", um boleto com vencimento e um e-mail comum sem data. Espere chegar também alguma promoção.
2. Rode o gmail-sync em `DRY_RUN` e confira a aba `emails_novos`: resumos preenchidos, marcadores sugeridos com `statusMarcador = SIMULADO`, dois `SIMULADO` na coluna `status` e a promoção como `SEM_RESUMO`. Rode de novo e confirme que nada é reprocessado.
3. Rode o **gmail-relatorios** pelo **Iniciar**: chega o resumo diário, com o aviso de DRY_RUN.
4. Mude o gmail-sync para `APLICAR` e rode: os e-mails ganham os marcadores no Gmail, a aba `aplicacoes` mostra `CONFIRMADO`, e os dois eventos aparecem na agenda dedicada, sem convidados.
5. Rode de novo: nada é recriado. Apague um evento e rode outra vez: ele não volta.
6. Só então ative **A cada 60 min** e publique o workflow (**Publish**) no gmail-sync e os três gatilhos do gmail-relatorios.
