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

## Escopos por fase

| Fase | Escopos |
|---|---|
| 1–2 | `gmail.readonly` (credencial de leitura), `gmail.send` (credencial só de envio), `spreadsheets`, `drive.file` |
| 3–5 | `gmail.modify`, `spreadsheets`, `drive.file` |
| Nunca | `https://mail.google.com/` |

## Liberação gradual da quarentena

- **Etapa A:** redes sociais, notificações não protegidas e promoções óbvias.
- **Etapa B:** newsletters não lidas há muito tempo.
- **Etapa C:** e-mails antigos.

Cada etapa só é liberada depois de uma ou duas semanas de revisão da anterior.
