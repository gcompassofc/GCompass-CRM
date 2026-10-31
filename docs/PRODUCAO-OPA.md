---
tags: [cliente/opa, tipo/roteiro]
atualizado: 2026-10-31
status: vigente
---

# CRM OPA: roteiro para colocar no ar

Roteiro único para tirar o CRM da OPA do computador e colocar em produção.
Cada passo diz **quem faz**: 🙋 é do Allyson (conta, cartão, celular, decisão), 🤖 a IA executa.
Nada aqui foi publicado ainda: banco, servidor e domínio de produção não existem.

## Onde paramos (31/10/2026)

**Estado:** build de produção passa (3 min 30 s), 64 testes da OPA passam, banco zerado com 0110 a 0117 passa
(462 testes de invariantes). Tudo commitado no ramo `opa/crm-local`, **sem push**.

**Feito até aqui:** auditoria de segurança, cifra dos dados (fases 1 e 2), velocidade com 1.500 leads,
copiloto com o contexto da OPA, ligação em um toque, montar seleção, fotos da equipe e a mescla do protótipo
de telas por permissão (Início do corretor, do gerente e do administrador, menu por papel, barra do celular).

**Para retomar, nesta ordem:**

1. 🙋 Responder as decisões pendentes: D1 (servidor), D3 (conta do Supabase), D6 (chave da IA) e as 3 de permissão:
   o gerente convida corretores? Excluir lead só com o administrador? O corretor liga o próprio WhatsApp?
2. 🤖 Bloco "antes da equipe usar" da [revisão de 31/10](REVISAO-COMPLETA-2026-10-31.md): F1 (lembretes, avisos e
   repasse rodando), F2 (configurações valendo), F3 (números do Início), E1 (gravação sem sobrescrever),
   U1 (busca no celular), U3 (retorno nas ações), V1 (ficha sem esperar a IA), I1 e I2 (saída estruturada e cache da IA).
3. 🙋🤖 Seções 2 a 7 deste roteiro: contas, Supabase, imagem, instalação, conferência, WhatsApp e equipe.
4. 🤖 Testar a IA com 30 conversas reais da OPA, anonimizadas (I3 da revisão).

Para abrir o CRM no computador: Docker Desktop ligado, depois `./node_modules/.bin/next dev -p 3000` nesta pasta.
Logins de demonstração: `marco@opa.local` (gerente) e `luana@opa.local` (corretora), senha no `scripts/seed-opa.ts`.

## 0. O que já está pronto (30/10/2026)

- Código no ramo local `opa/crm-local` do `gcompassofc/GCompass-CRM`, commitado, **sem push**.
- Auditoria de segurança feita e corrigida: [AUDITORIA-SEGURANCA-2026-10-30.md](AUDITORIA-SEGURANCA-2026-10-30.md).
- Banco: migrations 0110 a 0117 da OPA, também copiadas como apêndice no `supabase/baseline.sql`
  (é o arquivo que o instalador aplica). Ensaio num Postgres zerado: instalação e reaplicação passam.
- Scripts de produção em `scripts/producao/`:

| Script | Faz | Grava? |
|---|---|---|
| `gerar-segredos.mjs` | cria o `.env.producao` a partir do `.env.producao.example` e gera todas as chaves | só o arquivo local |
| `preparar-opa.ts` | empresa OPA, 3 funis, token da porta de entrada, configuração, imóveis do site, convite do admin | sim, só cria o que falta, nunca apaga |
| `conferir-producao.mjs` | confere arquivo, Supabase e app no ar; lista ok, atenção e falhou | não |

- Instalador do servidor: `hostgator-setup-kit/` (vale para qualquer VPS com Docker, não só HostGator).

## 1. Decisões antes de começar 🙋

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Onde roda o app | VPS **separada** só para o CRM (2 vCPU, 4 GB). Dá para usar a VPS do n8n (EasyPanel, modo Traefik do kit), mas aí uma falha no n8n alcança os dados dos leads |
| D2 | Endereço | `crm.opailhabela.com.br` (registro A no DNS da OPA apontando para a VPS) |
| D3 | Conta do Supabase | Conta da G-Compass ou da OPA. Plano pago para produção: o grátis pausa o projeto parado e não guarda backup diário. Região **São Paulo (sa-east-1)** |
| D4 | Números de WhatsApp | **Resolvido:** desde a versão 2026.6.1 o WAHA gratuito atende **números ilimitados** (o Plus deixou de existir). Testado no local (2026.9.2): várias sessões no mesmo contêiner. Um número por corretor mais o OPA Lembretes cabe sem custo de licença; o limite real é memória da VPS. Doação opcional: 5 dólares por mês, sem benefício |
| D5 | Gerente vê integrações, token e comissão? (P10 da auditoria) | **Decidido em 30/10/2026: vê.** O `preparar-opa.ts` grava `gerente_ve_receita: true` |
| D6 | Chave da IA do copiloto | Chave Anthropic da OPA com limite de gasto. Sem chave, o copiloto funciona por regras |
| D7 | E-mail dos convites | Opcional (Resend). Sem ele, a tela Membros mostra o link para mandar pelo WhatsApp |

## 2. Contas 🙋

1. **Supabase**: criar um *Personal Access Token* (Account > Access Tokens) e me passar **na hora da instalação**,
   pelo terminal, nunca por arquivo. O `hostgator-setup-kit/supabase-provision.sh` cria o projeto e devolve as 4 credenciais.
   Depois da instalação, revogar o token.
2. **VPS**: contratar (D1) e me passar o acesso SSH (IP, usuário, chave). Ubuntu 22.04 ou 24.04.
3. **DNS**: criar o registro A de `crm.opailhabela.com.br` para o IP da VPS. Se o DNS estiver na Cloudflare, deixar
   **sem proxy (nuvem cinza)** até o certificado sair; depois pode ligar.
4. **GitHub**: ok para eu fazer o push do ramo e publicar a imagem (seção 4).

## 3. Configurar o Supabase de produção 🤖 (com 🙋 só onde marcado)

No painel do projeto (ou pela Management API com o token):

1. **Authentication > Sign In / Providers**: desligar **Allow new users to sign up**.
   ⚠️ **Não** desligar o provedor **Email**: ele é o login com senha. Desligado, ninguém entra
   (aconteceu no ensaio local: `[auth.email] enable_signup=false` derruba o login).
2. **Authentication > Sign In / Providers > Email**: senha mínima de **12** caracteres, com letras e números.
3. **Authentication > Rate Limits**: manter o padrão do Supabase (login e cadastro limitados por IP).
4. **Authentication > URL Configuration**: Site URL `https://crm.opailhabela.com.br`; redirects
   `https://crm.opailhabela.com.br/auth/confirm` e `/auth/callback`.
5. **Multi-Factor**: TOTP ligado (já é o padrão). O admin cadastra o segundo fator no primeiro login.
6. ⚠️ **CAPTCHA: deixar desligado por enquanto.** O formulário de login do app ainda não envia o token do
   CAPTCHA; ligar no Supabase trava o login de todo mundo. Fica como pendência (seção 9).
7. **Database > Backups**: confirmar backup diário (plano pago) e fazer **um teste de restauração** antes de
   chamar a equipe.
8. **Settings > Database > SSL**: exigir SSL. Usar a connection string do **pooler (Session, porta 5432)**,
   que funciona de VPS só com IPv4.

## 4. Imagem do app 🤖

O instalador puxa a imagem pronta do GitHub Container Registry. A do projeto original **não tem** o CRM da OPA.

- Caminho recomendado: push do ramo e rodar o workflow **Publicar imagem Docker (GHCR)** manualmente
  (`workflow_dispatch`) no ramo. A imagem sai como `ghcr.io/gcompassofc/gcompass-crm`.
  O repositório é privado, então a VPS precisa de um token de leitura de pacotes (🙋 GitHub > Settings >
  Developer settings > token com `read:packages`).
- Alternativa sem registry: montar a imagem na própria VPS com `docker-compose.build.yml` (pede 4 GB de RAM
  e uns 20 minutos).

## 5. Instalação 🤖

Na minha máquina:

```bash
node scripts/producao/gerar-segredos.mjs        # cria .env.producao com todas as chaves
```

🙋 **Guardar no cofre de senhas da G-Compass** as três chaves `PII_*` do `.env.producao`. Sem elas, nome,
telefone e conversa cifrados não abrem mais. Eu não copio para lugar nenhum (regra do cofre).

Na VPS (eu conduzo por SSH): clonar o repositório, levar o `.env.producao` como `.env` e rodar
`bash hostgator-setup-kit/install.sh`. Ele:

1. aplica o `supabase/baseline.sql` (base inteira mais as migrations da OPA);
2. cria o primeiro admin (`OWNER_EMAIL`, segundo fator obrigatório no primeiro login) e a empresa `minha-empresa`;
3. sobe app, worker, WAHA, Redis, agendador e Caddy (HTTPS automático). Só as portas 80 e 443 ficam abertas.

Depois, da minha máquina:

```bash
npx tsx scripts/producao/preparar-opa.ts --env .env.producao \
  --confirmar <ref>.supabase.co --imoveis "D:/1. OPA/1. SITE/dados/imoveis.json"
```

A empresa criada pelo instalador vira a OPA (o admin continua), entram os 3 funis, o token da porta de
entrada e os 71 imóveis do site. Pode rodar de novo sempre que quiser atualizar os imóveis.

🙋 Apagar o `OWNER_PASSWORD` do `.env` da VPS depois do primeiro login.

## 6. Conferência 🤖

```bash
node scripts/producao/conferir-producao.mjs
```

Tudo precisa sair **ok**. Ele confere: chaves no formato certo e diferentes das locais, Sentry desligado,
cadastro fechado no app e no Supabase, login por e-mail ligado, anônimo sem acesso, migrations aplicadas,
empresa e funis, cifra rodando, CSP, HSTS, `/signup` fechado, rotinas e porta de entrada recusando quem não
tem segredo, e WAHA, Redis e app sem porta aberta para a internet.

## 7. WhatsApp e equipe 🙋

1. **Conexões**: escanear o QR com o celular de cada número (D4).
2. **Membros > Convidar**: um convite por corretor. O link vale 24 h; quem recebe cria a própria senha
   (12 caracteres ou mais). Gerente com papel `manager`, corretores `agent`.
3. **Configurações > Roleta**: colocar os corretores na ordem. Sem roleta, lead novo do site não tem dono.
4. Cada admin e gerente cadastra o segundo fator em `/app/settings/security`. A partir daí, o servidor só
   deixa entrar com o código (testado no local).

## 8. Site e Painel ligados ao CRM 🤖 (publicação só com 🙋 ok)

- **Site > CRM**: o formulário do site (`POST /api/lead` no Cloudflare Pages) passa a repassar o lead para
  `https://crm.opailhabela.com.br/api/v1/webhooks/opa-entrada/opa` com `Authorization: Bearer <token>`.
  O token fica em **Conexões** e entra como segredo do Pages (nunca no código). Mexe no repositório do site:
  deploy só com o ok do Allyson.
- **Painel > CRM** (ficha de visita, off market, captação): webhooks nos dois sentidos ou servidor MCP.
  Desenho na conversa de 30/10/2026; começa depois do CRM estável.

## 9. Pendências que não bloqueiam a estreia

| Item | Por que espera |
|---|---|
| CAPTCHA no login (Turnstile no formulário mais o Supabase) | o app ainda não manda o token; o limite por IP e o bloqueio por conta e IP já seguram o grosso |
| Envio das conversões ao Meta (CAPI) | a fila `eventos_meta` já existe; falta o envio, que pede Pixel ID e token da OPA 🙋 |
| Cifra fase 3 (apagar o texto puro) | primeiro a leitura de todas as telas passa a usar o cifrado; antes disso, apagar quebra o app |
| CPF com hash simples (`cpf_hash`) | a OPA não coleta CPF hoje; entra junto da fase 3 |
| P12 da auditoria (miudezas da base) | baixo risco, uma por uma |

## 10. Se der problema

| Sintoma | Causa provável | Saída |
|---|---|---|
| Ninguém consegue entrar | provedor Email desligado no Supabase | ligar Email, manter só o cadastro desligado |
| "Muitas tentativas" para um corretor | bloqueio por conta e IP (5 erros em 5 min) | esperar 5 min; outro aparelho entra normal |
| Lead do site não chega | token errado no site ou roleta vazia | Conexões (token) e Configurações (roleta) |
| Foto de imóvel recusada | domínio fora de `settings.opa.dominios_imovel` | incluir o domínio ou usar o nome do arquivo do site |
| Admin perdeu o celular do segundo fator | | `bash hostgator-setup-kit/reset-mfa.sh <email>` na VPS |
| Incidente com dado pessoal | | avisar a ANPD em até 3 dias úteis (Resolução CD/ANPD 15/2024) e os titulares afetados |
