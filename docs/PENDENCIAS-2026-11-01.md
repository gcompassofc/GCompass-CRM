---
tags: [cliente/opa, tipo/pendencias]
atualizado: 2026-11-01
status: vigente
---

# CRM OPA: erros e vulnerabilidades para corrigir (01/11/2026)

Levantado depois de colocar o CRM no ar: conferência da produção (servidor, banco, rotinas) e revisão
independente do código que entrou em 01/11 (`a099d8cf7..93f19408f`). Os dois achados altos do código
foram conferidos à mão. Hoje só existe o administrador: nada aqui foi explorado, mas os itens **antes da equipe**
precisam estar corrigidos antes de convidar corretores.

## Situação no fim de 01/11/2026

**Resolvido e publicado** (commits `c8a7f42bc`, `bd367afe7` e `e769d56a8`, migrations 0121 e 0122 no Supabase):
A1 a A7, S1 (cadastro fechado no Supabase), S2 (SSH só por chave e fail2ban), S3 (segredo do cron trocado),
S5 (instalador corrigido), C1 a C9. Teste completo por papel: 66/66 telas, 36/36 brechas recusadas
(`docs/TESTE-COMPLETO-2026-11-01.md`). IA corrigida e testada (`docs/TESTE-IA-2026-11-01.md`).

**Ainda aberto:**
- S4: o repositório `gcompassofc/GCompass-CRM` é público (fork). Nunca enviar o ramo `opa/crm-local` para ele;
  backup só num repositório privado novo.
- S6: CAPTCHA no login, segundo fator exigido no banco e teste de restauração do backup.
- Decisões do Allyson: "Abrir conversa" dentro da ficha (recomendado) e aviso de lead novo no celular (U2).
- Se o erro `insertBefore` da ficha voltar em produção, anotar navegador e extensões do corretor.

## Antes de convidar a equipe

| # | Onde | Problema | Correção |
|---|---|---|---|
| A1 | `channel_sessions` (política `tenant_isolation_all`, baseline) | Qualquer membro altera qualquer número de WhatsApp: troca o dono, o telefone ou arquiva o OPA Lembretes. Um corretor pode tomar o número do colega ou passar a receber avisos de leads que não vê | UPDATE e DELETE só para admin; gatilho que bloqueia mudar `owner_user_id`, `phone_number`, `waha_session_name` e `archived_at` fora do service_role |
| A2 | `lib/opa/rotina-lembretes.ts` (candidatos e repasse) | O repasse da roleta tira o lead em qualquer etapa: cliente em negociação manda "ok, obrigado" e o lead vai para outro corretor. Também ignora `lembretes_desligados` | Repassar só lead sem nenhuma resposta anterior (ou na etapa `lead-recebido`) e pular quem está com lembretes desligados |
| A3 | Banco: 5 funções SECURITY DEFINER com EXECUTE para `anon` | `fn_decrypt_oauth`, `fn_encrypt_oauth`, `fn_lgpd_cascade_redact_contact`, `activate_kb_version`, `fn_update_budget_consumption` podem ser chamadas por visitante pela API (`/rest/v1/rpc`). A de LGPD apaga dados de um contato se souberem os ids | `revoke execute ... from anon` (e de `authenticated` nas de decifrar e LGPD); corrigir o `ALTER DEFAULT PRIVILEGES ... TO anon` do baseline |
| A4 | Etiquetas `proprio`, `pago`, `organico` | O corretor grava `proprio` nos próprios leads pela ação em lote e escapa do repasse | Etiquetas reservadas: recusar na rota bulk e num gatilho |
| A5 | `lembretes_write` (baseline) | Corretor agenda texto livre para qualquer colega, saindo do número oficial OPA Lembretes (phishing interno) | `with check`: `para_user_id = auth.uid()` ou dono do lead, salvo gerente para cima |
| A6 | `lib/opa/aviso-whatsapp.ts` | Aviso procura o número pelo nome quando não acha o dono; o nome é editável pelo próprio usuário | Usar só `owner_user_id`; nome só para sessão antiga sem dono |
| A7 | Convite pelo gerente | A rota devolve o link de aceite ao gerente, que pode criar conta confirmada para um e-mail que não é dele | Não devolver `accept_url` para quem não é admin |

## Servidor e contas

| # | Problema | Correção |
|---|---|---|
| S1 | Supabase ainda aceita cadastro aberto (conferência falha nisso) | Desligar "Allow new users to sign up", senha mínima 12, URL Configuration (🙋) |
| S2 | SSH aceita login do root por senha; sem fail2ban | `PasswordAuthentication no` (a chave já funciona; o terminal do navegador da Hostinger usa chave própria) e instalar fail2ban |
| S3 | O segredo do agendador (`INTERNAL_CRON_SECRET`) apareceu numa saída de comando na conversa de 01/11 | Gerar novo, trocar no `.env` da VPS e no crontab, `up -d` |
| S4 | A imagem `ghcr.io/gcompassofc/gcompass-crm` antiga é **pública** no GitHub (a VPS baixou sem senha) | Tornar o pacote privado ou apagar as versões antigas |
| S5 | O instalador descarta variáveis, volta o pull para `always` e liga o Sentry da comunidade | Corrigir o `install.sh` (preservar chaves desconhecidas, respeitar `APP_PULL_POLICY` e `SENTRY_DSN`) antes da VPS de 12 meses |
| S6 | Backup do Supabase sem teste de restauração; CAPTCHA no login; segundo fator exigido também no banco | Itens E3, S2 e S1 da revisão de 31/10 |

## Correções de comportamento

| # | Onde | Problema | Correção |
|---|---|---|---|
| C1 | Rotina de lembretes | Lead preso: dono que saiu da equipe ou próximo da roleta que saiu fazem a rotina pular para sempre | Filtrar a roleta pela equipe e escalar lead de dono que saiu |
| C2 | Início, "No prazo" | Quem recebe lead repassado já nasce fora do prazo; "Respondi" ou ligação repetidos sobrescrevem a primeira resposta | Início = maior entre criação e `assigned_at`; gravar `primeiro_respondido_em` que não se sobrescreve |
| C3 | Lembrete agendado | Pode sair duplicado (erro ambíguo do WAHA) ou se perder (processo cai depois da reserva) | Estado `enviando` com varredura de travados |
| C4 | Repasse com falha passageira | A espera é encerrada como "pulado" e nunca mais repassa; repasse acontece mesmo sem aviso enviado | Apagar a reserva quando o update falha; repassar só depois de um aviso que saiu |
| C5 | Mensagens | Gerente ainda apaga mensagem e corretor pode reescrever o corpo (contradiz "o histórico fica") | Exclusão só admin; UPDATE só nas colunas de status |
| C6 | Ficha do lead | Usa `getSession()` no servidor; qualquer viewer dispara leitura paga da IA | Token depois de `getUser()`; pular leitura para viewer |
| C7 | Meu WhatsApp | Aceita o papel `ai_operator` | Mesma regra de `podeMexerNoNumero` |
| C8 | `lib/opa/entrada.ts` | Update de etiquetas com cliente admin sem filtro de organização; etiqueta gravada no meio se perde | `.eq("organization_id", orgId)` e anexo atômico |
| C9 | Testes | 7 testes unitários já falhavam antes de 01/11 (clipboard, agents-md, canais, env-example, import-puro, navegação) | Corrigir ou atualizar |

## Conferido e ok

Todas as tabelas com RLS; toda SECURITY DEFINER com `search_path` fixo; objetos 0118 a 0120 no banco; buckets privados;
administrador com segundo fator; só 22, 80 e 443 abertas (WAHA, Redis e app na rede interna); CSP e HSTS no ar;
rotinas `opa-lembretes`, `opa-copiloto`, `cifrar-dados` e `event-log-drain` respondendo 200 e recusando sem segredo
(comparação em tempo constante); cifra de dados pessoais ativa; IA com saída restrita e sem dado pessoal no log;
exclusão de lead só por admin; convite do gerente limitado a corretor no servidor.
