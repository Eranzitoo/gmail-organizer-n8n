# 📬 Gmail Organizer com n8n

![CI](https://github.com/Eranzitoo/gmail-organizer-n8n/actions/workflows/ci.yml/badge.svg)
![n8n](https://img.shields.io/badge/n8n-workflow-EA4B71)
![Gmail API](https://img.shields.io/badge/Gmail%20API-readonly-0F766E)
![Fase 1](https://img.shields.io/badge/fase%201-concluída-success)
![Fase 2/3](https://img.shields.io/badge/fase%202%2F3-em%20validação-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)

Automação no **n8n** para diagnosticar, organizar e gerar relatórios de uma caixa **Gmail pessoal** com milhares de e-mails acumulados. O princípio central é **segurança por design**: nada é excluído automaticamente, e cada fase usa a menor permissão possível.

> 🇺🇸 **English summary:** an n8n automation that audits, classifies and reports on a cluttered personal Gmail inbox. It is built around least-privilege OAuth scopes (phase 1 is read-only by design), deterministic rules first with AI only for ambiguous cases, a quarantine label instead of deletion, a full audit log in Google Sheets, and automated security tests in CI.

---

## O problema

Uma caixa com mais de 3.000 e-mails: newsletters, promoções, notificações e mensagens importantes misturadas. Limpar na mão é lento. Uma automação ingênua de "apagar lixo" é arriscada, porque um boleto, um exame ou um código de recuperação classificado errado pode ser perdido.

## A abordagem

| Princípio | Como foi aplicado |
|---|---|
| **Menor privilégio** | A Fase 1 usa só o escopo `gmail.readonly`. Ela é *tecnicamente incapaz* de alterar a caixa, porque o próprio Google recusaria. |
| **Nada é excluído automaticamente** | "Lixo" vai para a label `99-REVISAR-EXCLUSAO`. Esvaziar essa label exige uma execução manual, com prévia e confirmação. |
| **Categorias protegidas** | Financeiro, saúde, documentos, segurança e trabalho nunca vão para a quarentena. |
| **Regras antes de IA** | Regras determinísticas resolvem a maioria dos casos. A IA só entra nos ambíguos, o que reduz custo e risco. |
| **Confiança baixa vai para revisão** | Se a classificação for incerta, o e-mail vai para `03-REVISAR`, nunca para a quarentena. |
| **Auditoria completa** | Cada ação registra o que havia antes, o que foi feito e o motivo. |
| **Liberação gradual** | A quarentena começa só com ruído óbvio. Newsletters e e-mails antigos entram depois de semanas de revisão. |
| **Privacidade** | Lê só metadados e o trecho inicial, e mascara códigos de verificação antes de gravar. |

## Arquitetura da Fase 1 — Diagnóstico

```mermaid
flowchart LR
    A[▶ Início manual] --> B[Config]
    B --> C[Listar labels]
    C --> D[Listar IDs com anexo<br/><i>paginado</i>]
    D --> E[Juntar IDs]
    E --> F[Listar mensagens<br/><i>paginado, inclui arquivados</i>]
    F --> G[Separar] --> H[Limitar lote]
    H --> I[Buscar metadados<br/><i>20 req/s, retry</i>]
    I --> J[Normalizar<br/><i>mascara códigos</i>]
    J --> K[(Sheets: dados)]
    J --> L[Agregar relatório]
    L --> M[(Sheets: nova aba<br/>relatorio_data-hora)]
    L --> N[Montar HTML] --> P[Obter meu e-mail] --> Q[Codificar MIME] --> O[✉ Enviar<br/><i>só gmail.send</i>]

    classDef read fill:#E6F4F2,stroke:#0F766E;
    class C,D,F,I read;
```

Os nós em verde chamam a Gmail API **apenas com GET** usando uma credencial `gmail.readonly`. O envio do relatório usa uma **segunda credencial, só com `gmail.send`**, e o destinatário é sempre o próprio dono da conta, obtido via `/users/me/profile`. A credencial nativa "Gmail" do n8n pede o escopo total `https://mail.google.com/`, por isso foi evitada de propósito.

**O relatório gerado inclui:** total de e-mails, top 30 remetentes, top domínios, e-mails por ano, por label e por categoria do Gmail, principais newsletters (com contagem de não lidos), notificações automáticas, e-mails antigos por remetente e os 30 maiores e-mails com anexo.

Detalhes técnicos em [`docs/arquitetura.md`](docs/arquitetura.md) e no modelo de segurança em [`docs/seguranca.md`](docs/seguranca.md).

## Roadmap

| Fase | Entrega | Escopo Gmail | Status |
|---|---|---|---|
| 1. Diagnóstico | Leitura completa, planilha e relatório por e-mail | `gmail.readonly` + `gmail.send` | ✅ Concluída |
| 2. Classificação | 15 regras determinísticas, auditoria em planilha, DRY RUN por padrão | `gmail.readonly` | 🧪 Em validação |
| 3. Organização | Aplicação de marcadores via `batchModify` (só adiciona); arquivamento e quarentena em etapas | `gmail.modify` | 🧪 Em validação |
| 4. Relatórios | Relatórios diário e semanal | `gmail.modify` | ⏳ Planejada |
| 5. Manutenção | Rotina diária e workflow manual "Esvaziar quarentena" | `gmail.modify` | ⏳ Planejada |

O escopo `https://mail.google.com/`, único que permite exclusão permanente, **não é usado em nenhuma fase**.

## Como usar

1. Crie um projeto no Google Cloud e ative as APIs do Gmail, Sheets e Drive.
2. Crie uma credencial **Google OAuth2 API** no n8n com o escopo `https://www.googleapis.com/auth/gmail.readonly`.
3. Crie a planilha `Gmail - Diagnóstico` com as abas `dados` e `relatorio`.
4. Importe [`workflows/fase1-diagnostico.json`](workflows/fase1-diagnostico.json) e ligue as credenciais.
5. Rode primeiro com `maxEmails = 200` e depois na caixa inteira.

📘 O passo a passo completo, do zero e com solução de problemas, está no **[Playbook de implementação (PDF)](docs/playbook-fase1.pdf)**. O playbook cobre a configuração inicial; as melhorias posteriores (envio por e-mail, aba por execução, ajuste de cota) estão no [CHANGELOG](CHANGELOG.md).

## Qualidade e testes

```bash
npm test          # testes de segurança e de lógica (Node 20+, sem dependências)
npm run extract   # extrai o JS dos nós Code para src/code-nodes/
```

O CI (GitHub Actions) valida a cada push que:
- a leitura usa **apenas GET**, e o único POST é o envio do relatório para o próprio e-mail;
- o nó Gmail nativo, que tem escopo amplo, não é usado;
- não há gatilho automático nem segredos (client secret, tokens) no JSON;
- a lógica de normalização, mascaramento e agregação funciona com mensagens simuladas;
- o código em `src/` está sincronizado com o workflow.

## Estrutura

```
├── workflows/
│   ├── fase1-diagnostico.json         # diagnóstico somente leitura
│   └── fase2-3-classificar-aplicar.json # classificação + aplicação de marcadores
├── src/code-nodes/                    # JS dos nós Code, legível para revisão
├── tests/                             # testes de segurança e lógica (17)
├── scripts/extract-code-nodes.js      # sincroniza src/ a partir do JSON
├── docs/
│   ├── playbook-fase1.pdf             # guia de implementação do zero
│   ├── arquitetura.md                 # nó a nó, API, paginação, limites
│   ├── seguranca.md                   # modelo de ameaças e escopos
│   ├── planilhas.md                   # esquema das planilhas
│   └── regras.md                      # regras de classificação
└── .github/workflows/ci.yml
```

## Stack

<p>
  <img alt="n8n" src="https://img.shields.io/badge/n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white">
  <img alt="Gmail API" src="https://img.shields.io/badge/Gmail_API-EA4335?style=for-the-badge&logo=gmail&logoColor=white">
  <img alt="Google OAuth 2.0" src="https://img.shields.io/badge/OAuth_2.0-4285F4?style=for-the-badge&logo=google&logoColor=white">
  <img alt="Google Sheets API" src="https://img.shields.io/badge/Google_Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js_test-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white">
</p>

| Tecnologia | Papel no projeto |
|---|---|
| **n8n** (self-hosted) | Orquestração dos workflows |
| **Gmail API (REST)** | Leitura, envio do relatório e aplicação de marcadores, cada um com escopo próprio |
| **Google OAuth 2.0** | Credenciais separadas por escopo (`readonly`, `send`, `modify`) |
| **Google Sheets API** | Relatórios de diagnóstico e trilha de auditoria |
| **JavaScript** | Lógica dos nós Code: normalização, classificação e agregação |
| **Node.js `node --test`** | Testes de segurança e lógica, sem dependências |
| **GitHub Actions** | CI: valida o JSON, roda os testes e confere a sincronia de `src/` |

## Autor

**Eric Andrey dos Santos** — Análise e Desenvolvimento de Sistemas · Segurança Cibernética · Pato Branco, PR — [LinkedIn](https://linkedin.com/in/Eranzito) · [GitHub](https://github.com/Eranzitoo)
