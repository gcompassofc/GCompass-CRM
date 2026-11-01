---
tags: [cliente/opa, tipo/roteiro]
atualizado: 2026-11-01
status: vigente
---

# CRM OPA: e-mails

Decisão de 01/11/2026: o CRM manda só e-mails **utilitários**. O relatório mensal ficou com a estrutura pronta e **desligado**.
Tudo sai pela Resend que a OPA já usa no site (o domínio `opailhabela.com.br` já está verificado lá).

## O que sai

| E-mail | Quem manda | Quando | Para quem |
|---|---|---|---|
| Convite da equipe | App (Resend) | Administrador ou gestor convida em Membros | A pessoa convidada |
| Senha alterada | App (Resend) | Logo depois de trocar a senha | A própria pessoa |
| Criar senha nova (esqueci a senha) | Supabase (SMTP da Resend) | Pedido em "Esqueci a senha" | A própria pessoa |
| Código de confirmação | Supabase | Operação que pede confirmar de novo | A própria pessoa |
| Troca de e-mail | Supabase | Pedido de troca de e-mail | E-mail antigo e novo |
| E-mail trocado, segundo fator adicionado ou removido | Supabase (aviso de segurança) | Depois da mudança | A própria pessoa |
| Convite e link mágico pelo painel do Supabase | Supabase | Só se alguém usar o painel | A pessoa |
| Relatório mensal | App (Resend) | **Desligado** | Gestores e administradores |

Remetente: `CRM OPA <crm@opailhabela.com.br>`. Nenhum desses e-mails leva nome ou telefone de lead.
O relatório leva só o primeiro nome de cada corretor.

## 1. Resend: chave só do CRM 🙋

Na mesma conta da Resend que manda os e-mails do site:

1. **API Keys > Create API Key.** Nome `crm-opa`, permissão **Sending access**, domínio **opailhabela.com.br**.
   Chave separada da do site: se uma vazar, a outra continua valendo, e a revogação não derruba o site.
2. Guarde a chave no cofre de senhas.
3. No `.env.producao` (e no `.env` da VPS):
   ```
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL='CRM OPA <crm@opailhabela.com.br>'
   ```
   O remetente vai entre aspas simples: sem elas, o `<` quebra quem lê o arquivo pelo shell.
4. 🤖 Reiniciar o app na VPS (`docker compose -f docker-compose.prod.yml up -d`) e rodar
   `node scripts/producao/conferir-producao.mjs`: a linha "e-mails pela Resend" deve dar ok.

## 2. Supabase: SMTP da Resend 🙋

Sem isto, o "Esqueci a senha" sai pelo servidor de testes do Supabase, que manda poucos e-mails por hora e com remetente do Supabase.

**Authentication > Emails > SMTP Settings** (ou Project Settings > Authentication), ligar **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | `crm@opailhabela.com.br` |
| Sender name | `CRM OPA` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a mesma chave `re_...` do passo 1 |

Depois, em **Authentication > Rate Limits**, conferir que o limite de e-mails por hora ficou num número de equipe (30 é suficiente).

## 3. Supabase: modelos em português 🙋

Os arquivos estão em `supabase/templates/opa/`. Para cada linha, abrir o modelo no painel, colar o assunto e trocar todo o HTML pelo conteúdo do arquivo.

**Authentication > Emails > Templates**

| Modelo no painel | Arquivo | Assunto |
|---|---|---|
| Reset password | `recovery.html` | Crie uma senha nova para o CRM da OPA |
| Reauthentication | `reauthentication.html` | Seu código de confirmação do CRM da OPA |
| Change email address | `email_change.html` | Confirme a troca de e-mail no CRM da OPA |
| Invite user | `invite.html` | Você foi convidado para o CRM da OPA |
| Magic link | `magic_link.html` | Seu link de acesso ao CRM da OPA |
| Confirm signup | `confirmation.html` | Confirme seu e-mail no CRM da OPA |

**Authentication > Emails > Security notifications** (avisos de segurança)

| Aviso | Ligar? | Arquivo | Assunto |
|---|---|---|---|
| Email address changed | sim | `email_changed_notification.html` | O e-mail da sua conta no CRM da OPA mudou |
| MFA method added | sim | `mfa_factor_enrolled_notification.html` | Novo método de verificação no CRM da OPA |
| MFA method removed | sim | `mfa_factor_unenrolled_notification.html` | Método de verificação removido no CRM da OPA |
| Password changed | **não** | | o app já manda, ligar aqui chegaria em dobro |
| Identity linked, unlinked, Phone changed | não | | o CRM não usa |

Todo link dos modelos vai para `{{ .SiteURL }}/auth/confirm`, então o **Site URL** do painel precisa ser
`https://crm.opailhabela.com.br` (Authentication > URL Configuration), como já está.

Se um texto mudar: editar `lib/email/modelos-supabase-opa.ts`, rodar `npx tsx scripts/gerar-modelos-email-opa.ts`
e colar de novo. O teste `tests/unit/emails-opa.test.ts` reprova se os arquivos ficarem diferentes do código.

Pela Management API (com token de acesso), os modelos de e-mail com link usam os campos
`mailer_subjects_<modelo>` e `mailer_templates_<modelo>_content` em `PATCH /v1/projects/{ref}/config/auth`,
com `<modelo>` = `recovery`, `reauthentication`, `email_change`, `invite`, `magic_link`, `confirmation`.
Os avisos de segurança, fazer pelo painel.

## 4. Testar 🙋🤖

1. Convidar um e-mail seu como Corretor em Membros: o e-mail chega com o botão "Aceitar convite".
2. Em `/login`, "Esqueci a senha" com esse e-mail: chega "Crie uma senha nova", o link abre a tela de senha.
3. Trocar a senha: chega "Sua senha foi alterada".
4. Na Resend, em **Emails**, os envios aparecem com as etiquetas `team_invite` e `senha_alterada`.

## Relatório mensal (estrutura pronta, desligado)

- **O que calcula** (`lib/opa/relatorio-mensal.ts`), do mês anterior no horário de São Paulo, funil de compradores:
  leads novos por origem, primeira resposta no prazo (geral e por corretor, mesma regra do Início), funil por etapa,
  visitas, propostas, vendas (valor só se o gestor vê receita) e motivos de perda.
- **Limite:** o funil é a foto do fim do mês dos leads criados no mês. Conversão por etapa precisa do histórico de
  etapas (item D2 da revisão de 31/10).
- **Conferir sem mandar:** `GET /api/v1/cron/opa-relatorio-mensal?previa=1` com o segredo do agendador devolve os números.
- **Para ligar:** `OPA_RELATORIO_MENSAL=on` no `.env` e uma linha no agendador do `docker-compose.prod.yml`
  para o dia 1 às 8h de São Paulo (`0 11 1 * *` em UTC). Quem recebe: gestores e administradores ativos.
- **Para alguém sair:** `user_metadata.emails_opa.relatorio_mensal = false` na conta da pessoa (falta a chave na tela de perfil).

## Arquivos

- `lib/email/molde.ts`: molde único (marca da OPA, tabela e estilo inline, logo em PNG).
- `lib/email/templates/invite.ts`, `senha-alterada.ts`, `relatorio-mensal.ts`.
- `lib/email/modelos-supabase-opa.ts` e `scripts/gerar-modelos-email-opa.ts`: modelos do Supabase.
- `public/opa/opa-logo-email.png`: logo para e-mail (Gmail e Outlook não mostram SVG).
- `app/auth/confirm/route.ts`: trata recovery, invite, magiclink, email_change e signup.
