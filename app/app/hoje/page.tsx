import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import {
  carregarEquipe,
  carregarImoveis,
  carregarLeads,
  carregarPrimeiraResposta,
  carregarVendas,
  COMISSAO_OPA,
  diagnosticoCompleto,
  filtrarCorretor,
  gerenteVeReceita,
  prazoDoLead,
  primeiroNome,
  ROTULO_ORIGEM,
  tempoCurto,
  type LeadOpa,
  type Pessoa,
  type Venda,
} from "@/lib/opa/dados";
import { precoCompacto, type Imovel } from "@/lib/opa/imoveis";
import { noIntervalo, resolverPeriodo, type Periodo } from "@/lib/opa/periodo";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRight,
  Buildings,
  CalendarBlank,
  ChatCircle,
  Clock,
  Coins,
  Funnel,
  Handshake,
  Sparkle,
  Sun,
  Target,
  Timer,
  UserPlus,
  UsersThree,
  WhatsappLogo,
} from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FotoImovel } from "../_opa/componentes";
import { IlustraAgenda, IlustraCalma, IlustraConversa } from "../_opa/ilustracoes";
import { FiltroPeriodo } from "../_opa/periodo";
import { Avatar, BarraHachurada, Cartao, CartaoNumero, Chip, TituloBloco, Vazio } from "../_opa/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início" };

const META_RESPOSTA = 90;

function esperando(leads: LeadOpa[]): LeadOpa[] {
  return leads
    .filter((l) => l.conversa?.esperandoMin != null)
    .sort((a, b) => (b.conversa!.esperandoMin ?? 0) - (a.conversa!.esperandoMin ?? 0));
}

const foraDoPrazo = (l: LeadOpa) => (l.conversa?.esperandoMin ?? 0) > prazoDoLead(l);
const soma = (ls: LeadOpa[]) => ls.reduce((s, l) => s + (l.valorCents ?? 0), 0);

function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; corretor?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const params = await searchParams;
  const { corretor } = params;
  const periodo = resolverPeriodo(params);
  const gestor = org.role === "manager" || org.role === "admin";

  const [leadsTodos, imoveis, equipe, vendasTodas, liberado] = await Promise.all([
    carregarLeads(org.orgId),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    gestor ? carregarVendas(org.orgId, new Date(periodo.de).toISOString(), new Date(periodo.ate).toISOString()) : Promise.resolve([] as Venda[]),
    gestor ? gerenteVeReceita(org.orgId) : Promise.resolve(false),
  ]);
  const leads = filtrarCorretor(leadsTodos, corretor);
  const vendas = filtrarCorretor(vendasTodas, corretor);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const veReceita = org.role === "admin" || (org.role === "manager" && liberado);
  const nome = primeiroNome(user.full_name) || "corretor";

  return (
    <>
      <CabecalhoOpa
        titulo={`${saudacao()}, ${nome}`}
        secao={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date())}
        subtitulo={org.role === "admin" ? "Panorama completo da OPA" : gestor ? "Operação da equipe" : "Seu dia, do que pede resposta primeiro"}
        icone={Sun}
      >
        {gestor && <FiltroPeriodo chave={periodo.chave} rotulo={periodo.rotulo} deDia={periodo.deDia} ateDia={periodo.ateDia} hoje={periodo.hoje} />}
      </CabecalhoOpa>
      <CorpoOpa>
        {gestor ? (
          <VisaoGestor leads={leads} equipe={equipe} porCodigo={porCodigo} vendas={vendas} periodo={periodo} veReceita={veReceita} orgId={org.orgId} />
        ) : (
          <VisaoCorretor leads={leads} porCodigo={porCodigo} orgId={org.orgId} />
        )}
      </CorpoOpa>
    </>
  );
}

// ---------------------------------------------------------------- peças

/** O único cartão escuro da tela: o lead que precisa de resposta primeiro. */
function Destaque({ lead, imovel, rotulo, dono }: { lead: LeadOpa; imovel?: Imovel; rotulo: string; dono?: string }) {
  return (
    <Cartao escuro bloco className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Chip icone={Clock} tom={foraDoPrazo(lead) ? "alerta" : "acao"}>
          {foraDoPrazo(lead) ? "Passou do prazo" : "No prazo"} · {tempoCurto(lead.conversa!.esperandoMin!)}
        </Chip>
        <span className="text-[13px] text-white/60">{rotulo}</span>
      </div>
      <div className="flex items-center gap-4">
        <FotoImovel imovel={imovel} className="size-20 shrink-0 rounded-[20px]" />
        <div className="min-w-0">
          <p className="truncate text-[26px] font-semibold tracking-[-0.03em]">{lead.nome}</p>
          <p className="truncate text-[14px] text-white/65">
            {imovel ? `${imovel.codigo} · ${precoCompacto(imovel.preco_venda_cents)}` : "Sem imóvel ainda"}
            {dono ? ` · com ${dono}` : ""}
          </p>
        </div>
      </div>
      {lead.conversa?.previa && <p className="line-clamp-2 text-[15px] text-white/85">“{lead.conversa.previa}”</p>}
      <Link
        href={`/app/leads/${lead.id}`}
        className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
      >
        <WhatsappLogo weight="fill" className="size-5" /> Responder agora
      </Link>
    </Cartao>
  );
}

function LinhaLead({ lead, imovel }: { lead: LeadOpa; imovel?: Imovel }) {
  const atrasado = foraDoPrazo(lead);
  return (
    <li>
      <Link href={`/app/leads/${lead.id}`} className="flex items-center gap-3 rounded-[20px] px-2 py-2.5 transition-colors hover:bg-[#f2f6f9]">
        <FotoImovel imovel={imovel} className="size-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{lead.nome}</p>
          <p className="truncate text-[13px] text-[#5b7284]">{lead.conversa?.previa}</p>
        </div>
        <Chip icone={Timer} tom={atrasado ? "alerta" : "claro"}>
          {tempoCurto(lead.conversa!.esperandoMin!)}
        </Chip>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------- corretor

async function VisaoCorretor({ leads, porCodigo, orgId }: { leads: LeadOpa[]; porCodigo: Map<string, Imovel>; orgId: string }) {
  const fila = esperando(leads);
  const comAnotacao = leads.filter((l) => l.pendentes > 0);
  const primeiro = fila[0];
  const supabase = await createClient();
  const { data: visitasRaw } = await supabase
    .from("visitas")
    .select("id, quando, imovel_codigo, lead_id")
    .eq("organization_id", orgId)
    .eq("status", "agendada")
    .gte("quando", new Date().toISOString())
    .order("quando")
    .limit(4);
  const visitas = (visitasRaw ?? []) as Array<{ id: string; quando: string; imovel_codigo: string | null; lead_id: string }>;
  const nomeDoLead = new Map(leads.map((l) => [l.id, l.nome]));

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {primeiro ? (
            <Destaque lead={primeiro} imovel={porCodigo.get(primeiro.imovelCodigo ?? "")} rotulo="Responda primeiro" />
          ) : (
            <Cartao bloco>
              <Vazio ilustracao={<IlustraCalma />} titulo="Ninguém esperando resposta" texto="Quando um lead escrever, ele aparece aqui primeiro." />
            </Cartao>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
          <CartaoNumero
            icone={ChatCircle}
            rotulo="Esperando sua resposta"
            valor={fila.length}
            alerta={fila.some(foraDoPrazo)}
            contexto={fila.some(foraDoPrazo) ? `${fila.filter(foraDoPrazo).length} passaram do prazo` : "todos dentro do prazo"}
            href="/app/fila"
            ilustracao={<IlustraConversa />}
          />
          <CartaoNumero
            icone={Sparkle}
            rotulo="Anotações da IA para confirmar"
            valor={comAnotacao.reduce((s, l) => s + l.pendentes, 0)}
            contexto={`em ${comAnotacao.length} ${comAnotacao.length === 1 ? "lead" : "leads"}`}
            href={comAnotacao[0] ? `/app/leads/${comAnotacao[0].id}` : undefined}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Cartao bloco className="lg:col-span-7">
          <TituloBloco
            icone={UsersThree}
            titulo="Quem espera resposta"
            sub="Do que espera há mais tempo para o mais recente"
            acao={
              <Link href="/app/fila" className="text-[13px] font-semibold text-[#2a7ca8]">
                Ver a fila
              </Link>
            }
          />
          <ul className="mt-4 flex flex-col">
            {fila.slice(primeiro ? 1 : 0, 6).map((l) => (
              <LinhaLead key={l.id} lead={l} imovel={porCodigo.get(l.imovelCodigo ?? "")} />
            ))}
          </ul>
          {fila.length <= 1 && <Vazio titulo="Mais ninguém esperando" texto="Bom trabalho." />}
        </Cartao>
        <Cartao bloco className="lg:col-span-5">
          <TituloBloco icone={CalendarBlank} titulo="Próximas visitas" sub="A véspera chega pelo OPA Lembretes" />
          {visitas.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {visitas.map((v) => {
                const d = new Date(v.quando);
                return (
                  <li key={v.id}>
                    <Link href={`/app/leads/${v.lead_id}?aba=visitas`} className="flex items-center gap-3 rounded-[20px] bg-[#f2f6f9] p-3 hover:bg-[#e7f0f5]">
                      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-white leading-none">
                        <span className="text-[18px] font-semibold text-[#0a2d40]">
                          {d.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" })}
                        </span>
                        <span className="text-[10px] uppercase text-[#5b7284]">
                          {d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "")}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{nomeDoLead.get(v.lead_id) ?? "Lead"}</p>
                        <p className="truncate text-[13px] text-[#5b7284]">
                          {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                          {v.imovel_codigo ? ` · ${v.imovel_codigo}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vazio ilustracao={<IlustraAgenda />} titulo="Nenhuma visita marcada" texto="Agende pela ficha do lead, em Visitas." />
          )}
        </Cartao>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- gestor

async function VisaoGestor({
  leads,
  equipe,
  porCodigo,
  vendas,
  periodo,
  veReceita,
  orgId,
}: {
  leads: LeadOpa[];
  equipe: Map<string, Pessoa>;
  porCodigo: Map<string, Imovel>;
  vendas: Venda[];
  periodo: Periodo;
  veReceita: boolean;
  orgId: string;
}) {
  const fila = esperando(leads);
  const atrasados = fila.filter(foraDoPrazo);
  const novos = leads.filter((l) => noIntervalo(l.criadoEm, periodo));
  const novosAntes = leads.filter((l) => noIntervalo(l.criadoEm, periodo.anterior)).length;
  const respostas = await carregarPrimeiraResposta(orgId, novos.map((l) => l.contatoId));
  const avaliados = novos.filter((l) => l.conversa?.id && !(respostas.get(l.contatoId) == null && !foraDoPrazo(l)));
  const noPrazo = avaliados.filter((l) => {
    const m = respostas.get(l.contatoId);
    return m != null && m <= prazoDoLead(l);
  }).length;
  const pctPrazo = avaliados.length ? Math.round((noPrazo / avaliados.length) * 100) : 0;
  const visitas = leads.filter((l) => l.etapa.slug === "visita-agendada");
  const propostas = leads.filter((l) => ["proposta", "negociacao", "fechamento"].includes(l.etapa.slug));
  const carteira = soma(leads.filter((l) => l.imovelCodigo));
  const vgvVendido = vendas.reduce((s, v) => s + v.vgvCents, 0);
  const comissao = vendas.reduce((s, v) => s + v.comissaoCents, 0);
  const pior = atrasados[0] ?? fila[0];
  const variacao = novosAntes > 0 ? Math.round(((novos.length - novosAntes) / novosAntes) * 100) : null;
  const pctDiagnostico = leads.length ? Math.round((leads.filter((l) => diagnosticoCompleto(l.campos) === 4).length / leads.length) * 100) : 0;

  const porCorretor = [...equipe.values()]
    .map((p) => {
      const meus = leads.filter((l) => l.donoId === p.id);
      return {
        pessoa: p,
        total: meus.length,
        esperando: meus.filter((l) => l.conversa?.esperandoMin != null).length,
        atrasados: meus.filter(foraDoPrazo).length,
        diagnostico: meus.length ? Math.round((meus.filter((l) => diagnosticoCompleto(l.campos) === 4).length / meus.length) * 100) : 0,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.atrasados - a.atrasados || b.esperando - a.esperando);

  const etapas = [...new Map(leads.map((l) => [l.etapa.id, l.etapa])).values()].sort((a, b) => a.posicao - b.posicao);
  const maxEtapa = Math.max(1, ...etapas.map((e) => leads.filter((l) => l.etapa.id === e.id).length));
  const origens = [...new Set(leads.map((l) => l.origem.canal ?? "outro"))]
    .map((c) => ({ canal: c, n: leads.filter((l) => (l.origem.canal ?? "outro") === c).length }))
    .sort((a, b) => b.n - a.n);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-12">
        <CartaoNumero
          className="lg:col-span-5"
          icone={ChatCircle}
          rotulo="Esperando resposta agora"
          valor={fila.length}
          alerta={atrasados.length > 0}
          contexto={atrasados.length ? `${atrasados.length} passaram do prazo · ${precoCompacto(soma(fila))} em oportunidade` : "todos dentro do prazo"}
          href="/app/fila"
          ilustracao={<IlustraConversa />}
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
          <CartaoNumero
            icone={UserPlus}
            rotulo={`Leads novos · ${["7d", "30d", "90d"].includes(periodo.chave) ? `${periodo.dias} dias` : periodo.rotulo.toLowerCase()}`}
            valor={novos.length}
            variacao={variacao != null ? { texto: `${variacao >= 0 ? "+" : ""}${variacao}%`, bom: variacao >= 0 } : undefined}
            contexto={`antes: ${novosAntes}`}
            href="/app/leads"
          />
          <CartaoNumero icone={Target} rotulo="Respondidos no prazo" valor={`${pctPrazo}%`} alerta={pctPrazo < META_RESPOSTA} contexto={`meta ${META_RESPOSTA}%`} />
        </div>
        <div className="lg:col-span-4">
          {pior ? (
            <Destaque lead={pior} imovel={porCodigo.get(pior.imovelCodigo ?? "")} rotulo="Espera há mais tempo" dono={primeiroNome(equipe.get(pior.donoId ?? "")?.nome)} />
          ) : (
            <Cartao bloco>
              <Vazio ilustracao={<IlustraCalma />} titulo="Fila zerada" texto="Ninguém da equipe tem lead esperando." />
            </Cartao>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoNumero
          icone={CalendarBlank}
          rotulo="Visitas agendadas"
          valor={visitas.length}
          contexto={visitas.length ? `${precoCompacto(soma(visitas))} em oportunidade` : "nenhuma marcada"}
          href="/app/pipeline"
        />
        <CartaoNumero icone={Handshake} rotulo="Em proposta" valor={propostas.length} contexto="proposta, negociação e fechamento" href="/app/pipeline" />
        <CartaoNumero
          icone={Buildings}
          rotulo="VGV em carteira"
          valor={precoCompacto(carteira)}
          contexto={veReceita ? `${precoCompacto(Math.round(carteira * COMISSAO_OPA))} de comissão potencial` : undefined}
        />
        {veReceita ? (
          <CartaoNumero
            icone={Coins}
            rotulo="Comissão OPA"
            valor={precoCompacto(comissao)}
            contexto={`${vendas.length} ${vendas.length === 1 ? "venda" : "vendas"} · VGV ${precoCompacto(vgvVendido)}`}
          />
        ) : (
          <CartaoNumero icone={Funnel} rotulo="Diagnóstico completo" valor={`${pctDiagnostico}%`} contexto="finalidade, região, momento e inegociável" />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Cartao bloco className="lg:col-span-7">
          <TituloBloco icone={UsersThree} titulo="Equipe agora" sub="Quem está segurando a fila" />
          <ul className="mt-5 flex flex-col gap-4">
            {porCorretor.map((c) => (
              <li key={c.pessoa.id} className="flex items-center gap-3">
                <Avatar texto={c.pessoa.iniciais} tom={c.atrasados ? "escuro" : "claro"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{c.pessoa.nome}</p>
                    <div className="flex shrink-0 gap-1.5">
                      <Chip icone={ChatCircle} tom="claro">
                        {c.esperando}
                      </Chip>
                      {c.atrasados > 0 && (
                        <Chip icone={Clock} tom="alerta">
                          {c.atrasados}
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <BarraHachurada pct={c.diagnostico} className="flex-1" />
                    <span className="w-10 text-right text-[12px] tabular-nums text-[#5b7284]">{c.diagnostico}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex flex-wrap items-center gap-4 text-[12px] text-[#5b7284]">
            <span className="inline-flex items-center gap-1">
              <ChatCircle className="size-3.5" /> esperando
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> fora do prazo
            </span>
            <span>barra: diagnóstico completo</span>
          </p>
        </Cartao>

        <Cartao bloco className="lg:col-span-5">
          <TituloBloco
            icone={Funnel}
            titulo="Funil de compradores"
            sub="Quantos negócios em cada etapa"
            acao={
              <Link href="/app/pipeline" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2a7ca8]">
                Abrir <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <ul className="mt-5 flex flex-col gap-3">
            {etapas.map((e) => {
              const n = leads.filter((l) => l.etapa.id === e.id).length;
              return (
                <li key={e.id} className="grid grid-cols-[120px_1fr_24px] items-center gap-3 text-[13px]">
                  <span className="truncate text-[#34566b]">{e.nome}</span>
                  <BarraHachurada pct={(n / maxEtapa) * 100} />
                  <span className="text-right tabular-nums text-[#0a2d40]">{n}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 border-t border-[#e7eef2] pt-4">
            <p className="text-[12px] font-medium text-[#5b7284]">De onde vieram</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {origens.map((o) => (
                <Chip key={o.canal} tom="neutro">
                  {ROTULO_ORIGEM[o.canal] ?? o.canal} · {o.n}
                </Chip>
              ))}
            </div>
          </div>
        </Cartao>
      </div>
    </>
  );
}
