# gmail-sync — e-mails com data viram eventos no Google Agenda

Workflow [`workflows/gmail-sync-agenda.json`](../workflows/gmail-sync-agenda.json). Lê os e-mails recentes da Inbox, usa o **Gemini** para identificar os que descrevem um compromisso com data (reunião, entrevista, prazo, vencimento ou evento) e cria o evento numa agenda dedicada do Google Agenda.

As garantias do projeto continuam valendo:

- O Gmail é só lido (`gmail.readonly`). Nenhum e-mail é alterado.
- A IA só sugere. Quem decide se o evento é criado são regras fixas: limiar de confiança, validação de datas e busca de duplicados.
- Alertas de segurança nunca vão para a IA, e números sensíveis são mascarados antes do envio.
- `DRY_RUN` é o padrão, e toda decisão fica registrada na aba `agenda`.

## Nó a nó

| # | Nó | Endpoint / função | Observações |
|---|---|---|---|
| 1 | Iniciar | Manual Trigger | Para validar |
| 2 | A cada 30 min | Schedule Trigger | **Vem desativado**; só ative depois de validar |
| 3 | Config | Set | Parâmetros da execução (tabela abaixo) |
| 4 | Ler aba agenda | Google Sheets (read) | Histórico, para não processar o mesmo e-mail duas vezes |
| 5 | Listar mensagens | `GET /gmail/v1/users/me/messages?q=...` | Até 100 IDs da busca `query` |
| 6 | Filtrar novas | Code | Tira os já processados, conta tentativas de erro e limita a `maxEmails` |
| 7 | Buscar e-mail | `GET /messages/{id}?format=full` | 1 a cada 800 ms (~375 unidades/min), 5 tentativas |
| 8 | Preparar | Code | Extrai o corpo, desvia convites e e-mails sensíveis, mascara e monta a requisição |
| 9 | Enviar à IA? | If | Convites, e-mails sensíveis e erros de leitura vão direto para a planilha |
| 10 | Classificar com IA | `POST generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` | Saída em JSON com esquema fixo; 1 chamada a cada 7 s |
| 11 | Decidir | Code | Valida a resposta, normaliza datas no fuso e monta o evento |
| 12 | Apto e APLICAR? | If | No DRY_RUN, nada passa daqui para o Calendar |
| 13 | Buscar por messageId | `GET /calendar/v3/calendars/{id}/events?privateExtendedProperty=...&showDeleted=true` | Acha o evento deste e-mail, mesmo se você o apagou |
| 14 | Buscar no dia | `GET /calendar/v3/calendars/{id}/events?timeMin=...&timeMax=...` | Eventos do mesmo dia, para comparar título e início |
| 15 | Verificar duplicado | Code | `DUPLICADO`, `ERRO_AGENDA` ou segue para a criação |
| 16 | status vazio? | If | Só cria quando não há duplicado nem erro |
| 17 | Criar evento | `POST /calendar/v3/calendars/{id}/events?sendUpdates=none` | Sem convidados; ninguém recebe e-mail |
| 18 | Registrar criação | Code | `CRIADO` só com a confirmação do Google |
| 19 | Montar linha | Code | Uma linha com as mesmas colunas para qualquer desfecho |
| 20 | Salvar agenda | Google Sheets (append, RAW) | Registro permanente; nunca é limpo |

## Configuração

1. **Agenda dedicada.** No Google Agenda, crie uma agenda nova (ex.: "Gmail – automático"). Em *Configurações da agenda → Integrar agenda*, copie o **ID da agenda** e cole em `calendarId` no `Config`. Assim os eventos automáticos ficam separados e podem ser escondidos ou apagados de uma vez.
2. **Aba `agenda`.** Na planilha de auditoria da Fase 2/3, crie uma aba vazia chamada `agenda`. O cabeçalho é criado na primeira execução. Cole o ID da planilha nos nós `Ler aba agenda` e `Salvar agenda`.
3. **Credenciais no n8n:**

   | Credencial | Tipo | Usada em | Escopo / conteúdo |
   |---|---|---|---|
   | Google account | Google OAuth2 API | Listar mensagens, Buscar e-mail | só `https://www.googleapis.com/auth/gmail.readonly` (a mesma da Fase 1) |
   | Gemini API | Header Auth | Classificar com IA | nome `x-goog-api-key`, valor = chave criada no [Google AI Studio](https://aistudio.google.com/apikey) |
   | Google Agenda (eventos) | Google OAuth2 API | Buscar por messageId, Buscar no dia, Criar evento | só `https://www.googleapis.com/auth/calendar.events.owned` (se não estiver disponível, `calendar.events`) |
   | Google Sheets account | Google Sheets OAuth2 | Ler aba agenda, Salvar agenda | a mesma das outras fases |

   Na tela de consentimento do Google, confira que a credencial da agenda pede **só eventos**. Isso não dá para verificar por teste, porque o escopo fica na credencial do n8n, fora do JSON.
4. **Modelo.** `modeloIA` vem como `gemini-flash-latest`, que sempre aponta para o Flash mais recente. Para fixar uma versão, troque pelo nome exato de um modelo que tenha cota gratuita no seu projeto (veja em *AI Studio → Rate limits*).

### Campos do `Config`

| Campo | Padrão | Para que serve |
|---|---|---|
| `modo` | `DRY_RUN` | `APLICAR` cria eventos; qualquer outro valor é tratado como `DRY_RUN` |
| `query` | `in:inbox newer_than:2d -category:promotions -category:social` | Quais e-mails olhar |
| `maxEmails` | 20 | E-mails analisados por execução |
| `maxCaracteres` | 8000 | Tamanho máximo do corpo enviado à IA |
| `modeloIA` | `gemini-flash-latest` | Modelo do Gemini |
| `limiarConfianca` | 0.8 | Abaixo disso, a linha vai para `REVISAR` |
| `duracaoPadraoMin` | 60 | Duração quando o e-mail não diz o horário de término |
| `calendarId` | `COLE_AQUI_O_ID_DA_AGENDA` | Agenda dedicada |
| `fuso` | `America/Sao_Paulo` | Fuso das datas e dos eventos |
| `remetentesIgnorados` | vazio | Lista separada por vírgula (e-mails ou domínios) que nunca vai para a IA |

## Status da aba `agenda`

| Status | Significado | Volta a ser processado? |
|---|---|---|
| `CRIADO` | Evento criado (veja `linkEvento`) | Não |
| `SIMULADO` | Seria criado, mas o modo é `DRY_RUN` | Não no DRY_RUN; sim no APLICAR |
| `DUPLICADO` | Já existe evento deste e-mail, ou com o mesmo título e início | Não |
| `SEM_EVENTO` | A IA não encontrou compromisso | Não |
| `REVISAR` | Confiança baixa, data no passado, inválida ou a mais de 365 dias | Não (confira à mão) |
| `IGNORADO_PRIVACIDADE` | Alerta de segurança (regras `SEG-*`) ou remetente em `remetentesIgnorados` | Não |
| `IGNORADO_CONVITE` | Convite `.ics` ou aviso do próprio Google Agenda | Não |
| `ERRO_LEITURA`, `ERRO_IA`, `ERRO_AGENDA` | Falha na leitura, na IA ou no Calendar | Sim, até 3 tentativas por modo |
| `ERRO_COTA_IA` | A cota gratuita do Gemini acabou | Sim, sem limite de tentativas, enquanto o e-mail estiver na busca |

O modo `DRY_RUN` também não reprocessa e-mails já resolvidos no `APLICAR`, para não gastar cota da IA à toa.

## Cotas

- **Gmail:** no máximo ~380 unidades/min. Somado à Fase 2/3 fica abaixo de 2.500, mas **não rode junto com a Fase 1**, que sozinha usa ~3.000 e precisa da folga para a releitura.
- **Gemini:** 1 chamada a cada 7 s (~8,5 por minuto), para caber no plano gratuito. Os limites diários do plano gratuito mudam com frequência; quando acabam, o e-mail fica como `ERRO_COTA_IA` e é tentado de novo nas próximas execuções.
- **Duração:** com 20 e-mails que vão todos para a IA, uma execução leva cerca de 2,5 minutos.

## Teste manual

1. Mande para você mesmo três e-mails: uma reunião "amanhã às 15h", um boleto com vencimento e um e-mail sem data.
2. Rode em `DRY_RUN` e confira a aba `agenda`: dois `SIMULADO` e um `SEM_EVENTO`. Rode de novo e confirme que nada é reprocessado.
3. Mude para `APLICAR` e rode: dois `CRIADO` na agenda dedicada, sem convidados e com o link do e-mail na descrição.
4. Rode de novo: nada é recriado. Apague um dos eventos e rode outra vez: ele não volta.
5. Só então ative o gatilho **A cada 30 min**.
