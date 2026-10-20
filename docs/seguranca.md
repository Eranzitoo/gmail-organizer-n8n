# Modelo de segurança

## Riscos considerados

| Risco | Mitigação |
|---|---|
| Excluir e-mail importante por engano | Nenhuma exclusão automática; quarentena com revisão manual; categorias protegidas; baixa confiança vai para `03-REVISAR` |
| Bug no workflow alterar a caixa | Fase 1 com escopo `gmail.readonly`, garantido pelo Google, não pelo código |
| Escopo excessivo | `https://mail.google.com/` nunca é usado; fases de escrita usam `gmail.modify` (sem exclusão permanente) |
| Vazamento de dados na planilha | Só metadados e trecho; códigos de 6 a 8 dígitos mascarados; planilha não compartilhada |
| Injeção de fórmula via assunto | Gravação em modo `RAW` no Sheets |
| Vazamento de segredos no repositório | `.gitignore` para credenciais; teste no CI que procura client secret e tokens |
| IA executar ações destrutivas | A IA só sugere; a ação final é decidida pelas regras, e "excluir" significa mover para quarentena |
| Relatório enviado a terceiros | Destinatário obtido de `/users/me/profile`, nunca digitado; teste no CI garante isso |
| Lote grande demais | Limite de 50 a 200 e-mails por execução nas fases de escrita |
| gmail-sync: conteúdo de e-mail enviado ao Gemini | Alertas de segurança (`SEG-*`) e `remetentesIgnorados` nunca são enviados; cartão, CPF, linha digitável e códigos são mascarados; só vão remetente, assunto, data e corpo truncado (nada de anexos ou cópias). No plano gratuito do Gemini, o Google pode usar o conteúdo enviado para melhorar seus produtos, inclusive com revisão humana; para evitar isso, ative o faturamento no projeto |
| gmail-sync: injeção de prompt no corpo do e-mail | O prompt trata o e-mail como dado; a resposta precisa seguir um esquema fixo; a IA não tem ferramentas; `linkOnline` só passa se estiver literalmente no e-mail; títulos e textos têm tamanho limitado; quem decide são as regras |
| gmail-sync: evento errado na agenda | Agenda dedicada, limiar de confiança, datas no passado ou a mais de 365 dias vão para `REVISAR`, link para o e-mail de origem na descrição, sem convidados e `sendUpdates=none` |
| gmail-sync: escopo amplo no Google Agenda | Credencial só com `calendar.events.owned`; o CI garante que o workflow só lista e insere eventos (nada de `DELETE`, `PATCH`, `move` ou `calendarList`) |
| gmail-sync: chave da IA exposta | A chave fica numa credencial *Header Auth* do n8n e vai no cabeçalho `x-goog-api-key`, nunca na URL; o CI procura chaves `AIza...` no JSON |

## Escopos por fase

| Fase | Escopos |
|---|---|
| 1–2 | `gmail.readonly` (credencial de leitura), `gmail.send` (credencial só de envio), `spreadsheets`, `drive.file` |
| 3–5 | `gmail.modify`, `spreadsheets`, `drive.file` |
| gmail-sync | `gmail.readonly`, `calendar.events.owned`, `spreadsheets` e uma chave da API do Gemini |
| Nunca | `https://mail.google.com/` |

## Liberação gradual da quarentena

- **Etapa A:** redes sociais, notificações não protegidas e promoções óbvias.
- **Etapa B:** newsletters não lidas há muito tempo.
- **Etapa C:** e-mails antigos.

Cada etapa só é liberada depois de uma ou duas semanas de revisão da anterior.
