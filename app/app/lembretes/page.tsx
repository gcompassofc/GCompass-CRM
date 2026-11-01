import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { agruparAgenda, diaFalado, horaSP, quandoSimples, textoSimples } from "@/lib/opa/agenda";
import { carregarConfig, type RegraLembrete } from "@/lib/opa/config";
import { carregarEquipe, carregarLeads, tempoCurto } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRight,
  Bell,
  BellSlash,
  CalendarBlank,
  CaretDown,
  ChatText,
  CheckCircle,
  Info,
  Megaphone,
  Microphone,
  PencilSimple,
  Plus,
  Target,
  Trash,
  UserCircle,
  Users,
  WhatsappLogo,
  XCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { IlustraAgenda, IlustraSino } from "../_opa/ilustracoes";
import { AbasPilula, Avatar, Cartao, Chip, IconeRedondo, TituloBloco, Vazio, iniciaisDe, type Icone } from "../_opa/ui";
import { alternarRegra, cancelarAgendada, editarRegra, excluirRegra, novaRegra, religarLembretes } from "./actions";
import { AgendarMensagem } from "./_componentes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

type Aba = "agenda" | "avisos" | "desligados";
type Trilha = "pago" | "organico" | "captacao";

const ABAS: Array<[Aba, string, Icone]> = [
  ["agenda", "Minha agenda", CalendarBlank],
  ["avisos", "Avisos", Bell],
  ["desligados", "Sem aviso", BellSlash],
];

const TRILHAS: Array<[Trilha, string, Icone]> = [
  ["pago", "Lead de anúncio", Megaphone],
  ["organico", "Lead sem anúncio", ChatText],
  ["captacao", "Captação", Target],
];

/** Instante de sete dias atrás, em ISO. */
function haSeteDias(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

/** Endereços antigos (?aba=pago, ?aba=agendadas) continuam valendo. */
function lerAba(aba: string | undefined, trilha: string | undefined): { aba: Aba; trilha: Trilha } {
  const t: Trilha = TRILHAS.some(([k]) => k === trilha) ? (trilha as Trilha) : "pago";
  if (aba === "agendadas" || !aba) return { aba: "agenda", trilha: t };
  if (aba === "pago" || aba === "organico" || aba === "captacao") return { aba: "avisos", trilha: aba };
  return { aba: ABAS.some(([k]) => k === aba) ? (aba as Aba) : "agenda", trilha: t };
}

type Agendada = {
  id: string;
  lead_id: string | null;
  para_user_id: string | null;
  quando: string;
  mensagem: string;
  origem: string;
  status: string;
  crm_leads: { title: string } | null;
};

export default async function LembretesPage({ searchParams }: { searchParams: Promise<{ aba?: string; trilha?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const params = await searchParams;
  const { aba, trilha: trilhaAtual } = lerAba(params.aba, params.trilha);
  const gestor = org.role === "manager" || org.role === "admin";
  const supabase = await createClient();

  const [config, leads, equipe, { data: agendadasRaw }, { data: desligadosRaw }] = await Promise.all([
    carregarConfig(supabase, org.orgId),
    carregarLeads(org.orgId),
    carregarEquipe(org.orgId),
    supabase
      .from("lembretes_agendados")
      .select("id, lead_id, para_user_id, quando, mensagem, origem, status, crm_leads(title)")
      .eq("organization_id", org.orgId)
      .neq("status", "cancelado")
      // Os que esperam, de qualquer data, e os enviados ou com falha da última semana.
      .or(`status.eq.pendente,status.eq.enviando,quando.gte.${haSeteDias()}`)
      .order("quando", { ascending: true })
      .limit(100),
    supabase
      .from("crm_leads")
      .select("id, owner_user_id, tags, custom_fields, contacts(name)")
      .eq("organization_id", org.orgId)
      .eq("status", "open")
      .eq("custom_fields->>lembretes_desligados", "true"),
  ]);

  const agendadas = (agendadasRaw ?? []) as unknown as Agendada[];
  const desligados = (desligadosRaw ?? []) as unknown as Array<{
    id: string;
    owner_user_id: string | null;
    tags: string[] | null;
    custom_fields: { lembretes_desligados_em?: string } | null;
    contacts: { name: string | null } | null;
  }>;

  const agora = new Date().getTime();
  const agenda = agruparAgenda(agendadas, agora);
  // Pago e orgânico mostram a trilha e, embaixo, o guia de contato que vale para os dois.
  const trilha = config.lembretes.filter((r) => r.trilha === trilhaAtual);
  const cadencia = trilhaAtual === "captacao" ? [] : config.lembretes.filter((r) => r.trilha === "cadencia");
  const nome = (id: string | null) => (id ? (equipe.get(id)?.nome ?? "Corretor") : "Corretor");
  const esperando = agenda.hoje.length + agenda.proximos.length;
  const prazo = trilhaAtual === "organico" ? config.prazos.organico_min : config.prazos.pago_min;

  return (
    <>
      <CabecalhoOpa
        secao="Seu dia"
        titulo="Agenda"
        subtitulo="Seus retornos marcados. Na hora certa, o CRM te avisa no WhatsApp."
        icone={CalendarBlank}
        ferramentas={false}
        equipe={false}
      >
        <AgendarMensagem leads={leads.map((l) => ({ id: l.id, nome: l.nome })).sort((a, b) => a.nome.localeCompare(b.nome))} />
      </CabecalhoOpa>
      <CorpoOpa>
        <div data-tour="agenda-abas" className="flex flex-wrap items-center gap-3">
          <AbasPilula
            itens={ABAS.map(([k, r, I]) => ({
              href: k === "agenda" ? "/app/lembretes" : `/app/lembretes?aba=${k}`,
              rotulo: r,
              icone: I,
              ativo: aba === k,
              contagem: k === "agenda" ? esperando : k === "desligados" ? desligados.length : null,
            }))}
          />
        </div>

        {aba === "agenda" && (
          <Cartao bloco tour="agenda-agendadas" className="mx-auto w-full max-w-[920px]">
            {esperando === 0 ? (
              <Vazio
                ilustracao={<IlustraAgenda />}
                titulo="Nada marcado por enquanto"
                texto="Toque em Agendar lembrete para não esquecer de um retorno. Dá para agendar também pela ficha do cliente."
              />
            ) : (
              <div className="flex flex-col gap-7">
                <GrupoAgenda titulo="Hoje" vazio="Nada para hoje." itens={agenda.hoje} agora={agora} nome={nome} />
                <GrupoAgenda titulo="Próximos dias" vazio="Nada marcado para os próximos dias." itens={agenda.proximos} agora={agora} nome={nome} />
              </div>
            )}

            {agenda.saiu.length > 0 && (
              <details className="group mt-6 border-t border-[#eef3f6] pt-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-[#2a7ca8] [&::-webkit-details-marker]:hidden">
                  Ver o que já saiu nos últimos 7 dias ({agenda.saiu.length})
                  <CaretDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {agenda.saiu.map((a) => (
                    <LinhaAgenda key={a.id} a={a} agora={agora} nome={nome} />
                  ))}
                </ul>
              </details>
            )}

            <p className="mt-6 flex items-start gap-2 text-[13px] leading-snug text-[#5b7284]">
              <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" />O CRM nunca escreve para o cliente sozinho. Na hora marcada, você recebe a mensagem pronta e manda
              do seu WhatsApp.
            </p>
          </Cartao>
        )}

        {aba === "avisos" && (
          <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
            <p className="text-[15px] leading-relaxed text-[#34566b]">
              O CRM avisa você sozinho nestes casos, pelo número <b className="font-semibold text-[#0a2d40]">OPA Lembretes</b>. Escolha o tipo de lead para ver quando cada aviso chega.
            </p>

            <AbasPilula
              itens={TRILHAS.map(([k, r, I]) => ({
                href: `/app/lembretes?aba=avisos&trilha=${k}`,
                rotulo: r,
                icone: I,
                ativo: trilhaAtual === k,
              }))}
            />

            {trilha.length > 0 && (
              <Cartao bloco tour="agenda-trilha">
                <TituloBloco
                  icone={trilhaAtual === "captacao" ? Target : trilhaAtual === "organico" ? ChatText : Megaphone}
                  titulo={trilhaAtual === "captacao" ? "Captação pelo OPA Radar" : trilhaAtual === "organico" ? "Lead que chegou sem anúncio" : "Lead que veio de anúncio"}
                  sub={
                    trilhaAtual === "captacao"
                      ? `${config.captacao.por_semana} imóveis por semana, resposta em ${config.captacao.devolutiva_dias} dias. Começa quando o OPA Radar for ligado`
                      : `Você tem ${tempoCurto(prazo)} para a primeira resposta. Depois dela, o lead fica com você`
                  }
                />
                <ul className="mt-5 flex flex-col gap-2">
                  {trilha.map((r) => (
                    <LinhaRegra key={r.id} regra={r} gestor={gestor} />
                  ))}
                </ul>
                {trilhaAtual === "captacao" && gestor && (
                  <p className="mt-4 flex items-center gap-2 text-[13px] text-[#5b7284]">
                    <Info className="size-4 shrink-0 text-[#2a7ca8]" /> Prazos ajustáveis em{" "}
                    <Link href="/app/configuracoes" className="font-semibold text-[#2a7ca8]">
                      Configurações, Roleta
                    </Link>
                    .
                  </p>
                )}
              </Cartao>
            )}

            {cadencia.length > 0 && (
              <details className="group rounded-[32px] bg-white px-7 py-5 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <IconeRedondo icone={CalendarBlank} tom="claro" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold tracking-[-0.02em] text-[#0a2d40]">Guia de contato</span>
                    <span className="block text-[13px] text-[#5b7284]">Quando falar com o cliente, do primeiro contato em diante. Sugestão, sem aviso automático</span>
                  </span>
                  <CaretDown className="size-4 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="mt-5 flex flex-col gap-2 pb-2">
                  {cadencia.map((r) => (
                    <LinhaRegra key={r.id} regra={r} gestor={gestor} />
                  ))}
                </ul>
              </details>
            )}

            {gestor && (
              <Cartao bloco tour="agenda-nova-regra">
                <div id="nova-regra" className="scroll-mt-6" />
                <TituloBloco
                  icone={Plus}
                  titulo="Criar um aviso"
                  sub={`Entra em ${trilhaAtual === "captacao" ? "Captação" : trilhaAtual === "organico" ? "Lead sem anúncio" : "Lead de anúncio"}. Só gestor e administrador veem isto`}
                />
                <form action={novaRegra} className="mt-5 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="trilha" value={trilhaAtual} />
                  <CampoTexto nome="etapa" rotulo="Em que etapa" dica="Ex.: Visita realizada" obrigatorio />
                  <CampoTexto nome="quando" rotulo="Quando avisar" dica="Ex.: 1 dia depois, 9h" />
                  <CampoTexto nome="oQue" rotulo="O que o aviso diz" dica="Ex.: Pergunte o que o cliente achou da visita" obrigatorio largo />
                  <CampoTexto nome="para" rotulo="Quem recebe" dica="Corretor, ou Corretor e gestor" />
                  <div className="flex items-end">
                    <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]">
                      <Plus className="size-4" weight="bold" /> Criar aviso
                    </button>
                  </div>
                </form>
              </Cartao>
            )}

            <details className="group rounded-[32px] bg-white px-7 py-5 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <IconeRedondo icone={WhatsappLogo} tom="claro" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold tracking-[-0.02em] text-[#0a2d40]">Ver como o aviso chega no celular</span>
                  <span className="block text-[13px] text-[#5b7284]">Um exemplo da conversa com o OPA Lembretes</span>
                </span>
                <CaretDown className="size-4 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mx-auto mt-5 max-w-[380px] pb-2">
                <Celular captacao={trilhaAtual === "captacao"} />
              </div>
            </details>
          </div>
        )}

        {aba === "desligados" && (
          <Cartao bloco className="mx-auto w-full max-w-[920px]">
            <TituloBloco icone={BellSlash} titulo="Clientes sem aviso" sub="O CRM não manda aviso sobre estes clientes. Religue quando quiser" />
            {desligados.length === 0 ? (
              <Vazio ilustracao={<IlustraSino />} titulo="Todos os avisos ligados" texto="Para parar os avisos de um cliente, use a ficha dele." />
            ) : (
              <ul className="mt-5 flex flex-col gap-2">
                {desligados.map((l) => {
                  const dono = equipe.get(l.owner_user_id ?? "");
                  const quando = l.custom_fields?.lembretes_desligados_em;
                  return (
                    <li key={l.id} className="flex items-center gap-3 rounded-[22px] bg-[#f2f6f9] p-3.5">
                      <Avatar texto={iniciaisDe(l.contacts?.name ?? "?")} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/app/leads/${l.id}`} className="text-[15px] font-semibold text-[#0a2d40] hover:text-[#2a7ca8]">
                          {l.contacts?.name ?? "Cliente"}
                        </Link>
                        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-[#5b7284]">
                          <span className="inline-flex items-center gap-1">
                            <UserCircle className="size-3.5" /> {dono?.nome ?? "sem corretor"}
                          </span>
                          {(l.tags ?? []).includes("proprio") && <span>· lead próprio</span>}
                          {quando ? <span>· desde {new Date(quando).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span> : null}
                        </p>
                      </div>
                      <form action={religarLembretes}>
                        <input type="hidden" name="leadId" value={l.id} />
                        <button type="submit" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]">
                          <Bell className="size-4" /> Religar
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        )}
      </CorpoOpa>
    </>
  );
}

/** Quantos retornos por grupo aparecem sem clicar: o resto fica em "Ver mais". */
const VISIVEIS = 8;

function GrupoAgenda({
  titulo,
  vazio,
  itens,
  agora,
  nome,
}: {
  titulo: string;
  vazio: string;
  itens: Agendada[];
  agora: number;
  nome: (id: string | null) => string;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2d40]">
        {titulo}
        <span className="rounded-full bg-[#eef3f6] px-2 text-[12px] font-medium tabular-nums text-[#5b7284]">{itens.length}</span>
      </h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-[14px] text-[#5b7284]">{vazio}</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {itens.slice(0, VISIVEIS).map((a) => (
              <LinhaAgenda key={a.id} a={a} agora={agora} nome={nome} />
            ))}
          </ul>
          {itens.length > VISIVEIS && (
            <details className="group mt-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-[#2a7ca8] [&::-webkit-details-marker]:hidden">
                Ver mais {itens.length - VISIVEIS}
                <CaretDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {itens.slice(VISIVEIS).map((a) => (
                  <LinhaAgenda key={a.id} a={a} agora={agora} nome={nome} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Um retorno marcado: a hora grande à esquerda, quem e o quê no meio, as ações à direita. */
function LinhaAgenda({ a, agora, nome }: { a: Agendada; agora: number; nome: (id: string | null) => string }) {
  const cliente = a.crm_leads?.title.split(" · ")[0] ?? null;
  const paraCliente = a.origem !== "para_corretor";
  const passou = Date.parse(a.quando) <= agora;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[22px] bg-[#f2f6f9] p-3.5 sm:flex-nowrap">
      <div className="flex w-[72px] shrink-0 flex-col items-center rounded-[16px] bg-white px-2 py-2 text-center">
        <span className="text-[17px] font-semibold tabular-nums leading-none text-[#0a2d40]">{horaSP(a.quando)}</span>
        <span className="mt-1 text-[11px] font-medium text-[#5b7284]">{diaFalado(a.quando, agora)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-[#0a2d40]">
          {cliente ?? (paraCliente ? "Cliente" : "Lembrete para você")}
          {paraCliente ? (
            <Chip icone={WhatsappLogo} tom="claro">
              mensagem para o cliente
            </Chip>
          ) : (
            <Chip icone={Bell} tom="neutro">
              lembrete para {nome(a.para_user_id).split(" ")[0]}
            </Chip>
          )}
          {a.status === "enviado" ? (
            <Chip icone={CheckCircle} tom="ok">
              avisado
            </Chip>
          ) : a.status === "falhou" ? (
            <Chip icone={XCircle} tom="alerta">
              não saiu
            </Chip>
          ) : a.status === "enviando" || passou ? (
            <Chip tom="aviso">saindo agora</Chip>
          ) : null}
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#34566b]">{a.mensagem}</p>
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        {a.lead_id && (
          <Link
            href={`/app/leads/${a.lead_id}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
          >
            Abrir cliente <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        {a.status === "pendente" && (
          <form action={cancelarAgendada}>
            <input type="hidden" name="id" value={a.id} />
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#a4410e] hover:bg-[#fdeee3]"
            >
              <XCircle className="size-4" aria-hidden /> Cancelar
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

function CampoTexto({
  nome,
  rotulo,
  dica,
  obrigatorio,
  largo,
  valor,
}: {
  nome: string;
  rotulo: string;
  dica?: string;
  obrigatorio?: boolean;
  largo?: boolean;
  valor?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]", largo && "md:col-span-2")}>
      {rotulo}
      <input
        name={nome}
        required={obrigatorio}
        placeholder={dica}
        defaultValue={valor}
        className="h-11 rounded-[16px] bg-[#f2f6f9] px-4 text-[14px] font-normal text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
      />
    </label>
  );
}

function LinhaRegra({ regra: r, gestor }: { regra: RegraLembrete; gestor: boolean }) {
  const paraGestao = /gestor|gerente|marco|june|captador/i.test(r.para);
  return (
    <li className={cn("flex items-start gap-3 rounded-[22px] bg-[#f2f6f9] p-4", !r.ativa && "opacity-55")}>
      <IconeRedondo icone={paraGestao ? Users : Bell} tom="claro" className="bg-white" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[15px] font-semibold text-[#0a2d40]">{r.etapa}</p>
          <Chip tom="claro">{quandoSimples(r.quando)}</Chip>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-[#34566b]">{textoSimples(r.oQue)}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#5b7284]">
          <UserCircle className="size-3.5" /> Quem recebe: {r.para}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {gestor ? (
          <form action={alternarRegra}>
            <input type="hidden" name="id" value={r.id} />
            <Interruptor ligado={r.ativa} rotulo={r.ativa ? "Desligar aviso" : "Ligar aviso"} />
          </form>
        ) : (
          <Chip tom={r.ativa ? "ok" : "neutro"}>{r.ativa ? "ligado" : "desligado"}</Chip>
        )}
        {gestor && (
          <details className="relative">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-white text-[#12455f] hover:bg-[#e7f0f5]"
              aria-label="Editar aviso"
              title="Editar aviso"
            >
              <PencilSimple className="size-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[340px] rounded-[24px] bg-white p-4 shadow-[0_18px_44px_rgba(9,44,62,0.18)]">
              <form action={editarRegra} className="flex flex-col gap-2.5">
                <input type="hidden" name="id" value={r.id} />
                <CampoTexto nome="etapa" rotulo="Etapa" valor={r.etapa} />
                <CampoTexto nome="quando" rotulo="Quando" valor={r.quando} />
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                  O que o corretor recebe
                  <textarea
                    name="oQue"
                    defaultValue={r.oQue}
                    rows={3}
                    className="rounded-[16px] bg-[#f2f6f9] px-4 py-2.5 text-[14px] font-normal text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                  />
                </label>
                <CampoTexto nome="para" rotulo="Para" valor={r.para} />
                <div className="flex items-center justify-between pt-1">
                  <button type="submit" className="h-10 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]">
                    Salvar
                  </button>
                  <button type="submit" formAction={excluirRegra} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#a4410e] hover:underline">
                    <Trash className="size-4" /> Excluir
                  </button>
                </div>
              </form>
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

function Interruptor({ ligado, rotulo, desabilitado }: { ligado: boolean; rotulo: string; desabilitado?: boolean }) {
  return (
    <button
      type={desabilitado ? "button" : "submit"}
      disabled={desabilitado}
      aria-pressed={ligado}
      aria-label={rotulo}
      title={rotulo}
      className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", ligado ? "bg-[#2a7ca8]" : "bg-[#c6d3db]", desabilitado && "cursor-default")}
    >
      <span className={cn("absolute size-[22px] rounded-full bg-white shadow transition-transform", ligado ? "translate-x-[23px]" : "translate-x-[3px]")} />
    </button>
  );
}

/** Celular de exemplo, o único cartão escuro da tela: como o aviso do OPA Lembretes chega ao corretor. */
function Celular({ captacao }: { captacao: boolean }) {
  const deles = "max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-[#0a2d40] shadow-xs";
  const meu = "max-w-[80%] self-end rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[13px] text-[#0a2d40] shadow-xs";
  const hora = (h: string) => <span className="mt-1 block text-right text-[10px] text-[#5b7284]">{h}</span>;
  const opcoes = (ops: string[]) => (
    <div className="mt-2 flex flex-col divide-y divide-[#e3edf2] border-t border-[#e3edf2] text-center text-[12.5px] font-medium text-[#2a7ca8]">
      {ops.map((o, i) => (
        <span key={o} className="py-1.5">
          {i + 1}. {o}
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[24px] bg-[#efe9e1]">
        <div className="flex items-center gap-2.5 bg-[#075e54] px-4 py-3 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#12455f]">OPA</span>
          <div>
            <p className="text-sm font-semibold">OPA Lembretes</p>
            <p className="text-[11px] text-white/75">conta comercial da OPA</p>
          </div>
        </div>
        <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto px-3 py-4">
          {captacao ? (
            <>
              <div className={deles}>
                Rodrigo, 2 imóveis do Radar para você captar nesta semana:
                <br />
                <br />
                <b>1.</b> Apartamento no Veloso · R$ 1,2 mi anunciado · anúncio de outra imobiliária há 33 dias. 2 compradores da OPA combinam.
                <br />
                <br />
                <b>2.</b> Casa no Reino · R$ 650 mil · veio do Paulo Martin, que não achou o dono.
                <br />
                <br />
                Devolutiva até segunda, 02/11.
                {opcoes(["Vou atrás", "Já conheço o dono", "Não consigo"])}
                {hora("09:00")}
              </div>
              <div className={meu}>2{hora("09:14")}</div>
              <div className={deles}>De qual imóvel? Responda 1 ou 2.{hora("09:14")}</div>
              <div className={meu}>1{hora("09:15")}</div>
              <div className={deles}>Boa. Manda o nome e o celular do proprietário do apartamento no Veloso.{hora("09:15")}</div>
              <div className={meu}>Seu Alberto, (11) 9••••-2287{hora("09:16")}</div>
              <div className={deles}>
                Cadastrado. Card em <b>Contato / candidatura</b>. Para ficar com a captação, cadastre no Painel OPA com fotos até 10/11. Quem cadastra primeiro é o
                dono.{hora("09:16")}
              </div>
            </>
          ) : (
            <>
              <div className={deles}>
                Luana, lead novo para você. <b>Helena Prado</b>, Casa no Curral (OPA-0412). Veio do anúncio às 14:02.
                <br />
                <br />
                Ligue até 15:02. Depois disso ele passa para o próximo da fila.
                <br />
                wa.me/5511•••4410
                {opcoes(["Já liguei", "Não atendeu", "É lead meu, parar avisos"])}
                {hora("14:22")}
              </div>
              <div className={meu}>1{hora("14:31")}</div>
              <div className={deles}>
                Boa. Ela quer:
                <br />1 Morar
                <br />2 Vir nas temporadas
                <br />3 Investir em locação
                {hora("14:31")}
              </div>
              <div className={meu}>2{hora("14:32")}</div>
              <div className={deles}>
                Anotado. Movi para <b>Primeiro contato</b>. Qual o inegociável dela? Pode mandar áudio.{hora("14:32")}
              </div>
              <div className={cn(meu, "flex items-center gap-1.5")}>
                <Microphone className="size-4" weight="fill" /> 0:18{hora("14:33")}
              </div>
              <div className={deles}>
                Entendi: &quot;área para o cachorro e perto da praia&quot;. Amanhã às 9h te lembro do D1.{hora("14:33")}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="flex items-start gap-2 text-[12px] leading-snug text-[#5b7284]">
        <Info className="mt-0.5 size-3.5 shrink-0 text-[#2a7ca8]" /> Exemplo. Hoje o aviso chega com o link da ficha e o do WhatsApp do cliente; responder pelo número ainda não move o card.
      </p>
    </div>
  );
}
