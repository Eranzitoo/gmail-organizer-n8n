# Regras de classificação (Fase 2/3)

Regras determinísticas derivadas do diagnóstico de 3.070 e-mails. A **primeira regra que casar vence**, e as regras protegidas vêm primeiro.

| ID | Condição | Marcador | Recomendação | Confiança |
|---|---|---|---|---|
| SEG-01 | Remetente Google Contas (inclusive avisos de dados compartilhados com outros apps) / Microsoft proteção de conta | 60-SEGURANCA/Alertas | PROTEGIDO | ALTA |
| SEG-02 | Remetente contas Riot Games / Supercell | 60-SEGURANCA/Login | PROTEGIDO | ALTA |
| SEG-03 | Assunto com código de verificação, acesso ou redefinição de senha | 60-SEGURANCA/Login | PROTEGIDO | ALTA |
| SEG-04 | Assunto com recuperação de conta | 60-SEGURANCA/Recuperacao | PROTEGIDO | ALTA |
| SEG-05 | Alertas de segurança do Asaas | 60-SEGURANCA/Alertas | PROTEGIDO | ALTA |
| FIN-01 | Copel faturamento / cobrança Afya | 50-FINANCEIRO/Faturas | PROTEGIDO | ALTA |
| FIN-02 | Assunto com boleto, fatura ou nota fiscal | 50-FINANCEIRO/Faturas | PROTEGIDO | ALTA |
| FIN-03 | Bybit / InfinitePay | 50-FINANCEIRO/Bancos | PROTEGIDO | ALTA |
| FIN-04 | Vivo (domínio principal; o de marketing fica em PROMO-01) | 50-FINANCEIRO/Faturas | PROTEGIDO | ALTA |
| DOC-01 | gov.br / TOTVS Assinatura / DocuSign | 10-PESSOAL/Documentos | PROTEGIDO | ALTA |
| DOC-02 | Celepar (governo do Paraná) | 10-PESSOAL/Documentos | PROTEGIDO | ALTA |
| SAU-01 | Unimed | 10-PESSOAL/Saúde | PROTEGIDO | ALTA |
| TRB-01 | CIEE / Greenhouse (estágio e processos seletivos) | 20-TRABALHO/Projetos | PROTEGIDO | ALTA |
| SIS-01 | Assunto "[Gmail] Diagnóstico" ou "[Gmail] Resumo" (relatórios do próprio sistema) | 40-NOTIFICACOES/Sistemas | MANTER | ALTA |
| SOC-01 | TikTok / LinkedIn / Facebook | 40-NOTIFICACOES/Redes sociais | MANTER | ALTA |
| SOC-02 | Categoria Social do Gmail | 40-NOTIFICACOES/Redes sociais | MANTER | MÉDIA |
| FER-01 | GitHub / Discord / Steam / Strava / compartilhamentos do Drive | 40-NOTIFICACOES/Ferramentas | MANTER | ALTA |
| COM-01 | Shopee / Mercado Livre na categoria Atualizações do Gmail (pedido, pagamento, entrega) | 40-NOTIFICACOES/Compras | MANTER | ALTA |
| NEWS-01 | Codecademy / Codédex / Curso em Vídeo / TryHackMe / OpenAI / the news | 30-NEWSLETTERS/Ler-depois | MANTER | ALTA |
| NEWS-02 | Dribbble / Spline | 30-NEWSLETTERS/Ler-depois | MANTER | ALTA |
| VAG-01 | Alertas de vagas: Catho / Infojobs / Netvagas | 30-NEWSLETTERS/Ler-depois | MANTER | ALTA |
| PROMO-01 | Shop2gether / Shopee / Kaluci / Vivo / Samsung / Canva / Serasa / Econodata / Pluto TV / Mercado Livre (marketing; os avisos de compra ficam em COM-01) | 30-NEWSLETTERS/Promoções | MANTER | ALTA |
| PROMO-03 | Sympla / Jusbrasil / AliExpress / BonifiQ / Velox Tickets / Afya (marketing) | 30-NEWSLETTERS/Promoções | MANTER | ALTA |
| PROMO-02 | Categoria Promoções **e** cabeçalho de lista | 30-NEWSLETTERS/Promoções | MANTER | MÉDIA |
| PADRAO | Nenhuma regra casou | 00-INBOX-ZERO/03-REVISAR | REVISAR | BAIXA |

## Garantias

- Nenhuma regra aponta para `99-REVISAR-EXCLUSAO`. A quarentena só entra na Etapa A, após revisão.
- O workflow **só adiciona** marcadores (`addLabelIds`): não arquiva, não marca como lido e não exclui.
- Em DRY_RUN o resultado vai para a aba `simulacao`, limpa a cada execução; a aba `auditoria` só recebe ações reais e nunca é limpa.
- No APLICAR, a `auditoria` registra a intenção (`PENDENTE`) e a aba `aplicacoes` registra a resposta do Gmail (`CONFIRMADO` ou `ERRO`); uma falha de credencial não deixa registro falso de sucesso.
- As regras protegidas ficam sempre no topo da lista (verificado por teste).
- Cada execução processa no máximo 200 e-mails sem marcador (`has:nouserlabels`), em DRY_RUN por padrão.
- Todas essas garantias são verificadas por testes no CI.

## Pendentes de decisão

- Remetentes de domínios amplos (`google.com`, `email.apple.com`) misturam recibos, avisos e marketing; ficam em `03-REVISAR` até haver regras por remetente.
- Remetentes mascarados (`privaterelay.appleid.com`) não são classificáveis pelo domínio e ficam em revisão manual.
