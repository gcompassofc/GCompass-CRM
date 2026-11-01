---
tags: [cliente/opa, tipo/teste]
atualizado: 2026-11-01
status: vigente
---

# CRM OPA: teste completo por papel (01/11/2026)

Teste de ponta a ponta no ambiente local (Supabase local com as migrations até 0122, seed da OPA,
build de produção do Next em `next start`), dirigido por Playwright no computador (1366x900) e no
celular (390x844). Papéis: corretor (Luana, Paulo, Rodrigo, Cristian), gestor (Marco) e um
administrador de teste com segundo fator. Nada foi feito no Supabase nem na VPS de produção.

**Resumo:** 66 de 66 telas abrem para os três papéis nos dois tamanhos; 36 de 36 tentativas de
brecha pela API foram recusadas; 4 falhas corrigidas com teste; 1 falha aberta (intermitente);
7 ajustes sugeridos.

## Telas (varredura)

| Papel | Telas | Computador | Celular | Tempo (local) |
|---|---|---|---|---|
| Corretor | Hoje, Fila, Leads, Funis, Imóveis, Kit, Agenda, Meu WhatsApp, Tutoriais | 9 ok | 9 ok | 0,7 a 1,9 s |
| Gestor | as do corretor mais Membros, Configurações, Convite | 12 ok | 12 ok | 0,7 a 1,3 s |
| Administrador | as do gestor mais Conexões | 12 ok | 12 ok | 0,7 a 1,4 s |

Em todas: sem tela de erro, sem rolagem lateral no celular, sem "Atendente", "Gerente", travessão,
"undefined" ou "NaN" no texto, sem erro de console além do favicon (ver ajustes).

## Funcionalidades

| Papel | Funcionalidade | Resultado |
|---|---|---|
| Todos | Login cai na tela inicial do perfil (Hoje) | **falha corrigida** (caía na Inbox genérica) |
| Administrador | Login com segundo fator (TOTP) | ok |
| Corretor | Tutorial abre no primeiro acesso, 8 passos, não reabre depois de concluir | **falha corrigida** (nunca abria) |
| Corretor | Tutoriais: busca "roleta", tópico direto (`?passo=fila`), "?" nas telas | ok |
| Corretor | Porta de entrada: sem token, token errado e telefone inválido recusados (403, 403, 422) | ok |
| Corretor | Lead novo cai na roleta com dono (Paulo, depois Rodrigo) | ok |
| Corretor | Mesmo telefone 3 vezes ao mesmo tempo vira 1 lead | ok |
| Corretor | Domingo (fechado no horário) não conta prazo | ok |
| Corretor | Lead vencido sem aviso entregue escala para a gestão em vez de repassar às cegas; 2ª rodada não duplica | ok |
| Corretor | Lead já respondido fica com o corretor | ok |
| Corretor | Confirmar e descartar sugestão do copiloto | ok ("Anotado no lead.") |
| Corretor | Salvar campo da ficha | ok ("Momento salvo.") |
| Corretor | Ligar em um toque na ficha | **falha corrigida** (só existia no Hoje) |
| Corretor | Registrar ligação (Não atendeu, contagem de tentativas) | ok |
| Corretor | Agendar mensagem (ficha e Agenda) | ok ("Mensagem agendada.", lembrete criado) |
| Corretor | Etiquetas: marcar e tirar; "próprio", "pago" e "orgânico" não aparecem para ele | ok |
| Corretor | Mover etapa (computador e celular); etapa travada pede os campos obrigatórios | ok |
| Corretor | Ficha de visita: recusa sem imóvel visitado; salva com tudo preenchido | ok ("Visita registrada.") |
| Corretor | Respondi na Fila (lead desce, contador cai) | ok |
| Corretor | Montar seleção: abre com os 2 de maior afinidade, limite de 3, mensagem única com link reservado no off market | ok |
| Corretor | Meu WhatsApp: QR com os 3 passos e "Aguardando a leitura do código" | ok |
| Corretor | Busca em Leads (computador e celular) | ok |
| Corretor | Perder com motivo; a ficha mostra motivo e data | ok |
| Corretor | Exportar recusado (403) | ok (só o administrador exporta, decisão 6) |
| Corretor | Hoje "4 responder agora" igual à Fila "Esperando 4" | ok |
| Gestor | Hoje da equipe (quem precisa de ajuda, leads fora do prazo) | ok |
| Gestor | Fila com os leads de vários corretores | ok |
| Gestor | Reabrir lead perdido (volta para a primeira etapa) | ok |
| Gestor | Convite só oferece Corretor e não devolve link; API recusa gestor e admin (403) | ok |
| Gestor | Excluir lead em lote recusado (403) | ok |
| Gestor | Salvar prazos, captação e horário com retorno | **falha corrigida** (salvava sem aviso) |
| Administrador | Convite com todos os papéis e link para mandar pelo WhatsApp | ok |
| Administrador | Excluir lead em lote | ok |
| Administrador | Membros, Conexões, Configurações | ok |

## Brechas testadas (API do banco com o login de cada papel)

Todas recusadas: corretor lendo lead, contato ou mensagem de outro corretor; corretor tomando o
número do colega, trocando o telefone do próprio número ou arquivando o OPA Lembretes; corretor e
gestor excluindo lead; corretor gravando ou tirando "próprio", "pago", "orgânico"; corretor e gestor
reescrevendo ou apagando mensagem; corretor agendando lembrete para colega ou em lead de outro;
corretor e gestor virando administrador; corretor tirando colega da equipe; corretor puxando lead de
outro ou passando o seu; gestor tomando número de corretor; visitante e corretor chamando
`fn_decrypt_oauth`, `fn_lgpd_cascade_redact_contact` e `activate_kb_version`; visitante lendo leads
ou empresas. Pela interface: corretor não vê botão de exportar nem a etiqueta "próprio"; a tela de
convite do corretor recusa (403).

## Falhas corrigidas (com teste em `tests/unit/opa-teste-completo.test.ts`)

1. **Login caía na Inbox genérica.** O destino padrão estava fixo em `/app/inbox` em 8 lugares; agora
   é `/app`, que escolhe o Hoje no perfil imobiliária. Arquivos: `app/actions/auth/signInWithPassword.ts`,
   `verifyMfa.ts`, `app/actions/onboarding/finishOnboarding.ts`, `app/actions/team/acceptInvite.ts`,
   `app/(public)/login/mfa/page.tsx`, `components/auth/LoginForm.tsx`.
2. **Tutorial nunca abria no primeiro acesso.** Ele perguntava a sessão ao navegador, mas o cookie é
   HttpOnly e volta vazio. A marca `tutorial_opa` agora vem do servidor (`lib/auth/server.ts`,
   `lib/auth/types.ts`, `app/app/_opa/tutorial.tsx`).
3. **Ficha sem "Ligar".** Botão `tel:` ao lado de "Registrar ligação" (`app/app/leads/[id]/page.tsx`).
4. **Configurações salvavam sem retorno.** "Salvar prazos", "Salvar captação" e "Salvar horário" usam
   o mesmo retorno da ficha (`app/app/configuracoes/page.tsx`).

## Falha aberta

- **Erro de tela intermitente na ficha do lead (React `insertBefore`).** Apareceu em 4 de 6 rodadas
  longas no build de produção, depois de ações seguidas na mesma ficha (confirmar sugestão; ou
  registrar ligação e logo agendar mensagem). Em 2 rodadas, os botões "Ligar" e "Registrar ligação"
  sumiram até recarregar a página. Não se reproduziu isolado (cada ação sozinha funciona, inclusive
  em sequência curta) nem no modo de desenvolvimento, e o servidor não registrou erro. Descartados:
  chaves da lista de sugestões (estáveis), selo "Lendo a conversa" (não aparece sem chave de IA), tour
  guiado (só mede posição). Próximo passo: capturar a pilha com o React de produção com source maps
  e testar sem o `router.refresh()` logo depois dos avisos.

## Ajustes sugeridos (não alterados)

1. **"Abrir conversa" leva para a Inbox genérica** (`/app/inbox/...`), fora do visual da OPA e com
   abas de agente de IA. Para o corretor, abrir direto o WhatsApp (o link `wa.me` já existe) ou uma
   conversa no visual da OPA.
2. **Escalada só por WhatsApp.** Com o OPA Lembretes desconectado, a escalada também falha e ninguém
   fica sabendo dentro do CRM. Mostrar no Hoje do gestor "leads vencidos sem aviso".
3. **Sem favicon** (404 em toda página): ícone da OPA na aba.
4. **Salvar campo vazio** não dá retorno nenhum.
5. Em domingo e feriado o relógio para (correto pela configuração), mas a Fila não diz isso; uma
   linha "fora do horário de atendimento" evita dúvida.
6. A seleção já abre com 2 imóveis marcados; deixar claro que são sugestão ("marcamos os 2 que mais
   combinam").
7. Em produção, conferir o primeiro login de cada corretor: o tutorial agora abre de fato.

## Depende do Allyson

- Decidir o destino do "Abrir conversa" (item 1) e o aviso de escalada no Hoje (item 2).
- Autorizar a investigação da falha aberta antes de convidar a equipe, ou convidar sabendo que um
  recarregar resolve.

## Ambiente local depois do teste

Migrations 0118 a 0122 aplicadas no Supabase local, seed da OPA recriado, administrador de teste
apagado, servidores de teste (3100 e 3200) desligados, Docker ligado.
