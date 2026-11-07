import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, gerenteVeReceita, primeiroNome, ROTULO_ORIGEM } from "@/lib/opa/dados";
import { ordenarCorretores, type ColunaCorretor, type Dashboard, type LeadDash } from "@/lib/opa/dashboard";
import { carregarDashboard, carregarFunis } from "@/lib/opa/dashboard-dados";
import { precoCurto } from "@/lib/opa/imoveis";
import { dataHoraSP, paramsDoPeriodo, resolverPeriodo } from "@/lib/opa/periodo";
import { ArrowRight, Buildings, CalendarBlank, ChartBar, Clock, Coins, Funnel, HouseLine, Megaphone, UsersThree, X, XCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FiltroPeriodo } from "../_opa/periodo";
import { AbasPilula, Cartao, TituloBloco } from "../_opa/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/** Abaixo disto o corretor fica em vermelho na coluna "no prazo" (pedido do Kallyl: cor só para alerta). */
const META_PRAZO = 0.8;

type Busca = { periodo?: string; de?: string; ate?: string; p?: string; ver?: string; ordem?: string; dir?: string };

const pctTexto = (v: number | null) => (v === null ? "sem dado" : `${Math.round(v * 100)}%`);
const minTexto = (m: number | null) => (m === null ? "sem dado" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
const diasTexto = (d: number | null) => (d === null ? "sem dado" : `${Math.round(d)} ${Math.round(d) === 1 ? "dia" : "dias"}`);

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[12px] leading-relaxed text-[#5b7284]">{children}</p>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const gestor = user.is_platform_admin || org.role === "manager" || org.role === "admin";
  if (!gestor) redirect("/app/hoje");

  const busca = await searchParams;
  // Padrão 30 dias (pedido do Kallyl); o resto do CRM abre em 7.
  const periodo = resolverPeriodo({ ...busca, periodo: busca.periodo ?? "30d" });
  const funis = await carregarFunis(org.orgId);
  const funil = funis.find((f) => f.slug === (busca.p ?? "compradores")) ?? funis.find((f) => f.slug === "compradores") ?? funis[0];
  if (!funil) redirect("/app/hoje");

  const [{ dash, leads, etapas }, equipe, liberado] = await Promise.all([
    carregarDashboard(org.orgId, funil, periodo),
    carregarEquipe(org.orgId),
    gerenteVeReceita(org.orgId),
  ]);
  const veReceita = org.role === "admin" || user.is_platform_admin || liberado;
  const nomeDe = (id: string | null) => (id ? (equipe.get(id)?.nome ?? "Pessoa removida") : "Sem corretor");

  // Endereço que mantém período e funil e troca só o que mudou.
  const base: Record<string, string> = { ...paramsDoPeriodo(periodo), ...(funil.slug !== "compradores" ? { p: funil.slug } : {}) };
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(base);
    if (busca.ordem) q.set("ordem", busca.ordem);
    if (busca.dir) q.set("dir", busca.dir);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    return `/app/dashboard?${q.toString()}`;
  };
  const ver = (chave: string) => link({ ver: chave });

  const g = dash.grandes;
  const ordem = (["recebidos", "pctPrazo", "tempoMedioMin", "visitas", "propostas", "ganhos", "perdidos", "conversao"] as const).includes(busca.ordem as ColunaCorretor)
    ? (busca.ordem as ColunaCorretor)
    : "recebidos";
  const dir = busca.dir === "asc" ? "asc" : "desc";
  const corretores = ordenarCorretores(dash.corretores, ordem, dir);

  return (
    <>
      <CabecalhoOpa secao="Gestão" titulo="Dashboard" subtitulo={`${funil.nome} · ${periodo.rotulo}`} icone={ChartBar} equipe={false}>
        <FiltroPeriodo chave={periodo.chave} rotulo={periodo.rotulo} deDia={periodo.deDia} ateDia={periodo.ateDia} hoje={periodo.hoje} />
      </CabecalhoOpa>
      <CorpoOpa>
        {funis.length > 1 && (
          <AbasPilula
            itens={funis.map((f) => ({
              href: `/app/dashboard?${new URLSearchParams({ ...paramsDoPeriodo(periodo), ...(f.slug !== "compradores" ? { p: f.slug } : {}) }).toString()}`,
              rotulo: f.nome,
              ativo: f.id === funil.id,
            }))}
          />
        )}

        {busca.ver && <ListaDoNumero chave={busca.ver} dash={dash} leads={leads} etapas={new Map(etapas.map((e) => [e.id, e.nome]))} nomeDe={nomeDe} fechar={link({ ver: undefined })} veReceita={veReceita} />}

        {/* 1. Cinco números: o que importa em 5 segundos. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Numero href={ver("novos")} rotulo="Leads" valor={String(g.leads.atual)} antes={g.leads.antes} />
          <Numero
            href={ver("fora-prazo")}
            rotulo="Respondidos no prazo"
            valor={pctTexto(g.pctPrazo.atual)}
            antes={g.pctPrazo.antes === null ? null : `${Math.round(g.pctPrazo.antes * 100)}%`}
            alerta={g.pctPrazo.atual !== null && g.pctPrazo.atual < META_PRAZO}
            detalhe={g.pctPrazo.pendentes ? `${g.pctPrazo.pendentes} ainda no prazo` : undefined}
          />
          <Numero href={ver("visitas")} rotulo="Visitas realizadas" valor={String(g.visitasRealizadas.atual)} antes={g.visitasRealizadas.antes} />
          <Numero
            href={ver("proposta")}
            rotulo="VGV em proposta"
            valor={veReceita ? precoCurto(g.vgvProposta.cents) || "R$ 0" : String(g.vgvProposta.leads)}
            detalhe={veReceita ? `${g.vgvProposta.leads} ${g.vgvProposta.leads === 1 ? "lead" : "leads"}, foto de agora` : "leads em proposta, foto de agora"}
          />
          <Numero
            href={ver("ganhos")}
            rotulo="Ganhos"
            valor={String(g.ganhos.atual)}
            antes={g.ganhos.antes}
            detalhe={veReceita && g.ganhos.atual ? `VGV ${precoCurto(g.ganhos.vgvCents)}` : undefined}
            className="col-span-2 lg:col-span-1"
          />
        </div>
        {veReceita && (
          <Cartao className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Coins className="size-5 text-[#2a7ca8]" />
              <p className="text-[14px] text-[#34566b]">Comissão dos ganhos do período</p>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
              <div>
                <dt className="text-[12px] text-[#5b7284]">Bruta (6% do VGV)</dt>
                <dd className="font-semibold tabular-nums text-[#0a2d40]">{precoCurto(g.ganhos.comissaoBrutaCents) || "R$ 0"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#5b7284]">Fica na OPA (a do botão de ganho)</dt>
                <dd className="font-semibold tabular-nums text-[#0a2d40]">{precoCurto(g.ganhos.comissaoOpaCents) || "R$ 0"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#5b7284]">Ticket médio</dt>
                <dd className="font-semibold tabular-nums text-[#0a2d40]">{dash.ticketMedioCents ? precoCurto(dash.ticketMedioCents) : "sem dado"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[#5b7284]">Ciclo de venda</dt>
                <dd className="font-semibold tabular-nums text-[#0a2d40]">{diasTexto(dash.cicloMedioDias)}</dd>
              </div>
            </dl>
          </Cartao>
        )}
        <p className="-mt-2 text-[12px] leading-relaxed text-[#5b7284]">
          Leads = entraram no período. Respondido no prazo = primeira mensagem, ligação ou &ldquo;Respondi&rdquo; do corretor dentro de 1 h (pago) ou 3 h
          (orgânico), contando só o horário de atendimento; a boas-vindas automática não conta. Em cinza, o período anterior do mesmo tamanho. Toque em um
          número para ver os leads.
          {!veReceita && " VGV e comissão aparecem para o administrador, ou para o gestor quando a empresa libera."}
        </p>

        {/* 2. Funil por etapa. */}
        <Cartao bloco>
          <TituloBloco icone={Funnel} titulo="Funil" sub="Dos leads que entraram no período, quantos chegaram a cada etapa" />
          <ol className="mt-5 flex flex-col gap-2">
            {dash.funil.map((f, i) => {
              const topo = dash.funil[0]?.alcancaram || 1;
              const largura = Math.max(4, Math.round((f.alcancaram / topo) * 100));
              return (
                <li key={f.id}>
                  <Link href={ver(f.id === "ganho" ? "etapa:ganho" : `etapa:${f.id}`)} className="group flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-[13px] text-[#34566b] sm:w-40" title={f.nome}>
                      {f.nome}
                    </span>
                    <span className="relative h-8 flex-1 overflow-hidden rounded-[10px] bg-[#f2f6f9]">
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-[10px] transition-colors", f.id === "ganho" ? "bg-[#12455f]" : "bg-[#2a7ca8] group-hover:bg-[#236a90]")}
                        style={{ width: `${largura}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-[13px] tabular-nums text-[#0a2d40] sm:w-32">
                      <b>{f.alcancaram}</b>
                      {i > 0 && f.passagem !== null && <span className="text-[#5b7284]"> · {Math.round(f.passagem * 100)}%</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Nota>
            O percentual é a passagem da etapa de cima para esta. Chegou à etapa = está nela agora ou já passou. Ganho conta em todas; perdido conta até a etapa em que estava (registrado desde 07/11/2026; antes
            disso, só na entrada).{dash.semMomento ? ` ${dash.semMomento} em Sem momento contam só na entrada.` : ""}
          </Nota>
        </Cartao>

        {/* 3. Tabela por corretor. */}
        <Cartao bloco>
          <TituloBloco icone={UsersThree} titulo="Por corretor" sub="Toque no título da coluna para ordenar; no número, para ver os leads" />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-y-1.5 text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-[#5b7284]">
                  <th className="px-3 font-medium">Corretor</th>
                  {(
                    [
                      ["recebidos", "Recebidos"],
                      ["pctPrazo", "No prazo"],
                      ["tempoMedioMin", "Tempo médio"],
                      ["visitas", "Visitas"],
                      ["propostas", "Propostas"],
                      ["ganhos", "Ganhos"],
                      ["perdidos", "Perdidos"],
                      ["conversao", "Conversão"],
                    ] as Array<[ColunaCorretor, string]>
                  ).map(([k, r]) => (
                    <th key={k} className="px-3 text-right font-medium">
                      <Link href={link({ ordem: k, dir: ordem === k && dir === "desc" ? "asc" : "desc" })} className={cn("hover:text-[#0a2d40]", ordem === k && "font-semibold text-[#0a2d40]")}>
                        {r}
                        {ordem === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 text-right font-medium">Repasses</th>
                </tr>
              </thead>
              <tbody>
                {corretores.map((c) => {
                  const alerta = c.pctPrazo !== null && c.pctPrazo < META_PRAZO;
                  const celula = "bg-[#f7fafc] px-3 py-2.5 text-right tabular-nums";
                  return (
                    <tr key={c.id}>
                      <td className="rounded-l-[14px] bg-[#f7fafc] px-3 py-2.5 font-semibold text-[#0a2d40]">{nomeDe(c.id)}</td>
                      <td className={celula}>
                        <Link href={ver(`corretor:${c.id}`)} className="hover:underline">{c.recebidos}</Link>
                      </td>
                      <td className={cn(celula, alerta && "font-semibold text-[#b42318]")}>
                        <Link href={ver(`corretor-fora:${c.id}`)} className="hover:underline" title={`${c.noPrazo} de ${c.avaliados} no prazo`}>
                          {pctTexto(c.pctPrazo)}
                        </Link>
                      </td>
                      <td className={celula}>{minTexto(c.tempoMedioMin)}</td>
                      <td className={celula}>{c.visitas}</td>
                      <td className={celula}>{c.propostas}</td>
                      <td className={celula}>
                        <Link href={ver(`corretor-ganhos:${c.id}`)} className="hover:underline">{c.ganhos}</Link>
                      </td>
                      <td className={celula}>
                        <Link href={ver(`corretor-perdidos:${c.id}`)} className="hover:underline">{c.perdidos}</Link>
                      </td>
                      <td className={celula}>{pctTexto(c.conversao)}</td>
                      <td className="rounded-r-[14px] bg-[#f7fafc] px-3 py-2.5 text-right tabular-nums text-[#34566b]" title="Recebeu por repasse / perdeu por prazo vencido">
                        +{c.repassesRecebidos} / -{c.repassesPerdidos}
                      </td>
                    </tr>
                  );
                })}
                {corretores.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-[#5b7284]">
                      Nenhum lead no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Nota>
            Recebidos = leads que entraram no período com o corretor como dono hoje. No prazo = entre os que já dá para julgar (respondidos ou com o prazo
            vencido); em vermelho, abaixo de {Math.round(META_PRAZO * 100)}%. Tempo médio = até a primeira resposta, em horário de atendimento. Propostas = chegaram a
            Proposta feita. Conversão = ganhos do período sobre recebidos. Repasses = recebeu de outro corretor / perdeu por prazo vencido.
          </Nota>
        </Cartao>

        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {/* 4. Perdidos. */}
          <Cartao bloco>
            <TituloBloco icone={XCircle} titulo="Perdidos por motivo" sub={`${dash.perdidos.total} no período`} />
            <Barras itens={dash.perdidos.porMotivo.map((m) => ({ chave: `motivo:${m.motivo}`, rotulo: m.motivo, n: m.n, destaque: m.destaque }))} ver={ver} />
            {dash.perdidos.porEtapa.length > 0 && (
              <>
                <p className="mt-5 text-[13px] font-semibold text-[#5b7284]">Em que etapa estavam</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {dash.perdidos.porEtapa.map((e) => (
                    <li key={e.etapa} className="rounded-full bg-[#f2f6f9] px-3 py-1 text-[13px] text-[#34566b]">
                      {e.etapa} <b className="tabular-nums text-[#0a2d40]">{e.n}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Nota>Perdidos com a data de perda no período. Contato inválido e contato pessoal ficam em destaque: não são perda de venda, são lead que não era lead.</Nota>
          </Cartao>

          {/* 5. Origem. */}
          <Cartao bloco>
            <TituloBloco icone={Megaphone} titulo="Por origem" sub="De onde vieram e quanto virou venda" />
            <ul className="mt-5 flex flex-col gap-1.5">
              {dash.origens.map((o) => (
                <li key={o.chave}>
                  <Link href={ver(`origem:${o.chave}`)} className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f7fafc] px-3.5 py-2.5 text-[14px] hover:bg-[#eef3f6]">
                    <span className="truncate text-[#0a2d40]">{ROTULO_ORIGEM[o.chave] ?? o.chave}</span>
                    <span className="shrink-0 tabular-nums text-[#34566b]">
                      <b className="text-[#0a2d40]">{o.leads}</b> leads · {o.ganhos} {o.ganhos === 1 ? "ganho" : "ganhos"}
                    </span>
                  </Link>
                </li>
              ))}
              {dash.origens.length === 0 && <li className="text-[14px] text-[#5b7284]">Nenhum lead no período.</li>}
            </ul>
            <Nota>
              Formulário Meta é só o que passa pelo painel (traz campanha, imóvel e respostas). Anúncio de WhatsApp é o clique para conversa no número do corretor.
              {dash.voltaram ? (
                <>
                  {" "}
                  <Link href={ver("voltaram")} className="underline">
                    {dash.voltaram} {dash.voltaram === 1 ? "lead voltou" : "leads voltaram"}
                  </Link>{" "}
                  por outro formulário no período.
                </>
              ) : null}
            </Nota>
          </Cartao>

          {/* 6. Visitas e etapas paradas. */}
          <Cartao bloco>
            <TituloBloco icone={CalendarBlank} titulo="Visitas" sub="No período" />
            <div className="mt-5 grid grid-cols-3 gap-2">
              {(
                [
                  ["visitas", "Realizadas", dash.visitas.realizadas],
                  ["visitas-agendadas", "Agendadas", dash.visitas.agendadas],
                  ["visitas-nao", "Não aconteceram", dash.visitas.naoAconteceram],
                ] as const
              ).map(([k, r, n]) => (
                <Link key={k} href={ver(k)} className="rounded-[16px] bg-[#f7fafc] px-3 py-3 hover:bg-[#eef3f6]">
                  <p className="text-[24px] font-semibold tabular-nums text-[#0a2d40]">{n}</p>
                  <p className="text-[12px] text-[#5b7284]">{r}</p>
                </Link>
              ))}
            </div>
            <Nota>Agendadas = marcadas para daqui até o fim do período. Não aconteceram = canceladas, ou agendadas que passaram sem ficha de visita.</Nota>
          </Cartao>

          <Cartao bloco>
            <TituloBloco icone={Clock} titulo="Parados e tempo na etapa" sub="Leads abertos, agora" />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-[#5b7284]">
                    <th className="py-1.5 pr-3 font-medium">Etapa</th>
                    <th className="px-2 text-right font-medium">7+ dias</th>
                    <th className="px-2 text-right font-medium">14+</th>
                    <th className="px-2 text-right font-medium">30+</th>
                    <th className="pl-2 text-right font-medium">Média na etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.parados.map((p, i) => (
                    <tr key={p.etapaId} className="border-t border-[#eef3f6]">
                      <td className="py-2 pr-3 text-[#0a2d40]">{p.etapa}</td>
                      {([7, 14, 30] as const).map((d) => {
                        const n = d === 7 ? p.d7 : d === 14 ? p.d14 : p.d30;
                        return (
                          <td key={d} className={cn("px-2 text-right tabular-nums", n > 0 ? "font-semibold text-[#b25e09]" : "text-[#8aa0ae]")}>
                            {n > 0 ? <Link href={ver(`parados:${d}:${p.etapaId}`)} className="hover:underline">{n}</Link> : 0}
                          </td>
                        );
                      })}
                      <td className="pl-2 text-right tabular-nums text-[#34566b]">{diasTexto(dash.tempoNaEtapa[i]?.dias ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Nota>Parado = na mesma etapa há tantos dias. Média na etapa = tempo médio dos abertos na etapa atual; o tempo de etapas antigas ainda não é guardado.</Nota>
          </Cartao>

          {/* 7. Imóveis e anúncios. */}
          <Cartao bloco>
            <TituloBloco icone={Buildings} titulo="Por imóvel e por anúncio" sub="Leads que entraram no período" />
            <p className="mt-5 text-[13px] font-semibold text-[#5b7284]">Imóveis</p>
            <Barras itens={dash.porImovel.map((i) => ({ chave: `imovel:${i.codigo}`, rotulo: i.codigo, n: i.n }))} ver={ver} vazio="Nenhum lead com imóvel." />
            <p className="mt-5 text-[13px] font-semibold text-[#5b7284]">Anúncios</p>
            <Barras itens={dash.porAnuncio.map((a) => ({ chave: `anuncio:${a.anuncio}`, rotulo: a.anuncio, n: a.n }))} ver={ver} vazio="Nenhum lead com anúncio no período." />
            <Nota>Anúncio = o nome que o painel manda com o lead do formulário (desde 07/11/2026). Lead que chegou antes disso fica sem anúncio.</Nota>
          </Cartao>

          <Cartao bloco>
            <TituloBloco icone={HouseLine} titulo="Imóveis sem lead" sub="Publicados e sem nenhum lead nos últimos 30 dias" />
            {dash.imoveisSemLead.length ? (
              <ul className="mt-5 flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
                {dash.imoveisSemLead.map((i) => (
                  <li key={i.codigo}>
                    <Link href={`/app/imoveis/${i.codigo}`} className="flex gap-3 rounded-[14px] bg-[#f7fafc] px-3.5 py-2.5 text-[13px] hover:bg-[#eef3f6]">
                      <b className="shrink-0 text-[#0a2d40]">{i.codigo}</b>
                      <span className="truncate text-[#34566b]">{i.titulo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-[14px] text-[#5b7284]">Todo imóvel publicado teve lead nos últimos 30 dias.</p>
            )}
            <Nota>Conta o imóvel do anúncio e a lista de interesse do lead. Fica fixo em 30 dias, qualquer que seja o período escolhido.</Nota>
          </Cartao>

          {dash.repasses.length > 0 && (
            <Cartao bloco>
              <TituloBloco icone={ArrowRight} titulo="Repasses por prazo vencido" sub="De quem saiu e para quem foi" />
              <ul className="mt-5 flex flex-col gap-1.5">
                {dash.repasses.map((r) => (
                  <li key={`${r.de}>${r.para}`} className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f7fafc] px-3.5 py-2.5 text-[14px]">
                    <span className="truncate text-[#0a2d40]">
                      {primeiroNome(nomeDe(r.de))} → {primeiroNome(nomeDe(r.para))}
                    </span>
                    <b className="tabular-nums text-[#0a2d40]">{r.n}</b>
                  </li>
                ))}
              </ul>
              <Nota>
                <Link href={ver("repasses")} className="underline">
                  Ver os leads repassados
                </Link>
                . O repasse acontece quando o lead fica sem resposta além do prazo e o corretor foi avisado.
              </Nota>
            </Cartao>
          )}
        </div>
      </CorpoOpa>
    </>
  );
}

function Numero({
  href,
  rotulo,
  valor,
  antes,
  detalhe,
  alerta,
  className,
}: {
  href: string;
  rotulo: string;
  valor: string;
  antes?: number | string | null;
  detalhe?: string;
  alerta?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex flex-col rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(9,44,62,0.04)] transition-colors hover:bg-[#f7fafc]", className)}>
      <span className="text-[13px] text-[#5b7284]">{rotulo}</span>
      <span className={cn("mt-1 text-[22px] font-semibold leading-tight tabular-nums tracking-tight sm:text-[28px]", alerta ? "text-[#b42318]" : "text-[#0a2d40]")}>{valor}</span>
      {antes !== undefined && antes !== null && <span className="mt-0.5 text-[12px] text-[#8aa0ae]">antes {antes}</span>}
      {detalhe && <span className="mt-0.5 text-[12px] text-[#5b7284]">{detalhe}</span>}
    </Link>
  );
}

function Barras({
  itens,
  ver,
  vazio = "Nada no período.",
}: {
  itens: Array<{ chave: string; rotulo: string; n: number; destaque?: boolean }>;
  ver: (k: string) => string;
  vazio?: string;
}) {
  if (!itens.length) return <p className="mt-3 text-[14px] text-[#5b7284]">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.n), 1);
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {itens.map((i) => (
        <li key={i.chave}>
          <Link href={ver(i.chave)} className="group flex items-center gap-3 text-[13px]">
            <span className={cn("w-40 shrink-0 truncate sm:w-56", i.destaque ? "font-semibold text-[#b25e09]" : "text-[#34566b]")} title={i.rotulo}>
              {i.rotulo}
            </span>
            <span className="relative h-6 flex-1 overflow-hidden rounded-[8px] bg-[#f2f6f9]">
              <span className={cn("absolute inset-y-0 left-0 rounded-[8px]", i.destaque ? "bg-[#f3c58f]" : "bg-[#9cc9e0] group-hover:bg-[#7fb6d3]")} style={{ width: `${Math.max(4, Math.round((i.n / max) * 100))}%` }} />
            </span>
            <b className="w-8 shrink-0 text-right tabular-nums text-[#0a2d40]">{i.n}</b>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Os leads por trás de um número (pedido do Kallyl: dashboard que não deixa ver o lead vira discussão). */
function ListaDoNumero({
  chave,
  dash,
  leads,
  etapas,
  nomeDe,
  fechar,
  veReceita,
}: {
  chave: string;
  dash: Dashboard;
  leads: Map<string, LeadDash>;
  etapas: Map<string, string>;
  nomeDe: (id: string | null) => string;
  fechar: string;
  veReceita: boolean;
}) {
  const ids = dash.listas.get(chave) ?? [];
  const lista = ids.map((id) => leads.get(id)).filter((l): l is LeadDash => Boolean(l));
  const [tipo, ...partes] = chave.split(":");
  const titulo = TITULOS[tipo!] ?? "Leads";
  // O que vem depois dos dois-pontos, em palavras: nome da etapa, do corretor ou o próprio valor.
  const legivel = (p: string) => (etapas.has(p) ? etapas.get(p)! : /^[0-9a-f-]{36}$/.test(p) ? primeiroNome(nomeDe(p)) : p === "ganho" ? "Ganho" : p);
  const sub = tipo === "parados" ? `${partes[0]}+ dias em ${legivel(partes[1] ?? "")}` : partes.length ? legivel(partes.join(":")) : "";
  return (
    <Cartao bloco className="border-2 border-[#8fc4dd]">
      <TituloBloco
        icone={UsersThree}
        titulo={`${titulo}${sub ? `: ${sub}` : ""}`}
        sub={`${lista.length} ${lista.length === 1 ? "lead" : "leads"}`}
        acao={
          <Link href={fechar} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#eef3f6] px-4 text-[13px] font-semibold text-[#0a2d40]" aria-label="Fechar a lista">
            <X className="size-4" /> Fechar
          </Link>
        }
      />
      <div className="mt-4 max-h-[420px] overflow-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-[12px] text-[#5b7284]">
              <th className="py-2 pr-3 font-medium">Lead</th>
              <th className="px-3 font-medium">Corretor</th>
              <th className="px-3 font-medium">Etapa</th>
              <th className="px-3 font-medium">Origem</th>
              <th className="px-3 font-medium">Entrou</th>
              {veReceita && <th className="pl-3 text-right font-medium">Valor</th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.id} className="border-t border-[#eef3f6]">
                <td className="py-2 pr-3">
                  <Link href={`/app/leads/${l.id}`} className="font-semibold text-[#0a2d40] hover:underline">
                    {l.nome}
                  </Link>
                  {l.imovel && <span className="text-[#5b7284]"> · {l.imovel}</span>}
                </td>
                <td className="px-3 text-[#34566b]">{primeiroNome(nomeDe(l.donoId))}</td>
                <td className="px-3 text-[#34566b]">{l.status === "won" ? "Ganho" : l.status === "lost" ? `Perdido${l.motivoPerda ? `: ${l.motivoPerda}` : ""}` : (etapas.get(l.etapaId) ?? "")}</td>
                <td className="px-3 text-[#34566b]">{ROTULO_ORIGEM[l.origem] ?? l.origem}</td>
                <td className="px-3 text-[#34566b]">{dataHoraSP(new Date(l.criadoEm).toISOString())}</td>
                {veReceita && <td className="pl-3 text-right tabular-nums text-[#34566b]">{precoCurto(l.vgvCents ?? l.valorCents)}</td>}
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[#5b7284]">
                  Nenhum lead por trás deste número.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

const TITULOS: Record<string, string> = {
  novos: "Leads do período",
  "fora-prazo": "Fora do prazo de resposta",
  visitas: "Com visita realizada",
  "visitas-agendadas": "Com visita agendada",
  "visitas-nao": "Visita que não aconteceu",
  proposta: "Em proposta agora",
  ganhos: "Ganhos",
  perdidos: "Perdidos",
  etapa: "Chegaram à etapa",
  "sem-momento": "Sem momento",
  corretor: "Recebidos pelo corretor",
  "corretor-fora": "Fora do prazo, do corretor",
  "corretor-ganhos": "Ganhos do corretor",
  "corretor-perdidos": "Perdidos do corretor",
  motivo: "Perdidos por motivo",
  origem: "Por origem",
  imovel: "Leads do imóvel",
  anuncio: "Leads do anúncio",
  parados: "Parados",
  voltaram: "Voltaram por outro formulário",
  repasses: "Repassados por prazo vencido",
};
