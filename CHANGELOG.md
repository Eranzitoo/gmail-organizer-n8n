# Changelog

## [Não publicado]
### Alterado
- Novo visual dos relatórios: tema escuro com letras maiores, cartões de números com uma cor por indicador, largura de 900px e texto de prévia na caixa de entrada. O cabeçalho mostra o período (diário, semanal ou mensal).
- O e-mail do diagnóstico da Fase 1 ganhou o mesmo tema escuro.
- Relatório diário às 9h (antes 22h) e semanal na sexta às 15h (antes domingo, 22h), como já está no n8n.
- O relatório diário cobre as últimas 24 horas até o envio, e não mais só o dia corrente: às 9h, o dia corrente deixava de fora a tarde e a noite anteriores.

## [0.5.0] - 2026-10-20
### Adicionado
- Workflow `gmail-sync.json`, só para e-mails que chegam depois de `inicioEm`: aplica o marcador (regras da Fase 2/3 primeiro; sem regra, o Gemini escolhe de uma lista fechada, sem a quarentena, e com pouca confiança vai para `03-REVISAR`), pede ao Gemini um resumo de até 2 frases e, quando o e-mail traz um compromisso com data, cria o evento numa agenda dedicada do Google Agenda. `DRY_RUN` por padrão e gatilho de 3 minutos desativado até a validação.
- Workflow `gmail-relatorios.json`: resumo diário (22h), semanal (domingo, 22h) e mensal (dia 1, 8h) dos e-mails novos, enviado para o próprio e-mail com `gmail.send`. Lê só a aba `emails_novos`, sem chamar o Gmail nem a IA.
- A IA só sugere: regras fixas validam a resposta, as datas no fuso configurado (passado ou mais de 365 dias vão para `REVISAR`), tratam prazos e vencimentos como dia inteiro e buscam duplicados pelo id do e-mail (inclusive eventos apagados) e por título e início.
- Filtro de privacidade antes da IA: promoções, newsletters, redes sociais, alertas de segurança (`SEG-*`) e `remetentesIgnorados` não são enviados, e cartão, CPF, linha digitável e códigos são mascarados.
- Aba `emails_novos`, que nunca é limpa: uma linha por e-mail com resumo, marcador, status e evento. Erros são tentados de novo até 3 vezes por modo; falta de cota do Gemini (`ERRO_COTA_IA`) é tentada sem limite. Os marcadores aplicados são confirmados na aba `aplicacoes`, a mesma da Fase 2/3.
- 35 testes novos: Gmail só lê e adiciona marcadores, Calendar só lista e insere sem convidados, chave do Gemini só no cabeçalho, regras idênticas às da Fase 2/3, escolha do marcador, mascaramento, validação da resposta da IA, datas e fuso, duplicados, janelas e conteúdo dos relatórios, e cota do Gmail.
- Documentação em `docs/gmail-sync.md`, com riscos e mitigações em `docs/seguranca.md` e a aba `emails_novos` em `docs/planilhas.md`.

### Alterado
- Regra `SEG-01` inclui `noreply-accounts@google.com` (avisos de dados da conta compartilhados com outros apps): vão para `60-SEGURANCA/Alertas` e nunca para a IA.
- Gemini limitado a 5 chamadas por execução (`maxIA`), 1 a cada 12 s, com tempo limite de 20 s e sem nova tentativa imediata, com execuções a cada 3 minutos (no pior caso, uma execução termina antes da próxima começar) e `gemini-flash-lite-latest` como padrão: nunca passa de 5 chamadas por minuto, o limite gratuito. No primeiro teste, o ritmo anterior gerou recusas por cota. Recusas por cota e instabilidade (429, 5xx, conexão abortada) viram `ERRO_COTA_IA` e voltam na próxima execução sem gastar tentativa.
- O gmail-sync descarta e-mails anteriores a `inicioEm` também no código, porque a busca `after:` do Gmail deixou passar alguns.
- Regra nova `COM-01`: avisos de pedido, pagamento e entrega da Shopee e do Mercado Livre (categoria Atualizações do Gmail) vão para `40-NOTIFICACOES/Compras` e ganham resumo no gmail-sync; o marketing dessas lojas continua em `PROMO-01`.
- Regra `SIS-01` passa a reconhecer também os relatórios `[Gmail] Resumo ...`, para que eles sejam marcados como sistema e nunca enviados à IA.

## [0.4.0] - 2026-10-20
### Adicionado
- Workflow `fase2-3-classificar-aplicar.json`: 15 regras determinísticas (protegidas primeiro), auditoria completa na aba `auditoria`, modo DRY_RUN por padrão e aplicação de marcadores via `messages.batchModify` (só `addLabelIds`).
- Processamento incremental: cada execução pega até 200 e-mails ainda sem marcador.
- 8 regras adicionais após a validação em DRY_RUN, reduzindo os e-mails sem regra: bancos (Bybit, InfinitePay), faturas da Vivo, alertas do Asaas, Celepar, estágio e processos seletivos (CIEE, Greenhouse), alertas de vagas, newsletters de design e promoções diversas.
- 11 testes novos: único POST é `batchModify`, sem `removeLabelIds`, nenhuma regra usa a quarentena, regras protegidas vencem promoções, mascaramento de códigos e comportamento DRY_RUN, regras protegidas no topo da lista e cobertura das novas regras, proteção da aba `auditoria` contra limpeza e registro da confirmação do Gmail.
- Aba `simulacao` para o DRY_RUN, limpa a cada execução; a aba `auditoria` passa a receber só as ações do modo APLICAR e nunca é limpa.
- Aba `aplicacoes` com a confirmação do Gmail para cada lote (`CONFIRMADO`/`ERRO`); a `auditoria` passa a registrar `PENDENTE` em vez de `ENVIADO`, e uma falha no `batchModify` não interrompe o registro.
- Documentação das regras em `docs/regras.md`.

### Corrigido
- Fase 1 subcontava a caixa: o limite `maxEmails` (5.000) cortava metade de uma caixa com mais de 10 mil e-mails, e leituras com falha eram descartadas sem aviso. O limite passa a 15.000 e o relatório ganha a seção "Cobertura da leitura" (encontrados, fora do limite, falhas de leitura, analisados), com alerta de relatório parcial no e-mail.
- Leituras da Fase 1 recusadas por cota (403 `rateLimitExceeded`) são relidas após 65 s de espera, mais devagar. A Cobertura mostra quantas foram recuperadas; antes, 4.311 de 10.218 leituras se perdiam numa caixa grande. Com a releitura, 4.684 leituras foram recuperadas e a cobertura chegou a 100%, sem falhas.

### Alterado
- E-mail do diagnóstico com novo layout: cabeçalho, cartões com os números principais, tabelas com linhas alternadas e barras de porcentagem, tudo com estilos inline compatíveis com Gmail e Outlook.
- Ritmo de leitura redistribuído para as duas fases caberem juntas na cota de 6.000 unidades/min: Fase 1 lê 10 e-mails por segundo (~3.000/min) e Fase 2/3 lê 10 a cada 1,6 s (~1.900/min). Um teste garante que a soma fique abaixo de 5.000.

## [0.3.1] - 2026-10-15
### Corrigido
- Erro 403 `rateLimitExceeded` (cota de 6.000 unidades/min por usuário da Gmail API) em caixas com milhares de e-mails: ritmo de leitura reduzido para cerca de 9 req/s e retentativas em todos os nós HTTP.

## [0.3.0] - 2026-10-15
### Alterado
- Cada execução cria uma aba própria `relatorio_AAAA-MM-DD_HH-mm` (horário de Brasília) e grava o relatório nela, preservando o histórico de diagnósticos em abas separadas.

## [0.2.1] - 2026-10-15
### Alterado
- A aba `relatorio` deixa de ser limpa: cada execução acrescenta um bloco novo, identificado por `geradoEm`, formando o histórico de diagnósticos. A aba `dados` continua sendo um retrato atual da caixa.

## [0.2.0] - 2026-10-15
### Adicionado
- Envio do relatório por e-mail via Gmail API com credencial dedicada de escopo `gmail.send` (só envio).
- Destinatário obtido automaticamente do perfil da conta.
### Removido
- Nó Gmail nativo, que exigia escopo de acesso total.

## [0.1.1] - 2026-10-15
### Adicionado
- Nós "Limpar aba dados" e "Limpar aba relatorio": cada execução substitui o diagnóstico anterior em vez de duplicar linhas (o cabeçalho é mantido).

## [0.1.0] - 2026-10-15
### Adicionado
- Workflow `fase1-diagnostico.json`: leitura completa da caixa (inclusive arquivados) em modo somente leitura.
- Relatório com totais, top remetentes e domínios, distribuição por ano, label e categoria, newsletters, notificações, e-mails antigos e anexos grandes.
- Mascaramento de códigos de verificação antes de gravar na planilha.
- Testes automatizados de segurança e de lógica, executados no GitHub Actions.
- Playbook de implementação em PDF (19 páginas).
