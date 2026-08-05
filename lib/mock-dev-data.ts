/**
 * Dados de demonstração para rodar o app SEM Supabase, WAHA ou Docker.
 *
 * Ligados por `NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co` (ver
 * `lib/auth/server.ts` e as rotas em `app/api/v1/`). É modo de VITRINE, não
 * ambiente de teste: a doutrina de QA Visual exige banco fresco a partir do
 * `supabase/baseline.sql`, e nada aqui substitui isso.
 *
 * O formato segue `Conversation` de `lib/types/messaging.ts` CAMPO A CAMPO,
 * incluindo os que a lista lê para decidir o que desenhar
 * (`last_inbound_at`, `unread_count_for_assignee`, `last_message_preview`,
 * `tags`). Mock que omite campo não demonstra a tela: demonstra o fallback
 * dela — foi o que aconteceu antes, quando a temperatura de todas as conversas
 * caía em "frio" porque `last_inbound_at` não existia no mock.
 *
 * Os horários são RELATIVOS a agora, e não datas fixas, para que a régua de
 * temperatura (lib/inbox/temperatura.ts) exiba as quatro faixas em qualquer
 * dia que alguém abra a demo: ≤1h quente, ≤24h morno, acima disso frio, e
 * fechado quando o atendimento encerrou.
 */

import type { AtRiskLead } from "@/app/api/v1/leads/at-risk/route";
import type { BoardData } from "@/lib/kanban/types";

const ORG = "00000000-0000-0000-0000-000000000002";
const EU = "00000000-0000-0000-0000-000000000001";
const SESSAO = "session-wa-1";

const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const horasAtras = (n: number) => minutosAtras(n * 60);

export const MOCK_DEV_CONVERSATIONS = [
  {
    id: "conv-1",
    organization_id: ORG,
    channel_session_id: SESSAO,
    channel: "whatsapp",
    contact_id: "contact-1",
    // Na fila e sem dono: é a linha que ganha "1º · Aguardando…" na lista.
    status: "open" as const,
    status_changed_at: horasAtras(1),
    assigned_to_user_id: null,
    assignee_kind: null,
    assigned_at: null,
    last_inbound_at: minutosAtras(3),
    last_outbound_at: minutosAtras(30),
    last_message_at: minutosAtras(3),
    last_message_preview:
      "Que excelente! Vocês têm planos para equipes de até 10 vendedores?",
    unread_count_for_assignee: 2,
    is_group: false,
    group_chat_id: null,
    tags: ["Lead Quente", "Interesse Planos"],
    metadata: {},
    snooze_until: null,
    created_at: horasAtras(1),
    updated_at: minutosAtras(3),
    contacts: {
      id: "contact-1",
      display_name: "Ana Silva",
      name: "Ana Silva",
      phone_number: "+55 (11) 98765-4321",
      tags: ["Lead Quente", "Interesse Planos"],
      is_blocked: false,
      is_anonymized: false,
    },
  },
  {
    id: "conv-2",
    organization_id: ORG,
    channel_session_id: SESSAO,
    channel: "whatsapp",
    contact_id: "contact-2",
    status: "claimed" as const,
    status_changed_at: horasAtras(2),
    assigned_to_user_id: EU,
    assignee_kind: "human",
    assigned_at: horasAtras(2),
    // Cliente falou há 3h: morno. Serve para provar que a temperatura olha a
    // espera DELE, não a última resposta nossa (que é mais recente).
    last_inbound_at: horasAtras(3),
    last_outbound_at: minutosAtras(15),
    last_message_at: minutosAtras(15),
    last_message_preview: "Sim, nossa equipe jurídica já validou a documentação.",
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: ["Cliente VIP", "Proposta Enviada"],
    metadata: {},
    snooze_until: null,
    created_at: horasAtras(2),
    updated_at: minutosAtras(15),
    contacts: {
      id: "contact-2",
      display_name: "Carlos Eduardo",
      name: "Carlos Eduardo",
      phone_number: "+55 (21) 99887-1122",
      tags: ["Cliente VIP", "Proposta Enviada"],
      is_blocked: false,
      is_anonymized: false,
    },
  },
  {
    id: "conv-3",
    organization_id: ORG,
    channel_session_id: SESSAO,
    channel: "whatsapp",
    contact_id: "contact-3",
    // IA atendendo: a lista mostra o robozinho antes da prévia.
    status: "ai_handling" as const,
    status_changed_at: horasAtras(4),
    assigned_to_user_id: null,
    assignee_kind: "ai",
    assigned_at: horasAtras(4),
    last_inbound_at: minutosAtras(38),
    last_outbound_at: minutosAtras(35),
    last_message_at: minutosAtras(35),
    last_message_preview: "Nosso suporte e agentes de IA funcionam 24/7.",
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: ["Atendimento IA"],
    metadata: {},
    snooze_until: null,
    created_at: horasAtras(4),
    updated_at: minutosAtras(35),
    contacts: {
      id: "contact-3",
      display_name: "Mariana Costa",
      name: "Mariana Costa",
      phone_number: "+55 (31) 97654-8899",
      tags: ["Atendimento IA", "Dúvida Comercial"],
      is_blocked: false,
      is_anonymized: false,
    },
  },
  {
    id: "conv-4",
    organization_id: ORG,
    channel_session_id: SESSAO,
    channel: "whatsapp",
    contact_id: "contact-4",
    // Fechada: temperatura "fechado" e composer desabilitado.
    status: "closed" as const,
    status_changed_at: horasAtras(23),
    assigned_to_user_id: EU,
    assignee_kind: "human",
    assigned_at: horasAtras(26),
    last_inbound_at: horasAtras(25),
    last_outbound_at: horasAtras(24),
    last_message_at: horasAtras(24),
    last_message_preview: "Obrigado por escolher o DeskcommCRM, Lucas!",
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: ["Venda Concluída"],
    metadata: {},
    snooze_until: null,
    created_at: horasAtras(48),
    updated_at: horasAtras(24),
    contacts: {
      id: "contact-4",
      display_name: "Lucas Oliveira",
      name: "Lucas Oliveira",
      phone_number: "+55 (41) 99123-4567",
      tags: ["Venda Concluída"],
      is_blocked: false,
      is_anonymized: false,
    },
  },
  {
    id: "conv-5",
    organization_id: ORG,
    channel_session_id: SESSAO,
    channel: "whatsapp",
    contact_id: "contact-5",
    // Esperando há 2 dias na fila: a linha FRIA que a tela existe para caçar.
    // Cinco não lidas — é o caso que o Radar aponta como risco de morrer.
    status: "open" as const,
    status_changed_at: horasAtras(50),
    assigned_to_user_id: null,
    assignee_kind: null,
    assigned_at: null,
    last_inbound_at: horasAtras(50),
    last_outbound_at: null,
    last_message_at: horasAtras(50),
    last_message_preview: "Ainda não decidi a região, me manda mais opções",
    unread_count_for_assignee: 5,
    is_group: false,
    group_chat_id: null,
    tags: ["Sem resposta"],
    metadata: {},
    snooze_until: null,
    created_at: horasAtras(50),
    updated_at: horasAtras(50),
    contacts: {
      id: "contact-5",
      display_name: "Diego Amaral",
      name: "Diego Amaral",
      phone_number: "+55 (48) 99555-2020",
      tags: ["Sem resposta", "Facebook Ads"],
      is_blocked: false,
      is_anonymized: false,
    },
  },
];

/**
 * Resumo de CRM do contato (leads, pedidos, atividade) para o painel lateral
 * e para a folha de baixo do celular.
 *
 * Mora aqui, e não dentro da rota, por um motivo mecânico: o invariante
 * `tests/unit/performed-at-um-relogio-so.test.ts` varre as ROTAS procurando
 * quem escreve `performed_at` do lado do cliente — o relógio do processo
 * diverge do banco e a linha do tempo sai fora de ordem. A regra vale para
 * ESCRITA; isto é leitura de dados de mentira, mas o invariante lê o texto do
 * arquivo e não tem como distinguir os dois. Em vez de abrir exceção na
 * cerca (que passaria a aceitar escrita de verdade também), o dado de
 * demonstração sai da rota e vem para o módulo que só existe para isso.
 */
export const MOCK_DEV_CRM_SUMMARY = {
  leads: [
    {
      id: "lead-1",
      title: "Proposta Comercial - Plano Empresarial",
      status: "negotiation",
      value_cents: 49000,
      currency: "BRL",
      updated_at: new Date().toISOString(),
    },
  ],
  orders: [],
  activities: [
    {
      id: "act-1",
      type: "stage_changed",
      source_module: "crm",
      performed_at: horasAtras(1),
      payload: { from: "Lead", to: "Negociação" },
      reason: "Lead respondeu no WhatsApp",
      actor_kind: "system",
    },
  ],
};

/**
 * Contatos da demo — DERIVADOS das conversas, não uma segunda lista.
 *
 * Se fossem digitados à parte, a tela de Contatos e o Inbox mostrariam gente
 * diferente na mesma instalação, e a demo se contradiria de uma aba para a
 * outra. O contato é dono da conversa; aqui ele só é projetado de volta.
 */
export const MOCK_DEV_CONTACTS = MOCK_DEV_CONVERSATIONS.map((c) => ({
  id: c.contacts.id,
  organization_id: ORG,
  display_name: c.contacts.display_name,
  name: c.contacts.name,
  phone_number: c.contacts.phone_number,
  email: null,
  tags: c.contacts.tags,
  is_blocked: c.contacts.is_blocked,
  is_anonymized: c.contacts.is_anonymized,
  avatar_storage_path: null,
  source: "whatsapp",
  created_at: c.created_at,
  updated_at: c.updated_at,
  // `last_activity_at` é o nome que a ContactsTable lê. Com o nome errado a
  // coluna mostrava "—" para todo mundo — mock que não confere o contrato
  // demonstra a tela vazia, não a tela.
  last_activity_at: c.last_message_at,
}));

/**
 * Radar de risco: quem esfriou e segue aberto.
 *
 * Mesma regra de negócio da tela, aplicada aos dados da demo — as conversas
 * ABERTAS cuja última entrada do cliente passou de 24h. A Diego Amaral (2
 * dias esperando, 5 não lidas) é exatamente o caso que o radar existe para
 * pescar, então a demo mostra o radar fazendo o trabalho dele, não uma tela
 * vazia dizendo que está tudo em dia.
 */
const DIA_EM_MS = 24 * 60 * 60 * 1000;

export const MOCK_DEV_AT_RISK = (() => {
  const emRisco = MOCK_DEV_CONVERSATIONS.filter(
    (c) =>
      c.status === "open" &&
      c.last_inbound_at !== null &&
      Date.now() - new Date(c.last_inbound_at).getTime() > DIA_EM_MS,
  );

  // Os nomes dos campos seguem `AtRiskLead` (app/api/v1/leads/at-risk/route.ts)
  // AO PÉ DA LETRA. A primeira versão inventou `next_action_at` e omitiu
  // `hours_since_activity`, e a tela exibiu "parado há NaNd": mock que erra o
  // contrato não demonstra a tela, demonstra o defeito dela.
  const items: AtRiskLead[] = emRisco.map((c) => ({
    id: `lead-${c.id}`,
    title: `Atendimento — ${c.contacts.display_name}`,
    contact_id: c.contact_id,
    contact_name: c.contacts.display_name,
    owner_user_id: null,
    owner_kind: null,
    owner_agent_id: null,
    owner_agent_name: null,
    assignee_kind: null,
    last_activity_at: c.last_inbound_at,
    hours_since_activity: Math.round(
      (Date.now() - new Date(c.last_inbound_at!).getTime()) / 3_600_000,
    ),
    risk: "em_risco",
    in_flight: false,
    next_followup_at: null,
    conversation_id: c.id,
    pipeline_id: "pipeline-demo",
  }));

  return {
    items,
    total: items.length,
    counts: { critico: 0, em_risco: items.length, em_voo: 0 },
  };
})();

/**
 * Funil da demo. O `pipeline_id` é o mesmo que `MOCK_DEV_AT_RISK` aponta, para
 * que "abrir o funil" a partir do radar não caia num quadro inexistente.
 */
export const MOCK_DEV_PIPELINES = [
  {
    id: "pipeline-demo",
    name: "Vendas",
    slug: "vendas",
    description: "Funil padrão de demonstração.",
    position: 1,
    is_default: true,
  },
];

/**
 * O QUADRO do funil: etapas + negócios, como `/api/v1/pipelines/[id]/board`
 * devolve.
 *
 * Tipado como `BoardData` de propósito — é o TypeScript, e não uma conferência
 * minha, que garante que o mock não invente campo nem esqueça um. Foi assim
 * que "parado há NaNd" apareceu no radar: mock escrito de memória, contrato
 * quase certo.
 *
 * Os negócios reaproveitam os contatos das conversas para o funil contar a
 * MESMA história do inbox — o Lucas, que aparece como "Venda Concluída" na
 * lista, é o mesmo que está na coluna Fechado aqui.
 */
const ETAPAS_DEMO: BoardData["stages"] = [
  { id: "stage-novo", organization_id: ORG, pipeline_id: "pipeline-demo", name: "Novo", slug: "novo", position: 1, color: "#4DA3FF", is_won: false, is_lost: false, is_archived: false, expected_duration_hours: 24 },
  { id: "stage-qualificado", organization_id: ORG, pipeline_id: "pipeline-demo", name: "Qualificado", slug: "qualificado", position: 2, color: "#FFC24C", is_won: false, is_lost: false, is_archived: false, expected_duration_hours: 48 },
  { id: "stage-proposta", organization_id: ORG, pipeline_id: "pipeline-demo", name: "Proposta", slug: "proposta", position: 3, color: "#8B6FFF", is_won: false, is_lost: false, is_archived: false, expected_duration_hours: 72 },
  { id: "stage-fechado", organization_id: ORG, pipeline_id: "pipeline-demo", name: "Fechado", slug: "fechado", position: 4, color: "#34D399", is_won: true, is_lost: false, is_archived: false, expected_duration_hours: null },
];

function leadDemo(
  id: string,
  stageId: string,
  contatoIdx: number,
  titulo: string,
  valorCents: number | null,
  posicao: number,
): BoardData["leads"][number] {
  const conv = MOCK_DEV_CONVERSATIONS[contatoIdx]!;
  return {
    id,
    organization_id: ORG,
    pipeline_id: "pipeline-demo",
    stage_id: stageId,
    contact_id: conv.contact_id,
    title: titulo,
    description: null,
    status: stageId === "stage-fechado" ? "won" : "open",
    lost_reason: null,
    position_in_stage: posicao,
    value_cents: valorCents,
    currency: "BRL",
    owner_user_id: null,
    owner_kind: null,
    owner_agent_id: null,
    owner_agent: null,
    next_action: null,
    score: null,
    assigned_at: null,
    last_activity_at: conv.last_message_at,
    expected_close_date: null,
    closed_at: stageId === "stage-fechado" ? conv.last_message_at : null,
    source: "whatsapp",
    source_metadata: {},
    external_id: null,
    custom_fields: {},
    tags: conv.contacts.tags,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    created_by_user_id: null,
  };
}

export const MOCK_DEV_BOARD: BoardData = {
  pipeline: {
    id: "pipeline-demo",
    organization_id: ORG,
    name: "Vendas",
    slug: "vendas",
    description: "Funil padrão de demonstração.",
    is_default: true,
    is_archived: false,
    position: 1,
    vocabulary: {},
    settings: {},
  },
  stages: ETAPAS_DEMO,
  leads: [
    leadDemo("lead-b1", "stage-novo", 0, "Ana Silva — Plano para 10 vendedores", 49000, 1000),
    leadDemo("lead-b2", "stage-qualificado", 2, "Mariana Costa — Dúvida comercial", 29000, 1000),
    leadDemo("lead-b3", "stage-proposta", 1, "Carlos Eduardo — Contrato em assinatura", 180000, 1000),
    leadDemo("lead-b4", "stage-fechado", 3, "Lucas Oliveira — Venda concluída", 95000, 1000),
    leadDemo("lead-b5", "stage-novo", 4, "Diego Amaral — Sem resposta há 2 dias", null, 2000),
  ],
};

/**
 * Desempenho — DERIVADO do quadro, nunca digitado.
 *
 * O funil conta os negócios que já existem em `MOCK_DEV_BOARD`, então a tela
 * de Desempenho e o Kanban contam a mesma história: se a coluna "Novo" tem 2
 * cards, a métrica diz 2. Números soltos aqui fariam a demo se contradizer
 * entre duas abas — e é justamente numa tela de métrica que a contradição
 * destrói a confiança.
 */
export const MOCK_DEV_METRICS = {
  window: {
    from: new Date(Date.now() - 30 * DIA_EM_MS).toISOString(),
    to: new Date().toISOString(),
  },
  owner_user_id: null,
  funnel: ETAPAS_DEMO.map((e) => ({
    stage_id: e.id,
    stage_name: e.name,
    position: e.position,
    count: MOCK_DEV_BOARD.leads.filter((l) => l.stage_id === e.id).length,
  })),
  attendants: [
    {
      user_id: EU,
      name: "Administrador (Dev Local)",
      email: "admin@deskcomm.com",
      won: MOCK_DEV_BOARD.leads.filter((l) => l.status === "won").length,
      lost: 0,
      conversations_handled: MOCK_DEV_CONVERSATIONS.filter(
        (c) => c.assigned_to_user_id === EU,
      ).length,
      avg_first_response_seconds: 143,
    },
  ],
};

/** Uma mensagem no formato que `lib/types/messaging.ts` define. */
function msg(
  id: string,
  conversationId: string,
  contactId: string,
  direction: "inbound" | "outbound",
  body: string,
  sentAt: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    organization_id: ORG,
    conversation_id: conversationId,
    channel_session_id: SESSAO,
    contact_id: contactId,
    external_id: `wamid.${id}`,
    type: "text",
    direction,
    status: direction === "outbound" ? "read" : "received",
    ack: direction === "outbound" ? 3 : null,
    error_code: null,
    error_message: null,
    body,
    media_url: null,
    media_storage_path: null,
    sent_at: sentAt,
    created_at: sentAt,
    sent_via: "human",
    metadata: {},
    ...extra,
  };
}

export const MOCK_DEV_MESSAGES: Record<string, Array<Record<string, unknown>>> = {
  "conv-1": [
    msg(
      "msg-1",
      "conv-1",
      "contact-1",
      "inbound",
      "Olá! Vi o anúncio de vocês e gostaria de saber mais informações sobre a plataforma de vendas.",
      minutosAtras(45),
    ),
    msg(
      "msg-2",
      "conv-1",
      "contact-1",
      "outbound",
      "Olá Ana, tudo bem? Seja muito bem-vinda ao DeskcommCRM! Nossa solução conecta o WhatsApp diretamente ao seu funil de vendas com agentes de IA.",
      minutosAtras(30),
    ),
    msg(
      "msg-3",
      "conv-1",
      "contact-1",
      "inbound",
      "Que excelente! Vocês têm planos para equipes de até 10 vendedores? Gostaria de agendar uma apresentação.",
      minutosAtras(3),
    ),
  ],
  "conv-2": [
    msg(
      "msg-201",
      "conv-2",
      "contact-2",
      "inbound",
      "Boa tarde! Gostaria de confirmar se receberam os documentos do contrato.",
      horasAtras(3),
    ),
    msg(
      "msg-202",
      "conv-2",
      "contact-2",
      "outbound",
      "Boa tarde Carlos! Sim, nossa equipe jurídica já validou a documentação. Tudo certo para a assinatura!",
      minutosAtras(15),
    ),
  ],
  "conv-3": [
    msg(
      "msg-301",
      "conv-3",
      "contact-3",
      "inbound",
      "Qual é o horário de atendimento de vocês aos sábados?",
      minutosAtras(38),
    ),
    // `sent_via: "ai"` é o que faz a bolha ganhar o selo "IA" — sem ele a
    // resposta do agente se passaria por humana na tela.
    msg(
      "msg-302",
      "conv-3",
      "contact-3",
      "outbound",
      "Olá Mariana! Nosso suporte e agentes de IA funcionam 24/7. O atendimento humano funciona aos sábados das 09h às 13h.",
      minutosAtras(35),
      { sent_via: "ai" },
    ),
  ],
  "conv-4": [
    msg(
      "msg-401",
      "conv-4",
      "contact-4",
      "inbound",
      "Fechado! Quando assinamos o contrato?",
      horasAtras(25),
    ),
    msg(
      "msg-402",
      "conv-4",
      "contact-4",
      "outbound",
      "Obrigado por escolher o DeskcommCRM, Lucas!",
      horasAtras(24),
    ),
  ],
  "conv-5": [
    msg(
      "msg-501",
      "conv-5",
      "contact-5",
      "inbound",
      "Ainda não decidi a região, me manda mais opções",
      horasAtras(50),
    ),
  ],
};
