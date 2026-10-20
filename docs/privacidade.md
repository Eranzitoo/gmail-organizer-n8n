# Política de privacidade — gmail-organizer-n8n

Última atualização: 20/10/2026

O gmail-organizer-n8n é uma automação pessoal, de código aberto, que roda numa instância do n8n controlada pelo próprio dono da conta Google. Não existe servidor central: cada pessoa que usa o projeto conecta a própria conta, no próprio n8n.

## Dados acessados

| Serviço Google | Escopo | Para quê |
|---|---|---|
| Gmail | `gmail.readonly` | Ler os e-mails para diagnosticar, classificar e resumir |
| Gmail | `gmail.modify` | Só adicionar marcadores. Nada é excluído, arquivado nem marcado como lido |
| Gmail | `gmail.send` | Enviar os relatórios, sempre para o próprio dono da conta |
| Google Agenda | `calendar.events.owned` | Criar eventos numa agenda dedicada, sem convidados |
| Google Planilhas | `spreadsheets` | Gravar o diagnóstico, a auditoria e o histórico |

## Onde os dados ficam

- Na própria conta Google do usuário (Gmail, Agenda e uma planilha dele).
- Na instância do n8n do próprio usuário, no histórico de execuções.

O projeto não envia dados para nenhum servidor do autor, não vende dados e não os compartilha com terceiros, com uma exceção, descrita abaixo.

## Envio para a IA (Gemini)

O workflow gmail-sync envia o conteúdo de e-mails novos à API do Gemini, do Google, para gerar um resumo, sugerir um marcador e identificar compromissos. Antes do envio:

- alertas de segurança, promoções, newsletters, redes sociais e remetentes da lista `remetentesIgnorados` não são enviados;
- números de cartão, CPF, linhas digitáveis de boleto e códigos de verificação são mascarados;
- vão só o remetente, o assunto, a data e o corpo do e-mail, limitado em tamanho; nunca anexos, cópias ou cabeçalhos completos.

No plano gratuito da API do Gemini, o Google pode usar o conteúdo enviado para melhorar seus produtos, conforme os termos dele. Quem não quiser isso pode ativar o faturamento no projeto do Google Cloud ou desligar o envio à IA.

## Uso dos dados do Google

O uso das informações recebidas das APIs do Google segue a [Política de Dados do Usuário dos Serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de uso limitado. Os dados só são usados para as funções descritas acima, a pedido e em benefício do próprio usuário.

## Como remover o acesso e os dados

- Revogue o acesso em [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Apague as credenciais e o histórico de execuções no n8n.
- Apague a planilha e a agenda dedicada, se quiser.
- Os marcadores adicionados podem ser removidos no próprio Gmail.

## Contato

Dúvidas ou pedidos: abra uma issue em [github.com/Eranzitoo/gmail-organizer-n8n](https://github.com/Eranzitoo/gmail-organizer-n8n/issues).
