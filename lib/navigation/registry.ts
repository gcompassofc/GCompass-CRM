import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  HouseLine,
  Sun,
  ListNumbers,
  UserPlus,
  PaperPlaneTilt,
  Plug,
  SlidersHorizontal,
  ChatCircle,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  Lock,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  UserCircle,
  WhatsappLogo,
  Users,
  UsersThree,
  WebhooksLogo,
} from "@/lib/ui/icons";

/**
 * Registro de navegação — a ÚNICA lista de destinos do app do tenant.
 *
 * Antes disto, três listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de Configurações e `TABS` na área de IA. Sete telas
 * só eram alcançáveis por dentro da própria seção e uma não tinha link nenhum.
 *
 * Sidebar, hubs e a paleta ⌘K são PROJEÇÕES puras deste array — nenhum deles
 * decide o que existe, só desenha o que sai daqui. Tela nova aparece nos três
 * sem editar três arquivos, e `tests/unit/navegacao-completude.test.ts` reprova
 * o CI se uma rota nascer fora daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md — "por qual porta se chega até mim?"
 */

export type NavGroupId = "atendimento" | "crm" | "ia" | "canais" | "analise" | "organizacao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /**
   * Hub do grupo, quando ele tem telas demais para caber no sidebar.
   * O rótulo é declarado junto do href porque não é derivável: "Ver tudo em IA"
   * é útil, "Ver tudo em Organização" seria gratuito quando a tela já se chama
   * Configurações e o usuário a conhece por esse nome.
   */
  hub?: { href: string; label: string };
}

export interface NavDestination {
  href: string;
  label: string;
  /** Aparece no card do hub e é texto buscável no ⌘K. Nunca vazio. */
  description: string;
  icon: PhosphorIcon;
  group: NavGroupId;
  /** Obrigatória em grupo com hub — é o agrupamento por jornada dentro dele. */
  section?: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  /** Ausente = só no hub. `true` = uso diário, sobe para o sidebar. */
  sidebar?: boolean;
  healthDot?: boolean;
  /** Só existe neste perfil de instalação (APP_PROFILE). Ausente = todos. */
  perfil?: Perfil;
}

/**
 * Perfil da instalação, lido de APP_PROFILE em runtime (servidor) ou do
 * `window.__PUBLIC_ENV__` (navegador). "imobiliaria" é o CRM da OPA.
 */
export type Perfil = "imobiliaria";

export function perfilAtivo(): Perfil | null {
  const valor =
    typeof window !== "undefined" ? window.__PUBLIC_ENV__?.APP_PROFILE : process.env.APP_PROFILE;
  return valor?.trim() === "imobiliaria" ? "imobiliaria" : null;
}

/**
 * O que sai do menu no perfil imobiliária: agentes que respondem sozinhos
 * (na OPA quem responde é o corretor, pelo WhatsApp dele), e-commerce e o
 * radar genérico, que a tela Hoje substitui. As rotas continuam existindo.
 */
const FORA_DO_PERFIL_IMOBILIARIA = new Set([
  "/app/radar",
  "/app/kanban",
  "/app/contacts",
  "/app/templates",
  "/app/settings/tenant/pipelines",
  "/app/webhooks",
  "/app/ai/agents",
  "/app/ai/followups",
  "/app/ai/routers",
  "/app/ai/evolution",
  "/app/integrations/nuvemshop",
]);

/**
 * Grupos por OBJETIVO, na ordem de uso: o que se abre toda hora primeiro, o que
 * se ajusta uma vez por mês por último.
 *
 * "Análise" e não "Observabilidade": quem instala isto numa VPS é dono de PME,
 * não engenheiro. E configurar o sistema (grupo IA) é atividade diferente de
 * observar o sistema funcionando (grupo Análise) — por isso Evolução da IA mora
 * aqui, e não junto dos agentes.
 *
 * Hub só onde o grupo passa de 4 telas. Abaixo disso ele cabe inteiro no
 * sidebar, e um hub de 3 itens seria só um clique a mais para chegar onde já
 * dava para chegar.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "atendimento", label: "Atendimento" },
  { id: "crm", label: "CRM" },
  { id: "ia", label: "Agente de IA", hub: { href: "/app/ai", label: "Ver tudo em IA" } },
  { id: "canais", label: "Canais" },
  { id: "analise", label: "Análise" },
  {
    id: "organizacao",
    label: "Organização",
    hub: { href: "/app/settings", label: "Configurações" },
  },
];

/**
 * Grupo cujo hub vive no RODAPÉ fixo do sidebar, fora da área que rola.
 *
 * Medido em tela (1280×768, o notebook comum): com todos os grupos na área
 * rolável, o conteúdo dava 1019px contra 663px visíveis — Configurações ficava
 * fora da dobra em TODAS as alturas testadas, inclusive 1080px. É o item que
 * mais se procura quando não se acha algo; deixá-lo dependendo de scroll
 * recriaria, em outra forma, o problema que esta reorganização veio resolver.
 */
export const GRUPO_NO_RODAPE: NavGroupId = "organizacao";

/**
 * Como `minRole` foi escolhido — medido tela a tela, não estimado:
 *
 *   1. A página redireciona por papel?  → usa esse papel. Assim a navegação
 *      nunca mostra um link que morre em /403.
 *   2. Não redireciona, mas a navegação antiga já filtrava? → mantém o filtro
 *      antigo, para esta mudança reorganizar sem alterar quem vê o quê.
 *   3. Nenhum dos dois → viewer.
 *
 * `ROLE_RANK` só distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rápidas, `canCompare` em Desempenho) NÃO é porta
 * fechada e por isso não vira `minRole`.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // ---- Atendimento — onde o operador passa o dia ----
  {
    href: "/app/hoje",
    label: "Início",
    description: "Quem espera resposta, o que a IA anotou nas conversas e a equipe no prazo.",
    icon: Sun,
    group: "atendimento",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/fila",
    label: "Fila de atendimento",
    description: "Quem espera há mais tempo sem resposta fica no topo, com o prazo de cada lead.",
    icon: ListNumbers,
    group: "atendimento",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/pipeline",
    label: "Pipelines",
    description: "Compradores, captação e relacionamento com proprietário, etapa por etapa.",
    icon: Kanban,
    group: "crm",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/leads",
    label: "Leads",
    description: "Toda a base, com origem, imóvel de interesse e corretor.",
    icon: UserPlus,
    group: "crm",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/lembretes",
    label: "Lembretes e cadência",
    description: "O que o CRM lembra ao corretor pelo WhatsApp, e quando.",
    icon: Bell,
    group: "atendimento",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/kit",
    label: "Kit de mensagens",
    description: "O Kit de Atendimento OPA, personalizado com o lead e o imóvel.",
    icon: PaperPlaneTilt,
    group: "atendimento",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/meu-whatsapp",
    label: "Meu WhatsApp",
    description: "Conecte o seu número lendo um QR e veja se ele está no ar.",
    icon: WhatsappLogo,
    group: "atendimento",
    minRole: "agent",
    perfil: "imobiliaria",
  },
  {
    href: "/app/conexoes",
    label: "Conexões",
    description: "Os números de WhatsApp da equipe e por onde os leads entram.",
    icon: ChatCircle,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
    perfil: "imobiliaria",
  },
  {
    href: "/app/membros",
    label: "Membros",
    description: "Quem está na equipe, o papel de cada um e o que cada papel pode fazer.",
    icon: Users,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
    perfil: "imobiliaria",
  },
  {
    href: "/app/integracoes",
    label: "Integrações e API",
    description: "Meta, sistemas da imobiliária, cruzamento de imóveis, API, webhooks e MCP.",
    icon: Plug,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "manager",
    perfil: "imobiliaria",
  },
  {
    href: "/app/configuracoes",
    label: "Configurações",
    description: "Roleta, mensagens padrão, etiquetas, campos, ficha de visita, motivos de perda e horário.",
    icon: SlidersHorizontal,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
    perfil: "imobiliaria",
  },
  {
    href: "/app/inbox",
    label: "Inbox",
    description: "As conversas de WhatsApp, com você e a IA atendendo lado a lado.",
    icon: Inbox,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/radar",
    label: "Radar",
    description: "Quem esfriou e ainda está aberto — o que corre risco de morrer sem resposta.",
    icon: ClockCountdown,
    group: "atendimento",
    sidebar: true,
  },
  {
    // Renomeado de "Templates": estes são scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde é o termo técnico correto.
    href: "/app/templates",
    label: "Respostas rápidas",
    description: "Scripts salvos para responder mais rápido, seus ou da equipe.",
    icon: FileText,
    group: "atendimento",
    sidebar: true,
  },

  // ---- CRM — o funil ----
  {
    href: "/app/kanban",
    label: "Kanban",
    description: "O quadro de cards: onde cada negócio está no funil.",
    icon: Kanban,
    group: "crm",
    sidebar: true,
  },
  {
    href: "/app/imoveis",
    label: "Carteira de imóveis",
    description: "O acervo da imobiliária, com os leads de cada imóvel e quem combina com ele.",
    icon: HouseLine,
    group: "crm",
    sidebar: true,
    perfil: "imobiliaria",
  },
  {
    href: "/app/contacts",
    label: "Contatos",
    description: "As pessoas do outro lado da conversa e seu histórico.",
    icon: Users,
    group: "crm",
    sidebar: true,
  },
  {
    // Estava enterrado em Configurações e ninguém sabia que existia — o achado
    // que originou esta reorganização. A URL não muda; só o lugar na navegação.
    href: "/app/settings/tenant/pipelines",
    label: "Funis",
    description: "As etapas do seu funil, o vocabulário do negócio e os motivos de perda.",
    icon: Funnel,
    group: "crm",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Agente de IA — montar, ensinar, acompanhar ----
  {
    href: "/app/ai/agents",
    label: "Agentes",
    description: "Quem atende por você: instruções, modelo, ferramentas e publicação.",
    icon: Robot,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Como o agente retoma uma conversa que esfriou, para nenhuma morrer no silêncio.",
    icon: FlowArrow,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/routers",
    label: "Roteadores",
    description: "Qual agente pega qual conversa, e quando o humano assume.",
    icon: Signpost,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/credentials",
    label: "Credenciais",
    description: "A chave do provedor de IA que os agentes usam para pensar.",
    icon: Key,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Conhecimento",
    description: "Os materiais que o agente consulta antes de responder sobre o seu negócio.",
    icon: BookOpen,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "Memória",
    description: "O que o agente já aprendeu sobre a sua operação e reaproveita.",
    icon: Brain,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "Skills",
    description: "As ações que o agente pode executar sozinho durante o atendimento.",
    icon: PuzzlePiece,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Casos",
    description: "Os atendimentos que o agente conduziu, do início ao desfecho.",
    icon: ClipboardText,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "agent",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertas",
    description: "O que a IA encontrou e precisa de uma decisão sua.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // Órfã: nenhum lugar do app linkava para cá. O flywheel gerava propostas de
    // melhoria do agente e a fila só era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Propostas",
    description: "Melhorias que a IA sugere para si mesma, esperando sua decisão.",
    icon: Lightbulb,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    href: "/app/ai/usage",
    label: "Uso e orçamento",
    description: "Quanto a IA consumiu e qual é o teto de gasto do mês.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },

  // ---- Canais — por onde as mensagens entram e saem ----
  {
    href: "/app/connections",
    label: "Conexões",
    // Cobre os DOIS caminhos desde o PR #105: número por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descrição cita "oficial"
    // e "Meta" de propósito — é por esses nomes que se procura no ⌘K, e a busca
    // varre a descrição além do rótulo.
    description:
      "Seus números de WhatsApp: por QR ou canal oficial da Meta, com saúde, reconexão e templates.",
    icon: PlugsConnected,
    group: "canais",
    minRole: "admin",
    sidebar: true,
    healthDot: true,
  },
  {
    // Não tinha link nenhum no app inteiro: só se chegava digitando a URL.
    href: "/app/integrations/nuvemshop",
    label: "Nuvemshop",
    description: "Conecte a loja para trazer pedidos e clientes para dentro do CRM.",
    icon: Storefront,
    group: "canais",
    // A página não filtra por papel, mas as Server Actions de conectar e
    // desconectar exigem admin — mostrar a um viewer seria oferecer botão morto.
    minRole: "admin",
    sidebar: true,
  },
  {
    href: "/app/webhooks",
    label: "Webhooks",
    description: "Avise outros sistemas quando algo acontecer aqui dentro.",
    icon: WebhooksLogo,
    group: "canais",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Análise — olhar o sistema funcionando ----
  {
    href: "/app/metrics",
    label: "Desempenho",
    description: "Funil e performance por atendente nos últimos 30 dias.",
    icon: ChartBar,
    group: "analise",
    sidebar: true,
  },
  {
    // Observabilidade, não configuração: por isso não fica junto dos agentes.
    href: "/app/ai/evolution",
    label: "Evolução da IA",
    description: "Se o agente está melhorando, onde ele erra e o que falta ensinar.",
    icon: ChartLineUp,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/audit",
    label: "Audit Log",
    description: "Quem fez o quê, quando — o histórico que não se apaga.",
    icon: ClockCounterClockwise,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Organização — conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Perfil",
    description: "Seu nome, idioma, fuso horário e avatar.",
    icon: UserCircle,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/security",
    label: "Segurança",
    description: "Verificação em duas etapas, códigos de recuperação e sessões.",
    icon: ShieldCheck,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/notifications",
    label: "Notificações",
    description: "Por onde e sobre o quê você quer ser avisado.",
    icon: Bell,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/team",
    label: "Equipe",
    description: "Quem trabalha aqui, com qual papel e quanta conversa cada um aguenta.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
  },
  {
    // A porta que faltava (issue #144): rodízio de atendimento e restrição de
    // visibilidade existiam inteiros no backend e não tinham NENHUMA tela — só
    // dava para ligar com UPDATE à mão no banco.
    href: "/app/settings/atendimento",
    label: "Distribuição de atendimento",
    description: "Quem recebe cada cliente novo, e o que cada atendente enxerga.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "Organização",
    description: "Dados da empresa, retenção de dados e encarregado de LGPD.",
    icon: Buildings,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/settings/billing",
    label: "Billing",
    description: "Plano e cobrança.",
    icon: Receipt,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "LGPD",
    description: "Pedidos de exportação e exclusão de dados feitos por clientes.",
    icon: ScalesSimple,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
  {
    href: "/app/settings/api-tokens",
    label: "API Tokens",
    description: "Chaves para outro sistema conversar com o seu CRM.",
    icon: Lock,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
];

/**
 * Único ponto de decisão de permissão da navegação.
 *
 * É o que dispensa os sete `usePermission()` que o Sidebar chamava em sequência
 * — hooks não rodam em laço condicional, então cada permissão exigia sua linha.
 * Como função pura, um `.filter()` resolve todas.
 */
export function canSee(d: NavDestination, isPlatformAdmin: boolean, role: Role | null): boolean {
  const perfil = perfilAtivo();
  if (d.perfil && d.perfil !== perfil) return false;
  if (perfil === "imobiliaria" && FORA_DO_PERFIL_IMOBILIARIA.has(d.href)) return false;
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[d.minRole ?? "viewer"];
}

/** Projeção do sidebar: só o uso diário, agrupado, sem grupo vazio. */
export function sidebarGroups(
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ group: NavGroup; items: NavDestination[] }> {
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV_DESTINATIONS.filter(
      (d) => d.group === group.id && d.sidebar && canSee(d, isPlatformAdmin, role),
    ),
  })).filter((g) => g.items.length > 0);
}

/**
 * Projeção do hub: TODAS as telas do grupo — inclusive as que já estão no
 * sidebar. O hub é inventário, não sobra; é onde se descobre o que existe.
 *
 * A ordem das seções é a de primeira aparição no registro, então reordenar a
 * jornada é reordenar o array — não há uma segunda lista para manter em sincronia.
 */
export function hubSections(
  group: NavGroupId,
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ section: string; items: NavDestination[] }> {
  const porSecao = new Map<string, NavDestination[]>();
  for (const d of NAV_DESTINATIONS) {
    if (d.group !== group || !canSee(d, isPlatformAdmin, role)) continue;
    const secao = d.section ?? "";
    const atual = porSecao.get(secao);
    if (atual) atual.push(d);
    else porSecao.set(secao, [d]);
  }
  return [...porSecao.entries()].map(([section, items]) => ({ section, items }));
}

/** Projeção do ⌘K: todo destino visível, do sidebar ou não. */
export function searchable(isPlatformAdmin: boolean, role: Role | null): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => canSee(d, isPlatformAdmin, role));
}

/**
 * Menu do perfil imobiliária, na ordem do protótipo do CRM da OPA (29/10/2026).
 * O sidebar escuro (SidebarOpa) desenha estas duas listas; rótulo, ícone e
 * papel mínimo continuam vindo de NAV_DESTINATIONS.
 */
export const MENU_IMOBILIARIA = {
  principal: ["/app/hoje", "/app/fila", "/app/pipeline", "/app/leads", "/app/imoveis", "/app/lembretes", "/app/kit", "/app/meu-whatsapp"],
  configuracao: ["/app/conexoes", "/app/membros", "/app/integracoes", "/app/configuracoes"],
};

/**
 * Menu por papel (protótipo "Telas por permissão", 31/10/2026): o corretor vê só
 * o dia dele, sem Funis (move a etapa pela ficha); o gestor vê a equipe toda.
 */
const MENU_CORRETOR = ["/app/hoje", "/app/fila", "/app/lembretes", "/app/leads", "/app/imoveis", "/app/kit", "/app/meu-whatsapp"];
const ROTULO_CORRETOR: Record<string, string> = { "/app/lembretes": "Agenda", "/app/leads": "Meus leads", "/app/fila": "Fila" };
const ROTULO_GESTOR: Record<string, string> = {
  "/app/fila": "Fila da equipe",
  "/app/pipeline": "Funis",
  "/app/imoveis": "Imóveis",
  "/app/lembretes": "Lembretes",
  "/app/configuracoes": "Roleta e funis",
  "/app/membros": "Equipe",
};

export function menuImobiliaria(
  isPlatformAdmin: boolean,
  role: Role | null,
): { principal: NavDestination[]; configuracao: NavDestination[] } {
  const gestor = isPlatformAdmin || role === "manager" || role === "admin";
  const rotulos = gestor ? ROTULO_GESTOR : { ...ROTULO_CORRETOR, "/app/imoveis": "Imóveis" };
  const achar = (hrefs: string[]) =>
    hrefs
      .map((h) => NAV_DESTINATIONS.find((d) => d.href === h))
      .filter((d): d is NavDestination => !!d && canSee(d, isPlatformAdmin, role))
      .map((d) => (rotulos[d.href] ? { ...d, label: rotulos[d.href]! } : d));
  return {
    principal: achar(gestor ? MENU_IMOBILIARIA.principal : MENU_CORRETOR),
    configuracao: achar(MENU_IMOBILIARIA.configuracao),
  };
}
