import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerEmSegundoPlano } from "@/lib/opa/analisar";
import { carregarConfig } from "@/lib/opa/config";
import { CAMPOS, ORDEM_CAMPOS } from "@/lib/opa/copiloto";
import {
  CAMPOS_DIAGNOSTICO,
  carregarEquipe,
  carregarImoveis,
  carregarLeads,
  diagnosticoCompleto,
  primeiroNome,
  rotuloOrigem,
  tempoCurto,
  voltaRecente,
} from "@/lib/opa/dados";
import { contarEtiquetas, etiquetasDoLead } from "@/lib/opa/etiquetas";
import { afinidade, fotoUrl, precoCheio, precoPrincipal } from "@/lib/opa/imoveis";
import { pedidoInicial, resumoDoPedidoRadar } from "@/lib/opa/pedido-radar";
import { AdicionarImovel, CopiarPedidoRadar, PesquisarRadar, RemoverImovel } from "./_imoveis";
import { ReabrirNegocio } from "./_reabrir";
import { ExcluirLead } from "./_excluir";
import { MudarNome } from "./_nome";
import { TipoDoLead } from "./_tipo";
import { tipoDoFunil } from "@/lib/opa/tipo-lead";
import { MarcarPessoal, VoltarParaLead } from "./_pessoal";
import { MOTIVO_PESSOAL } from "@/lib/opa/contatos-whatsapp";
import { SeloLendo } from "./_lendo";
import { MontarSelecao } from "./_selecao";
import { RegistrarLigacao } from "./_ligacao";
import { proximaMensagem } from "@/lib/opa/mensagens";
import { createClient } from "@/lib/supabase/server";
import {
  CaretDown,
  ArrowRight,
  ArrowsClockwise,
  Bed,
  Bell,
  BellSlash,
  Buildings,
  CalendarBlank,
  ChatText,
  Check,
  Clock,
  ClockCounterClockwise,
  Coins,
  Fire,
  House,
  HouseLine,
  IdentificationCard,
  Infinito,
  Lightbulb,
  Lock,
  MapPin,
  Notepad,
  PaperPlaneTilt,
  Phone,
  Prohibit,
  Question,
  SealCheck,
  Smiley,
  Snowflake,
  Sparkle,
  Tag,
  Target,
  Thermometer,
  Timer,
  Trophy,
  UserCircle,
  UserPlus,
  UsersThree,
  Warning,
  WhatsappLogo,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../../_opa/cabecalho";
import { BotaoEnvio, FormComRetorno } from "../../_opa/form-com-retorno";
import { FotoImovel } from "../../_opa/componentes";
import { IlustraAgenda, IlustraCasa, IlustraConversa } from "../../_opa/ilustracoes";
import { AbasPilula, Cartao, Chip, IconeRedondo, TituloBloco, Vazio, type Icone } from "../../_opa/ui";
import {
  alternarEtiqueta,
  alternarLembretes,
  anotarNoLead,
  confirmarSugestao,
  descartarSugestao,
  editarCampo,
  reanalisar,
  salvarCamposCorretor,
} from "../actions";
import {
  AgendarMensagem,
  EtapasClicaveis,
  GanharNegocio,
  MensagemPronta,
  PerderNegocio,
  RegistrarVisita,
} from "./_componentes";

export const dynamic = "force-dynamic";

interface Sugestao {
  id: string;
  campo: keyof typeof CAMPOS;
  valor: string;
  evidencia: string | null;
  origem: string;
}

interface Msg {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  sent_at: string;
  sent_via: string | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
}

interface Visita {
  id: string;
  imovel_codigo: string | null;
  status: string;
  quando: string;
  quem: string | null;
  chegada: string | null;
  interesse: number | null;
  gostou: string | null;
  nao_gostou: string | null;
  objecao: string | null;
  proximo_passo: string | null;
  observacoes: string | null;
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

const ABAS: Array<[string, string, Icone]> = [
  ["resumo", "Resumo", Sparkle],
  ["etiquetas", "Etiquetas", Tag],
  ["campos", "Campos", Notepad],
  ["visitas", "Visitas", CalendarBlank],
  ["imoveis", "Imóveis", HouseLine],
  ["historico", "Histórico", ClockCounterClockwise],
];

/** Ícone de cada campo do diagnóstico e do perfil. */
const ICONE_CAMPO: Record<keyof typeof CAMPOS, Icone> = {
  finalidade: House,
  regiao: MapPin,
  momento: Clock,
  inegociavel: SealCheck,
  faixa: Coins,
  suites: Bed,
  estilo_vida: Smiley,
  quem_decide: UsersThree,
};

/** Ícone de cada grupo de etiqueta (Configurações > Etiquetas). */
const ICONE_GRUPO: Record<string, Icone> = {
  offmarket: Lock,
  finalidade: House,
  regiao: MapPin,
  bairro: MapPin,
  faixa: Coins,
  int: Smiley,
  tipo: Buildings,
  momento: Clock,
};

/** Ícone e tom de cada tipo de item do histórico. */
const ICONE_HISTORICO: Record<string, [Icone, "claro" | "acao" | "escuro" | "ok" | "aviso"]> = {
  entrada: [UserPlus, "claro"],
  atividade: [ArrowsClockwise, "claro"],
  venda: [Trophy, "ok"],
  meta: [Infinito, "acao"],
  visita: [CalendarBlank, "claro"],
  agenda: [Bell, "aviso"],
  copiloto: [Sparkle, "escuro"],
  nota: [Notepad, "claro"],
  boas_vindas: [WhatsappLogo, "ok"],
};

function ChipTemperatura({ valor }: { valor?: "quente" | "morno" | "frio" }) {
  if (!valor) return null;
  if (valor === "quente") return <Chip icone={Fire} tom="alerta">Quente</Chip>;
  if (valor === "morno") return <Chip icone={Thermometer} tom="aviso">Morno</Chip>;
  return <Chip icone={Snowflake} tom="claro">Frio</Chip>;
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; conversa?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { id } = await params;
  const { aba = "resumo", conversa: avisoConversa } = await searchParams;
  const supabase = await createClient();

  const [lead] = await carregarLeads(org.orgId, { leadId: id });
  if (!lead) notFound();

  // A IA relê sozinha quando chegou mensagem depois da última leitura, mas a
  // ficha não espera por ela (V1): abre na hora com a leitura anterior e o selo
  // "Lendo a conversa", e a leitura roda depois que a resposta saiu.
  const ultimaMsg = lead.conversa?.ultimaEm ? Date.parse(lead.conversa.ultimaEm) : 0;
  const lidoEm = lead.copiloto.analisado_em ? Date.parse(lead.copiloto.analisado_em) : 0;
  // Quem só lê (viewer) não dispara leitura paga da IA (pendência C6).
  let lendo = Boolean(lead.conversa?.id) && ultimaMsg > lidoEm && org.role !== "viewer";
  if (lendo) {
    // A identidade já foi validada no servidor do Auth por requireAuth (getUser).
    // Daqui só sai o token para a leitura rodar com a RLS de quem abriu, e só se
    // a sessão do cookie for da mesma pessoa validada.
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.user.id === user.id ? sessao.session.access_token : undefined;
    if (token) after(() => lerEmSegundoPlano(token, org.orgId, id));
    else lendo = false;
  }

  const [
    imoveis,
    equipe,
    config,
    { data: funilRaw },
    { data: etapasRaw },
    { data: sugRaw },
    { data: msgRaw },
    { data: visitasRaw },
    { data: atividadesRaw },
    { data: eventosRaw },
    { data: agendadosRaw },
    { data: aceitasRaw },
    { data: notasRaw },
  ] = await Promise.all([
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    carregarConfig(supabase, org.orgId),
    supabase.from("crm_pipelines").select("name, slug").eq("id", lead.pipelineId).maybeSingle(),
    supabase
      .from("crm_stages")
      .select("id, name, position, is_won, is_lost")
      .eq("organization_id", org.orgId)
      .eq("pipeline_id", lead.pipelineId)
      .order("position"),
    supabase.from("copiloto_sugestoes").select("id, campo, valor, evidencia, origem").eq("lead_id", id).eq("status", "pendente"),
    lead.conversa?.id
      ? supabase
          .from("messages")
          .select("id, direction, body, sent_at, sent_via, metadata, status")
          .eq("conversation_id", lead.conversa.id)
          // As 80 mais recentes (a lista é invertida abaixo para ficar em ordem).
          .order("sent_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] }),
    supabase.from("visitas").select("*").eq("lead_id", id).order("quando", { ascending: false }),
    supabase
      .from("crm_lead_activities")
      .select("type, payload, performed_at, reason")
      .eq("lead_id", id)
      .neq("type", "nota")
      .order("performed_at", { ascending: false })
      .limit(30),
    supabase.from("eventos_meta").select("evento, valor_cents, status, created_at").eq("lead_id", id),
    supabase.from("lembretes_agendados").select("quando, mensagem, status, created_at").eq("lead_id", id),
    supabase.from("copiloto_sugestoes").select("campo, valor, decidido_em").eq("lead_id", id).eq("status", "aceita"),
    // Anotações livres de corretor e gestor (#516, item 9): à parte, para nenhuma sumir entre as atividades.
    supabase
      .from("crm_lead_activities")
      .select("id, payload, performed_at, performed_by_user_id")
      .eq("lead_id", id)
      .eq("type", "nota")
      .order("performed_at", { ascending: false })
      .limit(50),
  ]);

  const funil = (funilRaw as { name: string; slug: string } | null) ?? { name: "Compradores", slug: "compradores" };
  const compradores = funil.slug === "compradores";
  // Ganho e perdido não são etapa clicável: viram resultado pelos botões.
  const etapas = ((etapasRaw ?? []) as Array<{ id: string; name: string; is_won: boolean; is_lost: boolean }>)
    .filter((e) => !e.is_won && !e.is_lost)
    .map((e) => ({ id: e.id, nome: e.name }));
  const sugestoes = ((sugRaw ?? []) as Sugestao[]).sort((a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo));
  const mensagens = ((msgRaw ?? []) as Msg[]).reverse();
  const visitas = (visitasRaw ?? []) as Visita[];

  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const entrada = porCodigo.get(lead.imovelCodigo ?? "") ?? null;
  const podeEditar = org.role !== "viewer";
  const interesse = lead.imoveisInteresse.map((c) => porCodigo.get(c)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const vendido = lead.venda ? (porCodigo.get(lead.venda.imovel_codigo) ?? null) : null;
  const voltouRecente = voltaRecente(lead);
  const imovelDaVolta = voltouRecente?.imovel_codigo ? (porCodigo.get(voltouRecente.imovel_codigo) ?? null) : null;
  const disponiveis = imoveis.filter((i) => i.status !== "vendido");
  const opcoesGanho = [
    ...interesse.map((i) => ({ codigo: i.codigo, titulo: i.titulo, precoCents: i.preco_venda_cents, doNegocio: i.codigo === lead.imovelCodigo })),
    ...disponiveis
      .filter((i) => !lead.imoveisInteresse.includes(i.codigo))
      .map((i) => ({ codigo: i.codigo, titulo: i.titulo, precoCents: i.preco_venda_cents, doNegocio: false })),
  ];
  const perfil = { ...lead.campos, imovelEntrada: entrada };
  const combinam = disponiveis
    .filter((i) => !lead.imoveisInteresse.includes(i.codigo))
    .map((i) => ({ i, a: afinidade(i, perfil, config.cruzamento.pesos) }))
    .filter((x) => x.a.pontos >= config.cruzamento.minimo)
    .sort((x, y) => y.a.pontos - x.a.pontos);

  const dono = equipe.get(lead.donoId ?? "");
  const feitos = diagnosticoCompleto(lead.campos);
  const modelo = proximaMensagem({
    nome: lead.nome,
    corretor: primeiroNome(dono?.nome) || "o corretor",
    etapa: lead.etapa.slug,
    campos: lead.campos,
    imovelEntrada: entrada,
    combinam: combinam.slice(0, 3).map((c) => c.i),
    leadEsperando: lead.conversa?.esperandoMin != null,
    offMarket: lead.offMarket,
    voltouCom: imovelDaVolta,
  });
  // Cliente esperando e a IA já leu a última mensagem dele: o rascunho dela
  // responde ao que ele perguntou; o modelo do Kit segue o roteiro do diagnóstico.
  const ultimaEntrada = lead.conversa?.ultimaEm ? Date.parse(lead.conversa.ultimaEm) : NaN;
  const rascunhoValido =
    lead.copiloto.motor === "ia" &&
    Boolean(lead.copiloto.mensagem) &&
    lead.conversa?.esperandoMin != null &&
    Boolean(lead.copiloto.respondendo_a) &&
    Date.parse(lead.copiloto.respondendo_a ?? "") >= ultimaEntrada - 1000;
  const mensagem = rascunhoValido
    ? { motivo: "Resposta à última mensagem do cliente, escrita pela IA. Confira antes de mandar.", texto: lead.copiloto.mensagem! }
    : modelo;
  const etiquetas = etiquetasDoLead(lead, entrada);
  const nEtiquetas = contarEtiquetas(etiquetas);
  const aberto = lead.status === "open";
  // F9: lead perdido mostra o motivo e a data; o gestor reabre.
  const gestorDaTela = org.role === "manager" || org.role === "admin";
  const perda =
    lead.status === "lost"
      ? ((
          await supabase.from("crm_leads").select("lost_reason, closed_at").eq("organization_id", org.orgId).eq("id", lead.id).maybeSingle()
        ).data as { lost_reason: string | null; closed_at: string | null } | null)
      : null;
  const wa = lead.telefone ? `https://wa.me/${lead.telefone.replace(/\D/g, "")}` : null;
  const linkAba = (a: string) => `/app/leads/${lead.id}${a === "resumo" ? "" : `?aba=${a}`}`;
  const contagem: Record<string, number | null> = {
    etiquetas: nEtiquetas,
    visitas: visitas.length,
    imoveis: interesse.length + Math.min(combinam.length, 6),
  };

  const notas = ((notasRaw ?? []) as Array<{ id: string; payload: { texto?: string }; performed_at: string; performed_by_user_id: string | null }>).map((n) => ({
    id: n.id,
    em: n.performed_at,
    texto: String(n.payload?.texto ?? ""),
    autor: equipe.get(n.performed_by_user_id ?? "")?.nome ?? "Pessoa removida",
  }));

  // Histórico: tudo o que aconteceu com o negócio, do mais novo ao mais velho.
  const historico = [
    { em: lead.criadoEm, texto: `Entrou por ${rotuloOrigem(lead.origem, "nova entrada")}${entrada ? `, imóvel ${entrada.codigo}` : ""}`, tipo: "entrada" },
    ...((atividadesRaw ?? []) as Array<{ type: string; payload: Record<string, unknown>; performed_at: string; reason: string | null }>).map((a) => ({
      em: a.performed_at,
      texto:
        a.type === "boas_vindas_enviada" || a.type === "boas_vindas_nao_enviada" || a.type === "lead_do_whatsapp" || a.type === "etapa_automatica"
          ? (a.reason ?? a.type.replace(/_/g, " "))
          : a.type === "selecao_enviada"
            ? `Seleção enviada pelo WhatsApp${Array.isArray(a.payload.imoveis) && a.payload.imoveis.length ? `: ${(a.payload.imoveis as string[]).join(", ")}` : ""}`
          : a.type === "lead_voltou"
          ? `Voltou por outro formulário (${a.payload.vez}º), sem roleta`
          : a.type === "ligacao"
            ? `Ligação: ${a.payload.resultado === "atendeu" ? "atendeu" : a.payload.resultado === "retorno" ? "pediu retorno" : "não atendeu"}`
          : a.type === "venda_realizada"
            ? `Negócio ganho: VGV ${precoCheio(a.payload.vgv_cents as number)}, comissão ${precoCheio(a.payload.comissao_cents as number)}`
          : a.type === "respondido"
            ? "Corretor marcou como respondido"
          : a.type === "mudou_de_funil"
            ? `Passou para o funil ${String(a.payload.para ?? "")}`
          : a.type === "nome_alterado"
            ? "Nome do lead alterado"
          : a.type === "reaberto"
            ? `Negócio reaberto${a.payload.motivo_da_perda ? ` (tinha sido perdido por: ${String(a.payload.motivo_da_perda)})` : ""}`
            : a.type.replace(/_/g, " "),
      tipo: a.type === "venda_realizada" ? "venda" : a.type === "boas_vindas_enviada" ? "boas_vindas" : "atividade",
    })),
    ...notas.map((n) => ({ em: n.em, texto: `Anotação de ${n.autor}: “${n.texto.slice(0, 120)}${n.texto.length > 120 ? "…" : ""}”`, tipo: "nota" })),
    ...((eventosRaw ?? []) as Array<{ evento: string; valor_cents: number | null; status: string; created_at: string }>).map((e) => ({
      em: e.created_at,
      texto: `Evento “${e.evento}” para o Meta${e.valor_cents ? `, valor ${precoCheio(e.valor_cents)}` : ""} (${e.status === "na_fila" ? "na fila" : e.status})`,
      tipo: "meta",
    })),
    ...visitas.map((v) => ({
      em: v.quando,
      texto:
        v.status === "agendada"
          ? `Visita agendada${v.imovel_codigo ? ` no ${v.imovel_codigo}` : ""}`
          : `Visita feita${v.imovel_codigo ? ` no ${v.imovel_codigo}` : ""}, interesse ${v.interesse} de 5`,
      tipo: "visita",
    })),
    ...((agendadosRaw ?? []) as Array<{ quando: string; mensagem: string; status: string; created_at: string }>).map((m) => ({
      em: m.created_at,
      texto: `Mensagem agendada para ${hora(m.quando)} (${m.status}): “${m.mensagem.slice(0, 60)}${m.mensagem.length > 60 ? "…" : ""}”`,
      tipo: "agenda",
    })),
    ...((aceitasRaw ?? []) as Array<{ campo: string; valor: string; decidido_em: string | null }>)
      .filter((s) => s.decidido_em)
      .map((s) => ({ em: s.decidido_em!, texto: `${CAMPOS[s.campo as keyof typeof CAMPOS]?.rotulo ?? s.campo} confirmado: ${s.valor}`, tipo: "copiloto" })),
  ].sort((a, b) => Date.parse(b.em) - Date.parse(a.em));

  const outrosCampos = ORDEM_CAMPOS.filter((c) => !CAMPOS[c].obrigatorioDiagnostico && lead.campos[c]);

  return (
    <>
      <CabecalhoOpa
        secao={funil.name}
        titulo={lead.nome}
        subtitulo={`${lead.telefone ?? ""}${dono ? ` · ${dono.nome}` : ""}`}
        icone={IdentificationCard}
        equipe={false}
        ferramentas={false}
      >
        {podeEditar && <MudarNome leadId={lead.id} atual={lead.nome} />}
        {(org.role === "admin" || user.is_platform_admin) && <ExcluirLead leadId={lead.id} nome={lead.nome} />}
      </CabecalhoOpa>
      <CorpoOpa>
        {/* Selos: o que diferencia este lead, num olhar. */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip icone={Infinito} tom="claro">
            {lead.pago ? "Pago" : "Orgânico"} · {rotuloOrigem(lead.origem)}
          </Chip>
          <ChipTemperatura valor={lead.copiloto.temperatura} />
          {lead.offMarket && (
            <Chip icone={Lock} tom="escuro">
              Off market{lead.offMarket === "proprietario" ? " · proprietário" : ""}
            </Chip>
          )}
          {voltouRecente && (
            <Chip icone={ArrowsClockwise} tom="claro">
              Voltou · {voltouRecente.vez}º formulário
            </Chip>
          )}
          {lead.proprio && (
            <Chip icone={UserCircle} tom="escuro">
              Lead próprio
            </Chip>
          )}
          {aberto && lead.conversa?.esperandoMin != null && (
            <Chip icone={Timer} tom="alerta">
              esperando há {tempoCurto(lead.conversa.esperandoMin)}
            </Chip>
          )}
        </div>

        {/* Logo de cara: "Lead ou pessoal?" até alguém responder. */}

        {aberto && (
          <>
            <Cartao tour="ficha-etapa" className="flex flex-col gap-3 p-5">
              {podeEditar && <TipoDoLead leadId={lead.id} atual={tipoDoFunil(funil.slug)} />}
              <p className="flex items-center gap-2 px-1 text-[13px] font-medium text-[#5b7284]">
                <Target className="size-4" /> Etapa do negócio · toque para mover
              </p>
              <EtapasClicaveis key={lead.pipelineId} leadId={lead.id} atual={lead.etapa.id} etapas={etapas} />
            </Cartao>
            {avisoConversa && (
              <p role="alert" className="rounded-2xl bg-[#fdf1e7] px-4 py-3 text-[14px] text-[#7a3f12]">
                {avisoConversa === "sem_numero"
                  ? "Não há WhatsApp conectado para abrir esta conversa. Conecte o seu em Meu WhatsApp."
                  : avisoConversa === "sem_conversa"
                    ? "Este lead ainda não tem conversa no CRM."
                    : "Não deu para abrir a conversa agora. Tente de novo em instantes."}
              </p>
            )}
            <div data-tour="ficha-acoes" className="flex flex-wrap items-center gap-2">
              {/* Sempre no Multi-atendimento do CRM, nunca no WhatsApp Web: sem
                  conversa ainda, a rota abre uma para mandar a primeira mensagem. */}
              <Link
                href={`/app/leads/${lead.id}/conversa`}
                prefetch={false}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2a7ca8] px-5 text-[14px] font-semibold text-white hover:bg-[#1f6a93]"
              >
                <WhatsappLogo weight="fill" className="size-5" /> {lead.conversa?.id ? "Abrir conversa" : "Começar conversa"}
              </Link>
              {lead.telefone ? (
                // Discar em um toque (no Hoje já existia; na ficha o corretor tinha de copiar o número).
                <a
                  href={`tel:+${lead.telefone.replace(/\D/g, "")}`}
                  data-tour="ficha-ligar"
                  aria-label={`Ligar para ${lead.nome}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]"
                >
                  <Phone className="size-4" /> Ligar
                </a>
              ) : null}
              <RegistrarLigacao leadId={lead.id} tentativas={lead.tentativasLigacao} />
              <AgendarMensagem leadId={lead.id} sugestao={mensagem.texto} />
              <details className="group relative">
                <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5] [&::-webkit-details-marker]:hidden">
                  Mais ações <CaretDown className="size-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute left-0 z-20 mt-2 flex w-[min(86vw,280px)] flex-col items-stretch gap-2 rounded-[22px] bg-[#edf2f5] p-2 shadow-[0_12px_40px_rgba(9,44,62,0.2)] [&>*]:w-full [&_button]:w-full [&_button]:justify-start [&>a]:justify-start">
              <RegistrarVisita
                leadId={lead.id}
                imoveis={disponiveis.map((i) => ({ codigo: i.codigo, titulo: i.titulo }))}
                padrao={lead.imovelCodigo}
                campos={config.ficha_visita}
              />
              <Link
                href={`/app/kit?lead=${lead.id}`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]"
              >
                <PaperPlaneTilt className="size-4" /> Abrir no kit
              </Link>
              <GanharNegocio leadId={lead.id} nome={lead.nome} opcoes={opcoesGanho} />
              <PerderNegocio
                leadId={lead.id}
                motivos={config.motivos_perda.map((m) => m.motivo).filter((m) => gestorDaTela || lead.proprio || m !== MOTIVO_PESSOAL)}
              />
              {(gestorDaTela || lead.proprio) && <MarcarPessoal leadId={lead.id} />}
                </div>
              </details>
            </div>
          </>
        )}

        {lead.status === "won" && lead.venda && (
          <section className="flex flex-col gap-5 rounded-[28px] bg-[#0b7a4b] p-7 text-white md:flex-row md:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Trophy weight="fill" className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/70">
                Negócio ganho em {new Date(`${lead.venda.data}T12:00:00`).toLocaleDateString("pt-BR")}
              </p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">{vendido?.titulo ?? lead.venda.imovel_codigo}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-[13px]">
                  VGV {precoCheio(lead.venda.vgv_cents)}
                  {lead.venda.outro_valor && lead.venda.valor_pedido_cents ? ` (pedido ${precoCheio(lead.venda.valor_pedido_cents)})` : ""}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-[13px]">Comissão OPA {precoCheio(lead.venda.comissao_cents)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[13px]">
                  <Infinito className="size-3.5" /> Venda realizada na fila do Meta
                </span>
              </div>
            </div>
          </section>
        )}
        {lead.status === "lost" && (
          <Cartao className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <IconeRedondo icone={Prohibit} tom="alerta" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[#0a2d40]">
                {perda?.lost_reason === MOTIVO_PESSOAL ? "Contato pessoal" : "Negócio perdido"}
                {perda?.closed_at ? ` em ${hora(perda.closed_at)}` : ""}
              </p>
              <p className="text-[14px] text-[#34566b]">
                {perda?.lost_reason === MOTIVO_PESSOAL
                  ? "Foi marcado como contato pessoal: a conversa saiu do CRM e a IA não lê. Se era lead de verdade, volte."
                  : (
                    <>
                      {perda?.lost_reason ? `Motivo: ${perda.lost_reason}.` : "Sem motivo registrado."}{" "}
                      {gestorDaTela ? "Se o cliente voltou a negociar, reabra." : "Se o cliente voltou a negociar, peça ao gestor para reabrir."}
                    </>
                  )}
              </p>
            </div>
            {perda?.lost_reason === MOTIVO_PESSOAL ? (
              <VoltarParaLead leadId={lead.id} />
            ) : (
              gestorDaTela && <ReabrirNegocio leadId={lead.id} />
            )}
          </Cartao>
        )}

        <AbasPilula
          itens={ABAS.filter(([k]) => compradores || k !== "imoveis").map(([k, r, icone]) => ({
            href: linkAba(k),
            rotulo: r,
            icone,
            contagem: contagem[k] || null,
            ativo: aba === k,
          }))}
        />

        {aba === "resumo" && (
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
              {/* O único cartão escuro da tela: o que a IA leu e o que falta confirmar. */}
              <Cartao escuro bloco tour="ficha-copiloto">
                <TituloBloco
                  claro
                  icone={Sparkle}
                  titulo="Copiloto"
                  sub={`${lead.copiloto.motor === "ia" ? "Lido pelo Auxiliar OPA" : "Modo demonstração, sem chave de IA"}${lead.copiloto.analisado_em ? ` · ${hora(lead.copiloto.analisado_em)}` : ""}`}
                  acao={
                    <form action={reanalisar}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <button
                        type="submit"
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-3.5 text-[13px] font-medium text-white hover:bg-white/15"
                      >
                        <ArrowsClockwise className="size-4" /> Ler de novo
                      </button>
                    </form>
                  }
                />
                {lendo && (
                  <div className="mt-4">
                    <SeloLendo />
                  </div>
                )}
                <p className="mt-5 text-[17px] leading-relaxed text-white/90">
                  {lead.copiloto.resumo ?? (lendo ? "Lendo a conversa agora. Este resumo aparece em instantes." : "Ainda não li esta conversa.")}
                </p>
                {lead.copiloto.proximoPasso && aberto && (
                  <p className="mt-4 flex items-start gap-2.5 rounded-[18px] bg-white/10 px-4 py-3 text-[14px] text-white">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-[#8fc4dd]" weight="bold" /> {lead.copiloto.proximoPasso}
                  </p>
                )}
                {(lead.copiloto.objecoes?.length ?? 0) > 0 && aberto && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-white/65">Preocupa o cliente:</span>
                    {lead.copiloto.objecoes!.map((o) => (
                      <span key={o} className="rounded-full border border-[#8fc4dd]/50 px-3 py-1 text-[13px] text-white">
                        {o}
                      </span>
                    ))}
                  </div>
                )}

                {sugestoes.length > 0 && (
                  <div data-tour="ficha-sugestoes" className="mt-6">
                    <p className="flex items-center gap-2 text-[13px] text-white/65">
                      <Lightbulb className="size-4" /> A IA anotou da conversa. Nada entra no lead sem você.
                    </p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {sugestoes.map((s) => {
                        const I = ICONE_CAMPO[s.campo] ?? Tag;
                        return (
                          <li key={s.id} className="rounded-[20px] bg-white/[0.07] p-4">
                            <FormComRetorno action={confirmarSugestao} sucesso="Anotado no lead." className="flex flex-col gap-2.5">
                              <input type="hidden" name="id" value={s.id} />
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/60">
                                  <I className="size-3.5" /> {CAMPOS[s.campo]?.rotulo ?? s.campo}
                                </span>
                                {lead.campos[s.campo] && <span className="text-[11px] text-white/45">antes: {lead.campos[s.campo]}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  name="valor"
                                  defaultValue={s.valor}
                                  aria-label={CAMPOS[s.campo]?.rotulo ?? s.campo}
                                  className="h-11 min-w-0 flex-1 rounded-[14px] border border-transparent bg-white/10 px-3.5 text-[15px] font-medium text-white outline-none focus:border-[#8fc4dd]"
                                />
                                <BotaoEnvio
                                  title="Confirmar"
                                  aria-label="Confirmar anotação"
                                  tamanhoIcone="size-5"
                                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2a7ca8] text-white hover:bg-[#3a8cb8]"
                                >
                                  <Check className="size-5" weight="bold" />
                                </BotaoEnvio>
                                <BotaoEnvio
                                  acao={descartarSugestao}
                                  sucesso="Anotação descartada."
                                  title="Descartar"
                                  aria-label="Descartar anotação"
                                  tamanhoIcone="size-5"
                                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
                                >
                                  <X className="size-5" />
                                </BotaoEnvio>
                              </div>
                              {s.evidencia && (
                                <p className="flex items-start gap-1.5 text-[12px] italic text-white/55">
                                  <ChatText className="mt-0.5 size-3.5 shrink-0 not-italic" /> “{s.evidencia}”
                                </p>
                              )}
                            </FormComRetorno>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Cartao>

              <Cartao bloco>
                <TituloBloco icone={Notepad} titulo="Anotações" sub="Corretor e gestor, com autor e hora. Ficam no histórico." />
                {podeEditar && (
                  <FormComRetorno action={anotarNoLead} sucesso="Anotação salva." className="mt-4 flex flex-col gap-2.5">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <textarea
                      name="texto"
                      required
                      maxLength={2000}
                      rows={3}
                      aria-label="Nova anotação"
                      placeholder="O que vale lembrar deste lead"
                      className="w-full resize-y rounded-[18px] bg-[#f2f6f9] px-4 py-3 text-[14px] text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
                    />
                    <BotaoEnvio className="inline-flex h-11 items-center gap-1.5 self-end rounded-full bg-[#0a2d40] px-5 text-[13px] font-semibold text-white hover:bg-[#12455f]">
                      Salvar anotação
                    </BotaoEnvio>
                  </FormComRetorno>
                )}
                {notas.length > 0 ? (
                  <ol className="mt-4 flex flex-col gap-2.5">
                    {notas.map((n) => (
                      <li key={n.id} className="rounded-[18px] bg-[#f2f6f9] px-4 py-3">
                        <p className="whitespace-pre-line text-[14px] text-[#0a2d40]">{n.texto}</p>
                        <p className="mt-1.5 text-[12px] text-[#5b7284]">
                          {n.autor} · {hora(n.em)}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-[14px] text-[#5b7284]">Nenhuma anotação ainda.</p>
                )}
              </Cartao>

              <Cartao bloco>
                <TituloBloco
                  icone={WhatsappLogo}
                  titulo={`WhatsApp de ${primeiroNome(dono?.nome) || "corretor"}`}
                  sub="O corretor conversa pelo celular. O CRM lê e a IA anota."
                />
                <div className="mt-5 flex max-h-[520px] flex-col gap-2 overflow-y-auto rounded-[22px] bg-[#efe9e1] p-4">
                  {mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[82%] rounded-[18px] px-3.5 py-2 text-[14px] shadow-[0_1px_1px_rgba(0,0,0,0.06)]",
                        m.direction === "inbound" ? "self-start rounded-tl-md bg-white text-[#0a2d40]" : "self-end rounded-tr-md bg-[#dcf8c6] text-[#0a2d40]",
                      )}
                    >
                      <p className="whitespace-pre-line">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-[#5b7284]">
                        {hora(m.sent_at)}
                        {m.direction === "outbound" &&
                          ((m.metadata as { boas_vindas?: boolean } | null | undefined)?.boas_vindas
                            ? m.status === "failed"
                              ? " · boas-vindas automática, não saiu"
                              : " · boas-vindas automática"
                            : m.sent_via === "external_device"
                              ? " · pelo celular"
                              : " · pelo CRM")}
                      </p>
                    </div>
                  ))}
                  {mensagens.length === 0 && (
                    <Vazio ilustracao={<IlustraConversa />} titulo="Nenhuma mensagem ainda" texto="Quando o lead escrever no WhatsApp do corretor, a conversa aparece aqui." />
                  )}
                </div>
              </Cartao>
            </div>

            <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
              {lead.respostasFormulario.length > 0 && (
                <Cartao>
                  <TituloBloco
                    icone={Question}
                    titulo="Respostas do formulário"
                    sub={lead.respostasEm ? `Enviado em ${hora(lead.respostasEm)}` : "O que a pessoa respondeu ao entrar"}
                  />
                  <dl className="mt-4 flex flex-col gap-2.5">
                    {lead.respostasFormulario.map((r) => (
                      <div key={r.chave} className="rounded-[18px] bg-[#f2f6f9] px-4 py-3">
                        <dt className="text-[13px] text-[#5b7284]">{r.pergunta}</dt>
                        <dd className="mt-1 whitespace-pre-line text-[15px] font-semibold text-[#0a2d40]">{r.resposta}</dd>
                      </div>
                    ))}
                  </dl>
                </Cartao>
              )}

              {voltouRecente && (
                <Cartao>
                  <TituloBloco icone={ArrowsClockwise} titulo="Voltou por outro formulário" sub="Sem roleta: veio direto para quem já cuidava" />
                  <p className="mt-4 text-[14px] leading-relaxed text-[#34566b]">
                    {hora(voltouRecente.em)}, {rotuloOrigem(voltouRecente.origem, "nova entrada")}
                    {imovelDaVolta ? `: ${imovelDaVolta.codigo} · ${imovelDaVolta.titulo}` : ""}. O imóvel novo entrou na lista de interesse e o lead
                    subiu na fila.
                  </p>
                </Cartao>
              )}

              {lead.offMarket && (
                <Cartao>
                  <TituloBloco
                    icone={Lock}
                    tom="escuro"
                    titulo={`Off market · ${lead.offMarket === "proprietario" ? "proprietário" : "comprador"}`}
                    sub="Atenção no tratamento"
                  />
                  <ul className="mt-4 flex flex-col gap-2.5 text-[14px] text-[#34566b]">
                    {(lead.offMarket === "proprietario"
                      ? [
                          "Captação com sigilo: sem placa, sem foto pública, sem portal e sem post.",
                          "Visita de avaliação discreta, no horário que o proprietário escolher.",
                          "Mandato com data de validade e parecer só para ele.",
                          "Divulgação apenas por link reservado, para compradores qualificados.",
                        ]
                      : [
                          "Mandar imóvel só por link reservado, nunca foto solta nem link de portal.",
                          "Nada de post ou story com o imóvel que ele viu.",
                          "Visita discreta, combinada antes com o proprietário.",
                          "Mensagens no perfil off market do kit.",
                        ]
                    ).map((t) => (
                      <li key={t} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" weight="bold" /> {t}
                      </li>
                    ))}
                  </ul>
                </Cartao>
              )}

              <Diagnostico leadId={lead.id} campos={lead.campos} feitos={feitos} pendentes={sugestoes.map((s) => s.campo)} outros={outrosCampos} />

              {aberto && (
                <Cartao tour="ficha-mensagem">
                  <TituloBloco icone={PaperPlaneTilt} titulo="Próxima mensagem" sub={mensagem.motivo} />
                  <div className="mt-4">
                    <MensagemPronta texto={mensagem.texto} telefone={lead.telefone} />
                  </div>
                </Cartao>
              )}

              {entrada && (
                <Cartao>
                  <TituloBloco icone={HouseLine} titulo="Negócio" sub="Criado sozinho quando o lead entrou" />
                  <Link href={`/app/imoveis/${entrada.codigo}`} className="mt-4 flex items-center gap-4 rounded-[20px] bg-[#f2f6f9] p-3 hover:bg-[#e7f0f5]">
                    <FotoImovel imovel={entrada} className="h-[72px] w-24 shrink-0 rounded-2xl" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[14px] font-semibold text-[#0a2d40]">{entrada.titulo}</p>
                      <p className="mt-0.5 text-[13px] text-[#5b7284]">
                        {entrada.codigo} · {precoCheio(entrada.preco_venda_cents)}
                      </p>
                    </div>
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip icone={Target} tom="neutro">
                      {lead.etapa.nome}
                    </Chip>
                    <Chip icone={UserCircle} tom="neutro">
                      Captador: {primeiroNome(equipe.get(entrada.captador_user_id ?? "")?.nome) || "não informado"}
                    </Chip>
                  </div>
                </Cartao>
              )}

              <Cartao>
                <TituloBloco icone={Infinito} titulo="Origem e avisos" sub={`Entrou em ${hora(lead.criadoEm)}`} />
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Chip tom="neutro">{rotuloOrigem(lead.origem)}</Chip>
                  <Chip icone={Timer} tom="neutro">
                    {lead.pago ? `Pago, ${tempoCurto(config.prazos.pago_min)}` : `Orgânico, ${tempoCurto(config.prazos.organico_min)}`}
                  </Chip>
                </div>
                {(lead.origem.anuncio || lead.origem.campanha || lead.origem.conjunto) && (
                  <dl className="mt-4 grid grid-cols-1 gap-2 text-[13px]">
                    {(
                      [
                        ["Anúncio", lead.origem.anuncio],
                        ["Campanha", lead.origem.campanha],
                        ["Conjunto", lead.origem.conjunto],
                      ] as const
                    ).map(([k, v]) =>
                      v ? (
                        <div key={k} className="flex gap-3 rounded-[14px] bg-[#f2f6f9] px-3.5 py-2.5">
                          <dt className="w-20 shrink-0 text-[#5b7284]">{k}</dt>
                          <dd className="min-w-0 text-[#0a2d40]">{v}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}
                {lead.boasVindas && (
                  <p className="mt-4 flex items-start gap-2.5 text-[14px] text-[#34566b]">
                    {lead.boasVindas.status === "enviada" ? (
                      <WhatsappLogo className="mt-0.5 size-5 shrink-0 text-[#1f8a5b]" />
                    ) : (
                      <Warning className="mt-0.5 size-5 shrink-0 text-[#a4410e]" />
                    )}
                    {lead.boasVindas.status === "enviada"
                      ? `Boas-vindas enviada às ${hora(lead.boasVindas.em)} pelo WhatsApp de ${primeiroNome(dono?.nome) || "corretor"}`
                      : lead.boasVindas.status === "enviando"
                        ? "Boas-vindas saindo agora"
                        : lead.boasVindas.status === "sem_whatsapp"
                          ? "Este número não tem WhatsApp: ligue ou mande e-mail"
                          : "Boas-vindas não confirmada pelo WhatsApp: veja o histórico"}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e7eef2] pt-4">
                  <p className="flex items-center gap-2.5 text-[14px] text-[#34566b]">
                    {lead.lembretesDesligados ? <BellSlash className="size-5 text-[#5b7284]" /> : <Bell className="size-5 text-[#2a7ca8]" />}
                    {lead.lembretesDesligados ? "Avisos desligados" : "OPA Lembretes avisa nos prazos"}
                  </p>
                  {(gestorDaTela || lead.proprio || lead.lembretesDesligados) && (
                    <FormComRetorno action={alternarLembretes} sucesso={lead.lembretesDesligados ? "Avisos ligados." : "Avisos desligados."}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <BotaoEnvio className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#eef3f6] px-4 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]">
                        {lead.lembretesDesligados ? "Ligar" : "Desligar"}
                      </BotaoEnvio>
                    </FormComRetorno>
                  )}
                </div>
              </Cartao>
            </div>
          </div>
        )}

        {aba === "etiquetas" && (
          <>
            <p className="flex items-center gap-2 text-[14px] text-[#5b7284]">
              <Sparkle className="size-4 text-[#2a7ca8]" weight="fill" /> As marcadas com a estrela vieram sozinhas do imóvel ou da conversa. Toque para marcar
              ou desmarcar as outras.
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              {config.etiquetas.map((g) => {
                const marcadas = etiquetas[g.chave] ?? [];
                const blocos = g.subgrupos ? Object.entries(g.subgrupos) : [["", g.opcoes] as [string, string[]]];
                return (
                  <Cartao key={g.chave} className={cn(g.subgrupos && "md:col-span-2")}>
                    <TituloBloco
                      icone={ICONE_GRUPO[g.chave] ?? Tag}
                      tom={g.destaque ? "escuro" : "claro"}
                      titulo={g.nome}
                      sub={marcadas.length ? `${marcadas.length} ${marcadas.length === 1 ? "marcada" : "marcadas"}` : "Nenhuma marcada"}
                    />
                    {g.nota && <p className="mt-3 text-[13px] text-[#5b7284]">{g.nota}</p>}
                    {blocos.map(([sub, opcoes]) => (
                      <div key={sub} className="mt-4">
                        {sub && <p className="mb-2 text-[12px] font-semibold text-[#12455f]">{sub}</p>}
                        <div className="flex flex-wrap gap-2">
                          {opcoes.map((o) => {
                            const m = marcadas.find((x) => x.valor === o);
                            return (
                              <FormComRetorno key={o} action={alternarEtiqueta} sucesso={m ? `Etiqueta ${o} tirada.` : `Etiqueta ${o} marcada.`}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="grupo" value={g.chave} />
                                <input type="hidden" name="valor" value={o} />
                                <BotaoEnvio
                                  disabled={m?.auto}
                                  aria-pressed={Boolean(m)}
                                  title={m?.auto ? "Veio do imóvel ou da conversa" : m ? "Desmarcar" : "Marcar"}
                                  className={cn(
                                    "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                                    m ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#34566b] hover:bg-[#e7f0f5]",
                                    m?.auto && "cursor-default",
                                  )}
                                >
                                  {m?.auto && <Sparkle className="size-3.5 text-[#8fc4dd]" weight="fill" />}
                                  {m && !m.auto && <Check className="size-3.5" weight="bold" />}
                                  {o}
                                </BotaoEnvio>
                              </FormComRetorno>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </Cartao>
                );
              })}
            </div>
          </>
        )}

        {aba === "campos" && (
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Diagnostico leadId={lead.id} campos={lead.campos} feitos={feitos} pendentes={[]} outros={[]} editavel />
            <Cartao bloco>
              <TituloBloco
                icone={Notepad}
                titulo={compradores ? "Campos do corretor" : "Proprietário"}
                sub="O que não é imóvel e vale lembrar"
              />
              <FormComRetorno action={salvarCamposCorretor} sucesso="Campos salvos." className="mt-5 flex flex-col gap-4">
                <input type="hidden" name="leadId" value={lead.id} />
                {(compradores ? config.campos_lead : config.campos_proprietario).map((c) => {
                  const cls =
                    "w-full rounded-[14px] border border-transparent bg-[#f2f6f9] px-4 text-[14px] font-normal text-[#0a2d40] outline-none focus:border-[#8fc4dd] focus:bg-white";
                  return (
                    <label key={c.chave} className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                      {c.rotulo}
                      {c.tipo === "lista" ? (
                        <select name={`campo:${c.chave}`} defaultValue={lead.camposCorretor[c.chave] ?? ""} className={cn(cls, "h-11")}>
                          <option value="" />
                          {c.opcoes?.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : c.tipo === "area" ? (
                        <textarea
                          name={`campo:${c.chave}`}
                          rows={3}
                          placeholder={c.dica}
                          defaultValue={lead.camposCorretor[c.chave] ?? ""}
                          className={cn(cls, "py-3")}
                        />
                      ) : (
                        <input name={`campo:${c.chave}`} placeholder={c.dica} defaultValue={lead.camposCorretor[c.chave] ?? ""} className={cn(cls, "h-11")} />
                      )}
                    </label>
                  );
                })}
                <BotaoEnvio
                  enviando="Salvando"
                  className="mt-1 inline-flex h-11 items-center gap-2 self-start rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
                >
                  <Check className="size-4" weight="bold" /> Salvar campos
                </BotaoEnvio>
              </FormComRetorno>
            </Cartao>
          </div>
        )}

        {aba === "visitas" && (
          <div className="flex flex-col gap-5">
            {aberto && (
              <div className="flex flex-wrap gap-2">
                <RegistrarVisita
                  leadId={lead.id}
                  imoveis={disponiveis.map((i) => ({ codigo: i.codigo, titulo: i.titulo }))}
                  padrao={lead.imovelCodigo}
                  campos={config.ficha_visita}
                  variante="primario"
                />
                <RegistrarVisita
                  leadId={lead.id}
                  imoveis={disponiveis.map((i) => ({ codigo: i.codigo, titulo: i.titulo }))}
                  padrao={lead.imovelCodigo}
                  campos={config.ficha_visita}
                  modo="agendada"
                />
              </div>
            )}
            {visitas.map((v) => {
              const im = porCodigo.get(v.imovel_codigo ?? "");
              const d = new Date(v.quando);
              const agendada = v.status === "agendada";
              return (
                <Cartao key={v.id} className="flex flex-col gap-5 sm:flex-row">
                  <div
                    className={cn(
                      "flex w-full shrink-0 flex-row items-center justify-center gap-3 rounded-[22px] px-4 py-4 sm:w-[104px] sm:flex-col sm:gap-0",
                      agendada ? "bg-[#e7f0f5] text-[#12455f]" : "bg-[#f2f6f9] text-[#0a2d40]",
                    )}
                  >
                    <span className="text-[34px] font-light leading-none tracking-[-0.04em]">
                      {d.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" })}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em] sm:mt-1">
                      {d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "")}
                    </span>
                    <span className="text-[13px] text-[#5b7284] sm:mt-2">
                      {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-[16px] font-semibold text-[#0a2d40]">
                        <House className="size-5 shrink-0 text-[#2a7ca8]" />
                        <span className="truncate">{im ? `${im.codigo} · ${im.titulo}` : "Imóvel não informado"}</span>
                      </p>
                      {agendada ? (
                        <Chip icone={CalendarBlank} tom="claro">
                          Agendada
                        </Chip>
                      ) : (
                        <Chip icone={(v.interesse ?? 0) >= 4 ? Fire : Thermometer} tom={(v.interesse ?? 0) >= 4 ? "escuro" : "aviso"}>
                          Interesse {v.interesse} de 5
                        </Chip>
                      )}
                    </div>
                    {(v.quem || v.chegada) && (
                      <p className="mt-1 text-[13px] text-[#5b7284]">{[v.quem, v.chegada].filter(Boolean).join(" · ")}</p>
                    )}
                    {!agendada && (
                      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        {(
                          [
                            [Check, "Gostou", v.gostou, "text-[#1d6b43]"],
                            [X, "Não gostou", v.nao_gostou, "text-[#a4410e]"],
                            [Warning, "Objeção", v.objecao, "text-[#9a5b00]"],
                            [ArrowRight, "Próximo passo", v.proximo_passo, "text-[#2a7ca8]"],
                          ] as const
                        ).map(([I, k, val, cor]) =>
                          val ? (
                            <div key={k} className="flex gap-2.5 rounded-[16px] bg-[#f2f6f9] px-3.5 py-3">
                              <I className={cn("mt-0.5 size-4 shrink-0", cor)} weight="bold" />
                              <div className="min-w-0">
                                <dt className="text-[12px] text-[#5b7284]">{k}</dt>
                                <dd className="text-[14px] text-[#0a2d40]">{val}</dd>
                              </div>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    )}
                    {agendada && (
                      <p className="mt-3 flex items-center gap-2 text-[13px] text-[#5b7284]">
                        <Bell className="size-4" /> Na véspera às 18h o OPA Lembretes avisa o corretor. Depois da visita, ele pede a ficha.
                      </p>
                    )}
                    {v.observacoes && <p className="mt-3 text-[14px] text-[#34566b]">{v.observacoes}</p>}
                  </div>
                </Cartao>
              );
            })}
            {visitas.length === 0 && (
              <Cartao bloco>
                <Vazio ilustracao={<IlustraAgenda />} titulo="Nenhuma visita ainda" texto="Agende a visita aqui. Depois dela, a ficha registra o que gostou e o que não gostou." />
              </Cartao>
            )}
          </div>
        )}

        {aba === "imoveis" && compradores && (
          <div className="grid gap-5 lg:grid-cols-12 [&>*]:min-w-0">
            <Cartao bloco className="lg:col-span-5">
              <TituloBloco icone={HouseLine} titulo="Imóveis de interesse" sub="O de entrada e os que ele pediu depois" />
              {podeEditar && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdicionarImovel
                    leadId={lead.id}
                    jaTem={lead.imoveisInteresse}
                    acervo={imoveis
                      .filter((i) => i.status !== "vendido")
                      .map((i) => ({ codigo: i.codigo, titulo: i.titulo, preco: precoPrincipal(i), bairro: i.bairro, foto: fotoUrl(i) }))}
                  />
                  <PesquisarRadar
                    leadId={lead.id}
                    inicial={lead.pedidoRadar?.pedido ?? pedidoInicial(primeiroNome(lead.nome), lead.campos)}
                  />
                </div>
              )}
              {lead.pedidoRadar && (
                <div className="mt-4 rounded-[20px] bg-[#eaf4f9] p-4">
                  <p className="text-[12px] font-medium text-[#5b7284]">
                    Pedido ao OPA Radar · {new Date(lead.pedidoRadar.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  <p className="mt-1 text-[14px] text-[#0a2d40]">{resumoDoPedidoRadar(lead.pedidoRadar.pedido)}</p>
                  <div className="mt-2">
                    <CopiarPedidoRadar pedido={lead.pedidoRadar.pedido} />
                  </div>
                </div>
              )}
              <ul className="mt-5 flex flex-col gap-3">
                {interesse.map((im) => (
                  <li key={im.codigo} className="flex items-center gap-1">
                    <Link href={`/app/imoveis/${im.codigo}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] bg-[#f2f6f9] p-3 hover:bg-[#e7f0f5]">
                      <FotoImovel imovel={im} className="h-[64px] w-[88px] shrink-0 rounded-2xl" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#5b7284]">
                          {im.codigo === lead.imovelCodigo ? "Imóvel de entrada" : "Também pediu"} · {im.codigo}
                          {im.off_market && <Lock className="size-3.5" weight="fill" />}
                        </p>
                        <p className="line-clamp-1 text-[14px] font-semibold text-[#0a2d40]">{im.titulo}</p>
                        <p className="text-[13px] text-[#5b7284]">{precoPrincipal(im)}</p>
                      </div>
                    </Link>
                    {podeEditar && im.codigo !== lead.imovelCodigo && <RemoverImovel leadId={lead.id} codigo={im.codigo} />}
                  </li>
                ))}
              </ul>
              {interesse.length === 0 && <Vazio ilustracao={<IlustraCasa />} titulo="Sem imóvel de entrada" texto="Escolha um para o CRM cruzar com o acervo." />}
            </Cartao>
            <Cartao bloco tour="ficha-selecao" className="lg:col-span-7">
              <TituloBloco
                icone={Sparkle}
                titulo="Do acervo, combina com ele"
                sub={`Afinidade de 0 a 100, aparece a partir de ${config.cruzamento.minimo}`}
              />
              <ul className="mt-5 flex flex-col gap-2">
                {combinam.slice(0, 6).map(({ i, a }) => {
                  const texto = lead.offMarket
                    ? `${primeiroNome(lead.nome)}, separei uma casa que combina com o que você me contou. Ela não está anunciada: te mando por um link reservado, só para você. Posso mandar?`
                    : `${primeiroNome(lead.nome)}, essa casa combina com o que você me contou: ${i.titulo}, ${precoPrincipal(i)}\n${i.url_site ?? ""}`;
                  return (
                    <li key={i.codigo} className="flex items-center gap-3 rounded-[20px] p-2 hover:bg-[#f2f6f9]">
                      <FotoImovel imovel={i} className="size-16 shrink-0 rounded-2xl" />
                      <Link href={`/app/imoveis/${i.codigo}`} className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#0a2d40]">{i.titulo}</p>
                        <p className="truncate text-[13px] text-[#5b7284]">
                          {precoPrincipal(i)} · {a.motivos.slice(0, 2).join(", ")}
                        </p>
                      </Link>
                      <div className="shrink-0 text-right">
                        <p className="text-[26px] font-light leading-none tracking-[-0.04em] text-[#12455f]">{a.pontos}</p>
                        <p className="text-[11px] text-[#5b7284]">afinidade</p>
                      </div>
                      {wa && (
                        <a
                          href={`${wa}?text=${encodeURIComponent(texto)}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Enviar ao lead"
                          aria-label={`Enviar ${i.codigo} ao lead`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white hover:brightness-105"
                        >
                          <WhatsappLogo weight="fill" className="size-5" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              {combinam.length === 0 && <Vazio ilustracao={<IlustraCasa />} titulo={`Nada no acervo acima de ${config.cruzamento.minimo}`} texto="Quando entrar um imóvel parecido com o que ele procura, ele aparece aqui." />}
              {aberto && (
                <MontarSelecao
                  leadId={lead.id}
                  nome={lead.nome}
                  telefone={lead.telefone}
                  inegociavel={lead.campos.inegociavel ?? null}
                  itens={combinam.slice(0, 6).map(({ i }) => ({
                    codigo: i.codigo,
                    titulo: i.titulo,
                    bairro: i.bairro,
                    preco: precoPrincipal(i),
                    url: i.url_site,
                    offMarket: i.off_market || lead.offMarket === "comprador",
                  }))}
                />
              )}
            </Cartao>
          </div>
        )}

        {aba === "historico" && (
          <Cartao bloco>
            <TituloBloco icone={ClockCounterClockwise} titulo="Histórico" sub="Tudo o que aconteceu com este negócio, do mais novo ao mais antigo" />
            <ol className="mt-6 flex flex-col">
              {historico.map((h, i) => {
                const [I, tom] = ICONE_HISTORICO[h.tipo] ?? ICONE_HISTORICO.atividade!;
                return (
                  <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < historico.length - 1 && <span className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-[#e1eaf0]" aria-hidden />}
                    <IconeRedondo icone={I} tom={tom} />
                    <div className="min-w-0 pt-1">
                      <p className="text-[14px] text-[#0a2d40]">{h.texto}</p>
                      <p className="mt-0.5 text-[12px] text-[#5b7284]">{hora(h.em)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Cartao>
        )}
      </CorpoOpa>
    </>
  );
}

/**
 * Diagnóstico: os 4 campos que travam a etapa "Diagnóstico feito", cada um com
 * ícone. O que falta abre um campo para preencher à mão (se a IA ainda não
 * anotou). Na aba Campos, todos os campos do perfil ficam editáveis.
 */
function Diagnostico({
  leadId,
  campos,
  feitos,
  pendentes,
  outros,
  editavel = false,
}: {
  leadId: string;
  campos: Partial<Record<keyof typeof CAMPOS, string>>;
  feitos: number;
  pendentes: string[];
  outros: Array<keyof typeof CAMPOS>;
  editavel?: boolean;
}) {
  return (
    <Cartao bloco={editavel}>
      <TituloBloco
        icone={Target}
        tom={feitos === 4 ? "ok" : "claro"}
        titulo="Diagnóstico"
        sub={feitos === 4 ? "Completo: libera a seleção de imóveis" : `${feitos} de 4 · sem os 4, a etapa não avança`}
      />
      {editavel ? (
        <div className="mt-5 flex flex-col gap-3">
          {(Object.keys(CAMPOS) as Array<keyof typeof CAMPOS>).map((k) => {
            const I = ICONE_CAMPO[k] ?? Tag;
            return (
              <FormComRetorno key={k} action={editarCampo} sucesso={`Salvo: ${CAMPOS[k].rotulo}.`} className="flex items-center gap-2.5">
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="campo" value={k} />
                <input type="hidden" name="antes" value={campos[k] ?? ""} />
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    campos[k] ? "bg-[#e7f0f5] text-[#12455f]" : "bg-[#f2f6f9] text-[#5b7284]",
                  )}
                  title={CAMPOS[k].rotulo}
                >
                  <I className="size-5" />
                </span>
                <label className="min-w-0 flex-1" htmlFor={`d-${k}`}>
                  <span className="text-[12px] text-[#5b7284]">
                    {CAMPOS[k].rotulo}
                    {CAMPOS[k].obrigatorioDiagnostico && <span className="text-[#a4410e]"> *</span>}
                  </span>
                  <input
                    id={`d-${k}`}
                    name="valor"
                    defaultValue={campos[k] ?? ""}
                    placeholder="Falta saber"
                    className="mt-0.5 h-10 w-full rounded-[12px] border border-transparent bg-[#f2f6f9] px-3 text-[14px] text-[#0a2d40] outline-none focus:border-[#8fc4dd] focus:bg-white"
                  />
                </label>
                <BotaoEnvio
                  title="Salvar"
                  aria-label={`Salvar ${CAMPOS[k].rotulo}`}
                  className="mt-4 flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#0a2d40] hover:text-white"
                >
                  <Check className="size-4" weight="bold" />
                </BotaoEnvio>
              </FormComRetorno>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {CAMPOS_DIAGNOSTICO.map((k) => {
              const I = ICONE_CAMPO[k] ?? Tag;
              const valor = campos[k];
              const anotado = pendentes.includes(k);
              return (
                <div
                  key={k}
                  className={cn(
                    "flex min-w-0 flex-col gap-2 rounded-[20px] p-3.5",
                    valor ? "bg-[#e7f0f5]" : "border border-dashed border-[#c8d8e2] bg-white",
                  )}
                >
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#5b7284]">
                    <I className={cn("size-4", valor ? "text-[#12455f]" : "text-[#5b7284]")} />
                    {CAMPOS[k].rotulo}
                    {valor && <SealCheck weight="fill" className="ml-auto size-4 shrink-0 text-[#2a7ca8]" />}
                  </p>
                  {valor ? (
                    <p className="text-[14px] font-semibold leading-snug text-[#0a2d40]">{valor}</p>
                  ) : anotado ? (
                    <p className="flex items-center gap-1 text-[12px] text-[#2a7ca8]">
                      <Sparkle className="size-3.5" weight="fill" /> A IA anotou: confirme no copiloto
                    </p>
                  ) : (
                    <FormComRetorno action={editarCampo} sucesso={`Salvo: ${CAMPOS[k].rotulo}.`} className="flex items-center gap-1.5">
                      <input type="hidden" name="leadId" value={leadId} />
                      <input type="hidden" name="campo" value={k} />
                      <input
                        name="valor"
                        required
                        placeholder="Falta saber"
                        aria-label={CAMPOS[k].rotulo}
                        className="h-9 min-w-0 flex-1 rounded-[10px] bg-[#f2f6f9] px-2.5 text-[13px] outline-none focus:bg-white focus:ring-1 focus:ring-[#8fc4dd]"
                      />
                      <BotaoEnvio
                        title="Salvar"
                        aria-label={`Salvar ${CAMPOS[k].rotulo}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-white"
                      >
                        <Check className="size-4" weight="bold" />
                      </BotaoEnvio>
                    </FormComRetorno>
                  )}
                </div>
              );
            })}
          </div>
          {outros.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {outros.map((k) => (
                <Chip key={k} icone={ICONE_CAMPO[k]} tom="neutro">
                  {campos[k]}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}
