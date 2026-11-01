import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig, type RegraLembrete } from "@/lib/opa/config";
import { carregarEquipe, carregarLeads, tempoCurto } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";
import {
  Bell,
  BellSlash,
  CalendarBlank,
  ChatText,
  CheckCircle,
  Clock,
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
export const metadata = { title: "Lembretes e cadência" };

type Aba = "pago" | "organico" | "captacao" | "agendadas" | "desligados";

const ABAS: Array<[Aba, string, Icone]> = [
  ["pago", "Tráfego pago", Megaphone],
  ["organico", "Orgânico", ChatText],
  ["captacao", "Captação", Target],
  ["agendadas", "Agendadas", CalendarBlank],
  ["desligados", "Desligados", BellSlash],
];

/** Instante de sete dias atrás, em ISO. */
function haSeteDias(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

function quandoCurto(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

export default async function LembretesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { aba: abaParam } = await searchParams;
  const aba: Aba = ABAS.some(([k]) => k === abaParam) ? (abaParam as Aba) : "pago";
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
      .or(`status.eq.pendente,quando.gte.${haSeteDias()}`)
      .order("quando", { ascending: true })
      .limit(100),
    supabase
      .from("crm_leads")
      .select("id, owner_user_id, tags, custom_fields, contacts(name)")
      .eq("organization_id", org.orgId)
      .eq("status", "open")
      .eq("custom_fields->>lembretes_desligados", "true"),
  ]);

  const agendadas = (agendadasRaw ?? []) as unknown as Array<{
    id: string;
    lead_id: string | null;
    para_user_id: string | null;
    quando: string;
    mensagem: string;
    origem: string;
    status: string;
    crm_leads: { title: string } | null;
  }>;
  const desligados = (desligadosRaw ?? []) as unknown as Array<{
    id: string;
    owner_user_id: string | null;
    tags: string[] | null;
    custom_fields: { lembretes_desligados_em?: string } | null;
    contacts: { name: string | null } | null;
  }>;

  // Pago e orgânico mostram a trilha e, embaixo, a cadência que vale para os dois.
  const trilha = aba === "pago" || aba === "organico" ? config.lembretes.filter((r) => r.trilha === aba) : aba === "captacao" ? config.lembretes.filter((r) => r.trilha === "captacao") : [];
  const cadencia = aba === "pago" || aba === "organico" ? config.lembretes.filter((r) => r.trilha === "cadencia") : [];
  const nome = (id: string | null) => (id ? (equipe.get(id)?.nome ?? "Corretor") : "Corretor");
  const pendentes = agendadas.filter((a) => a.status === "pendente").length;
  const ehRegras = aba === "pago" || aba === "organico" || aba === "captacao";

  return (
    <>
      <CabecalhoOpa secao="Operação" titulo="Lembretes e cadência" subtitulo="O que o CRM vai te lembrar, e quando" icone={Bell}>
        <AgendarMensagem leads={leads.map((l) => ({ id: l.id, nome: l.nome })).sort((a, b) => a.nome.localeCompare(b.nome))} />
      </CabecalhoOpa>
      <CorpoOpa>
        <p className="flex items-center gap-2 text-[14px] text-[#5b7284]">
          <Info className="size-4 shrink-0 text-[#2a7ca8]" />
          O OPA Lembretes avisa o corretor no WhatsApp dele: lembretes agendados, prazo de resposta (avisos e passagem para o próximo da fila) e negócio
          parado. O resto da cadência é o guia do dia a dia, ainda sem aviso automático.
        </p>

        <div data-tour="agenda-abas" className="flex flex-wrap items-center gap-3">
          <AbasPilula
            itens={ABAS.map(([k, r, I]) => ({
              href: k === "pago" ? "/app/lembretes" : `/app/lembretes?aba=${k}`,
              rotulo: r,
              icone: I,
              ativo: aba === k,
              contagem: k === "agendadas" ? pendentes : k === "desligados" ? desligados.length : null,
            }))}
          />
          {gestor && ehRegras && (
            <a
              href="#nova-regra"
              className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
            >
              <Plus className="size-4" weight="bold" /> Nova regra
            </a>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px] [&>*]:min-w-0">
          <div className="flex flex-col gap-5">
            {trilha.length > 0 && (
              <Cartao bloco tour="agenda-trilha">
                <TituloBloco
                  icone={aba === "captacao" ? Target : aba === "organico" ? ChatText : Megaphone}
                  titulo={aba === "captacao" ? "Captação pelo OPA Radar" : aba === "organico" ? "Lead orgânico" : "Lead do tráfego pago"}
                  sub={
                    aba === "captacao"
                      ? `${config.captacao.por_semana} imóveis por semana, devolutiva em ${config.captacao.devolutiva_dias} dias. Os avisos começam quando o OPA Radar for ligado`
                      : aba === "organico"
                        ? `Prazo de ${tempoCurto(config.prazos.organico_min)} para o primeiro atendimento. Depois da primeira resposta, o lead fica com o corretor`
                        : `Prazo de ${tempoCurto(config.prazos.pago_min)} para o primeiro atendimento. Depois da primeira resposta, o lead fica com o corretor`
                  }
                />
                <ul className="mt-5 flex flex-col gap-2">
                  {trilha.map((r) => (
                    <LinhaRegra key={r.id} regra={r} gestor={gestor} />
                  ))}
                </ul>
              </Cartao>
            )}

            {cadencia.length > 0 && (
              <Cartao bloco>
                <TituloBloco icone={CalendarBlank} titulo="Cadência do atendimento" sub="Vale para pago e orgânico, do primeiro contato ao relacionamento" />
                <ul className="mt-5 flex flex-col gap-2">
                  {cadencia.map((r) => (
                    <LinhaRegra key={r.id} regra={r} gestor={gestor} />
                  ))}
                </ul>
              </Cartao>
            )}

            {aba === "captacao" && (
              <p className="flex items-center gap-2 text-[13px] text-[#5b7284]">
                <Info className="size-4 shrink-0 text-[#2a7ca8]" /> Prazos ajustáveis em{" "}
                <Link href="/app/configuracoes" className="font-semibold text-[#2a7ca8]">
                  Configurações, Roleta
                </Link>
                .
              </p>
            )}

            {gestor && ehRegras && (
              <Cartao bloco tour="agenda-nova-regra">
                <div id="nova-regra" className="scroll-mt-6" />
                <TituloBloco icone={Plus} titulo="Nova regra" sub={`Entra na trilha ${aba === "captacao" ? "de captação" : aba === "organico" ? "do orgânico" : "do tráfego pago"}`} />
                <form action={novaRegra} className="mt-5 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="trilha" value={aba === "captacao" ? "captacao" : aba === "organico" ? "organico" : "pago"} />
                  <CampoTexto nome="etapa" rotulo="Etapa" dica="Ex.: Visita realizada" obrigatorio />
                  <CampoTexto nome="quando" rotulo="Quando" dica="Ex.: D2, 9h ou 1 h sem resposta" />
                  <CampoTexto nome="oQue" rotulo="O que o corretor recebe" dica="O texto do aviso" obrigatorio largo />
                  <CampoTexto nome="para" rotulo="Para" dica="Corretor, Corretor e gestor" />
                  <div className="flex items-end">
                    <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]">
                      <Plus className="size-4" weight="bold" /> Criar regra
                    </button>
                  </div>
                </form>
              </Cartao>
            )}

            {aba === "agendadas" && (
              <Cartao bloco tour="agenda-agendadas">
                <TituloBloco icone={CalendarBlank} titulo="Mensagens agendadas" sub="Saem na hora marcada pelo OPA Lembretes" />
                {agendadas.length === 0 ? (
                  <Vazio ilustracao={<IlustraAgenda />} titulo="Nenhuma mensagem agendada" texto="Agende pelo botão no topo ou pela ficha do lead." />
                ) : (
                  <ul className="mt-5 flex flex-col gap-2">
                    {agendadas.map((a) => {
                      const lead = a.crm_leads?.title.split(" · ")[0] ?? null;
                      const paraLead = a.origem !== "para_corretor";
                      return (
                        <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-[22px] bg-[#f2f6f9] p-4">
                          <IconeRedondo icone={paraLead ? WhatsappLogo : Bell} tom={paraLead ? "acao" : "claro"} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#0a2d40]">
                              {paraLead ? (lead ?? "Lead") : nome(a.para_user_id)}
                              <span className="font-normal text-[#5b7284]">
                                {paraLead ? ` · aviso para ${nome(a.para_user_id).split(" ")[0]} com a mensagem pronta` : ` · pelo OPA Lembretes${lead ? `, sobre ${lead}` : ""}`}
                              </span>
                            </p>
                            <p className="mt-1 line-clamp-2 text-[13px] text-[#34566b]">{a.mensagem}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Chip icone={Clock} tom="claro">
                                {quandoCurto(a.quando)}
                              </Chip>
                              {a.status === "enviado" ? (
                                <Chip icone={CheckCircle} tom="ok">
                                  enviada
                                </Chip>
                              ) : a.status === "falhou" ? (
                                <Chip icone={XCircle} tom="alerta">
                                  não saiu
                                </Chip>
                              ) : a.status === "enviando" ? (
                                <Chip icone={Clock} tom="claro">
                                  enviando
                                </Chip>
                              ) : (
                                <Chip icone={CalendarBlank} tom="neutro">
                                  agendada
                                </Chip>
                              )}
                            </div>
                          </div>
                          {a.status === "pendente" && (
                            <form action={cancelarAgendada}>
                              <input type="hidden" name="id" value={a.id} />
                              <button
                                type="submit"
                                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#a4410e] hover:bg-[#fdeee3]"
                              >
                                <XCircle className="size-4" /> Cancelar
                              </button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-4 flex items-start gap-2 text-[12px] text-[#5b7284]">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-[#2a7ca8]" /> O CRM não escreve para o lead sozinho: o corretor recebe o aviso com a mensagem pronta e manda pelo WhatsApp dele.
                </p>
              </Cartao>
            )}

            {aba === "desligados" && (
              <Cartao bloco>
                <TituloBloco icone={BellSlash} titulo="Leads com lembretes desligados" sub="O corretor desliga na ficha ou respondendo “parar avisos”" />
                {desligados.length === 0 ? (
                  <Vazio ilustracao={<IlustraSino />} titulo="Todos os lembretes ligados" texto="Nenhum lead com aviso desligado." />
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
                              {l.contacts?.name ?? "Lead"}
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
                            <button type="submit" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]">
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
          </div>

          <Celular captacao={aba === "captacao"} />
        </div>
      </CorpoOpa>
    </>
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
          <Chip icone={Clock} tom="claro">
            {r.quando}
          </Chip>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-[#34566b]">{r.oQue}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#5b7284]">
          <UserCircle className="size-3.5" /> {r.para}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {gestor ? (
          <form action={alternarRegra}>
            <input type="hidden" name="id" value={r.id} />
            <Interruptor ligado={r.ativa} rotulo={r.ativa ? "Desligar regra" : "Ligar regra"} />
          </form>
        ) : (
          <Interruptor ligado={r.ativa} rotulo={r.ativa ? "Ligada" : "Desligada"} desabilitado />
        )}
        {gestor && (
          <details className="relative">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-white text-[#12455f] hover:bg-[#e7f0f5]"
              aria-label="Editar regra"
              title="Editar regra"
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
    <Cartao escuro bloco className="flex h-fit flex-col gap-5 xl:sticky xl:top-6">
      <TituloBloco icone={WhatsappLogo} claro titulo="Como chega no celular" sub="O corretor responde com o número da opção" />
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
      <p className="flex items-start gap-2 text-[12px] text-white/65">
        <Info className="mt-0.5 size-3.5 shrink-0" /> Desenho do aviso. Hoje ele chega com o link da ficha e o do WhatsApp do lead; responder pelo número ainda não move o card.
      </p>
    </Cartao>
  );
}
