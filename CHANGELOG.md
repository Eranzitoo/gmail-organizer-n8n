# Changelog

## [0.4.0] - 2026-10-15
### Adicionado
- Workflow `fase2-3-classificar-aplicar.json`: 15 regras determinísticas (protegidas primeiro), auditoria completa na aba `auditoria`, modo DRY_RUN por padrão e aplicação de marcadores via `messages.batchModify` (só `addLabelIds`).
- Processamento incremental: cada execução pega até 200 e-mails ainda sem marcador.
- 8 regras adicionais após a validação em DRY_RUN, reduzindo os e-mails sem regra: bancos (Bybit, InfinitePay), faturas da Vivo, alertas do Asaas, Celepar, estágio e processos seletivos (CIEE, Greenhouse), alertas de vagas, newsletters de design e promoções diversas.
- 11 testes novos: único POST é `batchModify`, sem `removeLabelIds`, nenhuma regra usa a quarentena, regras protegidas vencem promoções, mascaramento de códigos e comportamento DRY_RUN, regras protegidas no topo da lista e cobertura das novas regras proteção da aba `auditoria` contra limpeza e registro da confirmação do Gmail.
- Aba `simulacao` para o DRY_RUN, limpa a cada execução; a aba `auditoria` passa a receber só as ações do modo APLICAR e nunca é limpa.
- Aba `aplicacoes` com a confirmação do Gmail para cada lote (`CONFIRMADO`/`ERRO`); a `auditoria` passa a registrar `PENDENTE` em vez de `ENVIADO`, e uma falha no `batchModify` não interrompe o registro.
- Documentação das regras em `docs/regras.md`.

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
