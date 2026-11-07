import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, carregarImoveis, carregarLeads, chaveOrigem, filtrarCorretor, ROTULO_ORIGEM, rotuloOrigem, type LeadOpa } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowsClockwise,
  BellSlash,
  ChatCircle,
  DownloadSimple,
  Fire,
  Globe,
  Handshake,
  HouseLine,
  Infinito,
  Key,
  LinkSimple,
  Lock,
  MagnifyingGlass,
  Snowflake,
  Target,
  Thermometer,
  UserPlus,
  UsersThree,
  WhatsappLogo,
  XCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { AtualizaSozinho } from "../_opa/atualiza-sozinho";
import { AbrirLead, SeletorEtapa } from "../_opa/painel-lead";
import { FiltrosLeads, FormatoLeads, ListaDoGestor, MarcarLead, type OpcaoFiltro } from "./_lista";
import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FotoImovel } from "../_opa/componentes";
import { IlustraConversa } from "../_opa/ilustracoes";
import { AbasPilula, Avatar, Cartao, CartaoNumero, Chip, Vazio, iniciaisDe, type Icone } from "../_opa/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const ABAS: Array<[string, string, Icone, (l: LeadOpa, compradores: string) => boolean]> = [
  ["todos", "Todos", UsersThree, () => true],
  ["compradores", "Compradores", HouseLine, (l, c) => l.pipelineId === c],
  ["proprietarios", "Proprietários", Key, (l, c) => l.pipelineId !== c],
  ["offmarket", "Off market", Lock, (l) => l.offMarket !== null],
  ["proprio", "Lead próprio", Target, (l) => l.proprio],
  ["lembretes", "Lembretes desligados", BellSlash, (l) => l.lembretesDesligados],
];

/** Ícone de cada canal de entrada, para a origem se ler sem texto longo. */
const ICONE_ORIGEM: Record<string, Icone> = {
  meta: Infinito,
  anuncio_whatsapp: WhatsappLogo,
  site: Globe,
  whatsapp: WhatsappLogo,
  linkbio: LinkSimple,
  indicacao: Handshake,
  radar: Target,
};

const TEMPERATURA: Record<string, { icone: Icone; tom: "alerta" | "aviso" | "claro"; rotulo: string }> = {
  quente: { icone: Fire, tom: "alerta", rotulo: "Quente" },
  morno: { icone: Thermometer, tom: "aviso", rotulo: "Morno" },
  frio: { icone: Snowflake, tom: "claro", rotulo: "Frio" },
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; q?: string; corretor?: string; pagina?: string; etapa?: string; origem?: string; temperatura?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { aba = "todos", q, corretor, pagina: paginaBruta, etapa, origem, temperatura } = await searchParams;
  const gestor = user.is_platform_admin || org.role === "manager" || org.role === "admin";
  const supabase = await createClient();

  const [todos, imoveis, equipe, { data: funis }, { data: etapasBrutas }] = await Promise.all([
    carregarLeads(org.orgId, { funil: "todos" }),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    supabase.from("crm_pipelines").select("id, name, slug").eq("organization_id", org.orgId),
    supabase.from("crm_stages").select("id, name, pipeline_id, is_won, is_lost").eq("organization_id", org.orgId).eq("is_archived", false).order("position"),
  ]);
  const etapasDoFunil = new Map<string, Array<{ id: string; nome: string }>>();
  for (const e of (etapasBrutas ?? []) as Array<{ id: string; name: string; pipeline_id: string; is_won: boolean; is_lost: boolean }>) {
    if (e.is_won || e.is_lost) continue;
    etapasDoFunil.set(e.pipeline_id, [...(etapasDoFunil.get(e.pipeline_id) ?? []), { id: e.id, nome: e.name }]);
  }
  const compradores = ((funis ?? []) as Array<{ id: string; slug: string }>).find((f) => f.slug === "compradores")?.id ?? "";
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));

  // Sem acento nem maiúscula: "joao" acha "João".
  const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const busca = sem((q ?? "").trim());
  const digitos = busca.replace(/\D/g, "");
  // "Mais N nesta etapa", no Funil, chega aqui com ?etapa= (F7).
  const base = filtrarCorretor(todos, corretor)
    .filter((l) => !etapa || l.etapa.id === etapa)
    .filter((l) => !origem || chaveOrigem(l.origem) === origem)
    .filter((l) => !temperatura || l.copiloto.temperatura === temperatura)
    .filter((l) => {
      if (!busca) return true;
      const im = porCodigo.get(l.imovelCodigo ?? "");
      return (
        sem(l.nome).includes(busca) ||
        (digitos.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos)) ||
        l.imoveisInteresse.some((c) => sem(c).includes(busca)) ||
        (im ? sem(im.titulo).includes(busca) : false)
      );
    })
    .sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
  const filtro = ABAS.find((a) => a[0] === aba) ?? ABAS[0]!;
  const lista = base.filter((l) => filtro[3](l, compradores));
  // A base cresce: a tela desenha 50 por vez (com 1.500 leads eram 7 MB de página).
  const POR_PAGINA = 50;
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, Number.parseInt(paginaBruta ?? "1", 10) || 1));
  const visiveis = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const esperando = base.filter((l) => l.conversa?.esperandoMin != null).length;
  const offMarket = base.filter((l) => l.offMarket !== null).length;
  const link = (a: string, pg = 1) => {
    const p = new URLSearchParams();
    if (a !== "todos") p.set("aba", a);
    if (q) p.set("q", q);
    if (corretor) p.set("corretor", corretor);
    if (etapa) p.set("etapa", etapa);
    if (origem) p.set("origem", origem);
    if (temperatura) p.set("temperatura", temperatura);
    if (pg > 1) p.set("pagina", String(pg));
    return `/app/leads${p.size ? `?${p}` : ""}`;
  };

  // Só as etiquetas que têm algum lead: filtro que nunca traz nada é ruído.
  const opcoesFiltro: OpcaoFiltro[] = [
    ...[...new Set(todos.map((l) => chaveOrigem(l.origem)).filter((c): c is string => Boolean(c)))].map((c) => ({ campo: "origem", campoRotulo: "Origem", valor: c, rotulo: ROTULO_ORIGEM[c] ?? c })),
    ...Object.entries(TEMPERATURA)
      .filter(([k]) => todos.some((l) => l.copiloto.temperatura === k))
      .map(([k, t]) => ({ campo: "temperatura", campoRotulo: "Temperatura", valor: k, rotulo: t.rotulo })),
    ...[...new Map(todos.map((l) => [l.etapa.id, l.etapa.nome])).entries()].map(([id, nome]) => ({ campo: "etapa", campoRotulo: "Etapa", valor: id, rotulo: nome })),
  ];
  const abas = ABAS.filter(([k]) => gestor || k !== "lembretes");

  const conteudoLista = (
    <>
      <Cartao bloco tour="leads-lista" className="p-3 md:p-4">
        <ul className="flex flex-col">
          {visiveis.map((l) => {
            const im = porCodigo.get(l.imovelCodigo ?? "");
            const dono = equipe.get(l.donoId ?? "");
            const IconeOrigem = ICONE_ORIGEM[chaveOrigem(l.origem)] ?? UserPlus;
            const temp = TEMPERATURA[l.copiloto.temperatura ?? ""];
            const espera = l.conversa?.esperandoMin != null;
            const etapas = etapasDoFunil.get(l.pipelineId) ?? [];
            return (
              <li key={l.id} data-linha-lead className="group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] px-2 py-3 transition-colors hover:bg-[#f2f6f9] md:flex-nowrap">
                <MarcarLead id={l.id} nome={l.nome} />
                <AbrirLead leadId={l.id} data-tour="leads-item" className="flex min-w-0 flex-[1_1_60%] items-center gap-3 md:flex-1">
                  <span className="relative shrink-0">
                    <Avatar texto={iniciaisDe(l.nome)} tom={l.offMarket ? "escuro" : "claro"} className="size-11 text-[13px]" />
                    {espera && <span title="Esperando resposta" className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[#e07b2e]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[#0a2d40]">
                      <span className="truncate">{l.nome}</span>
                      {l.offMarket && <Lock weight="fill" className="size-3.5 shrink-0 text-[#0a2d40]" aria-label="Off market" />}
                      {l.voltou && l.voltou.vez > 1 && <ArrowsClockwise className="size-3.5 shrink-0 text-[#2a7ca8]" aria-label={`Voltou, ${l.voltou.vez}º formulário`} />}
                      {l.lembretesDesligados && <BellSlash className="size-3.5 shrink-0 text-[#5b7284]" aria-label="Lembretes desligados" />}
                      {l.proprio && <span className="shrink-0 rounded-full bg-[#0a2d40] px-2 py-0.5 text-[10px] font-semibold text-white">Próprio</span>}
                    </span>
                    <span data-sub-lead className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-[#5b7284]">
                      {im ? (
                        <>
                          <FotoImovel imovel={im} className="size-5 shrink-0 rounded-md" />
                          <span className="truncate">
                            {im.codigo} · {im.titulo}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <HouseLine className="size-3.5" /> Sem imóvel definido
                        </span>
                      )}
                    </span>
                  </span>
                </AbrirLead>
                <div className="w-full pl-14 md:w-44 md:shrink-0 md:pl-0">
                  {etapas.length > 0 ? (
                    <SeletorEtapa leadId={l.id} nome={l.nome} atual={l.etapa.id} etapas={etapas} className="h-11 w-full rounded-full border-0 bg-[#f2f6f9] px-3 text-[13px] font-medium text-[#0a2d40] outline-none hover:bg-[#e7f0f5] focus-visible:ring-2 focus-visible:ring-[#2a7ca8] disabled:opacity-60" />
                  ) : (
                    <p className="truncate text-[13px] font-medium text-[#0a2d40]">{l.etapa.nome}</p>
                  )}
                </div>
                {gestor && (
                  <div className="hidden w-40 shrink-0 xl:block">
                    <Chip icone={IconeOrigem} tom={l.pago ? "claro" : "neutro"}>
                      {rotuloOrigem(l.origem, "Origem")}
                    </Chip>
                  </div>
                )}
                <div className="hidden w-[92px] shrink-0 lg:block">
                  {temp ? (
                    <Chip icone={temp.icone} tom={temp.tom}>
                      {temp.rotulo}
                    </Chip>
                  ) : null}
                </div>
                {gestor && (
                  <span title={dono?.nome ?? "Sem corretor"} className="hidden shrink-0 md:block">
                    <Avatar texto={dono?.iniciais ?? "?"} foto={dono?.foto} tom="acao" className="size-8 text-[11px]" />
                  </span>
                )}
                {gestor && (
                  <span className="hidden w-20 shrink-0 text-right text-[12px] tabular-nums text-[#5b7284] 2xl:block">
                    {new Date(l.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {lista.length === 0 &&
          (todos.length === 0 ? (
            <Vazio titulo="Ainda não chegou nenhum lead" texto="Quando um cliente chamar ou preencher um formulário, ele aparece aqui e na Fila." />
          ) : (
            <Vazio titulo="Nenhum lead aqui" texto="Troque a aba, tire um filtro ou limpe a busca." />
          ))}
        {paginas > 1 && (
          <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-4 text-[14px] text-[#5b7284]">
            <span>
              {(pagina - 1) * POR_PAGINA + 1} a {Math.min(pagina * POR_PAGINA, lista.length)} de {lista.length}
            </span>
            <span className="flex gap-2">
              {pagina > 1 && (
                <Link href={link(filtro[0], pagina - 1)} className="inline-flex h-11 items-center rounded-full bg-[#f2f6f9] px-4 font-semibold text-[#12455f]">
                  Anteriores
                </Link>
              )}
              {pagina < paginas && (
                <Link href={link(filtro[0], pagina + 1)} className="inline-flex h-11 items-center rounded-full bg-[#12455f] px-4 font-semibold text-white">
                  Próximos
                </Link>
              )}
            </span>
          </nav>
        )}
      </Cartao>
    </>
  );

  return (
    <>
      <CabecalhoOpa titulo={gestor ? "Leads" : "Meus leads"} subtitulo="Toque num lead para ver o resumo e o próximo passo" icone={UserPlus} semBusca />
      <CorpoOpa>
        <AtualizaSozinho />
        {/* A busca da lista: filtra aqui mesmo. A do topo procura em tudo e faz ações. */}
        <form action="/app/leads" method="get" role="search" data-tour="leads-busca" className="flex items-center gap-2">
          {filtro[0] !== "todos" && <input type="hidden" name="aba" value={filtro[0]} />}
          {corretor && <input type="hidden" name="corretor" value={corretor} />}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar lead por nome, telefone ou imóvel</span>
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5b7284]" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar nome, telefone ou imóvel"
              enterKeyHint="search"
              autoComplete="off"
              className="h-12 w-full rounded-full border border-[#d5e2ea] bg-white pl-12 pr-4 text-[16px] text-[#0a2d40] placeholder:text-[#5b7284] focus:border-[#2a7ca8] focus:outline-none focus:ring-2 focus:ring-[#2a7ca8]/30"
            />
          </label>
          <button type="submit" className="inline-flex h-12 shrink-0 items-center rounded-full bg-[#0a2d40] px-5 text-[15px] font-semibold text-white hover:bg-[#12455f]">
            Buscar
          </button>
        </form>

        {/* No celular a lista vem primeiro; o resumo aparece a partir do tablet. */}
        {gestor && <div className="hidden gap-5 sm:grid sm:grid-cols-3">
          <CartaoNumero icone={UsersThree} rotulo="Na base" valor={base.length} contexto="leads abertos, todos os funis" />
          <CartaoNumero
            icone={ChatCircle}
            rotulo="Esperando resposta"
            valor={esperando}
            alerta={esperando > 0}
            contexto={esperando ? "abra a fila para responder" : "ninguém esperando"}
            href="/app/fila"
            ilustracao={<IlustraConversa />}
          />
          <CartaoNumero icone={Lock} rotulo="Off market" valor={offMarket} contexto="atendimento com sigilo" href={link("offmarket")} />
        </div>}

        <div data-tour="leads-abas" className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={abas.map(([k, r, icone, f]) => ({
              href: link(k),
              rotulo: r,
              icone,
              contagem: base.filter((l) => f(l, compradores)).length,
              ativo: filtro[0] === k,
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
          <FormatoLeads atual="lista" corretor={corretor} />
          {org.role === "admin" && (
            // <a> de propósito: é um download (route handler com CSV), não uma página.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href="/app/leads/exportar"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
            >
              <DownloadSimple className="size-4" weight="bold" /> Exportar
            </a>
          )}
          </div>
        </div>

        <FiltrosLeads opcoes={opcoesFiltro} total={lista.length} />

        {q && (
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-[#5b7284]">
            <Chip icone={MagnifyingGlass} tom="claro">
              “{q}”
            </Chip>
            {lista.length} {lista.length === 1 ? "lead encontrado" : "leads encontrados"}
            <Link href={link(filtro[0])} className="inline-flex items-center gap-1 font-semibold text-[#2a7ca8]">
              <XCircle className="size-4" /> Limpar busca
            </Link>
          </div>
        )}

        {gestor ? (
          <ListaDoGestor
            corretores={[...equipe.values()].filter((p) => p.papel !== "viewer").map((p) => ({ id: p.id, nome: p.nome }))}
            etapasPorLead={Object.fromEntries(visiveis.map((l) => [l.id, etapasDoFunil.get(l.pipelineId) ?? []]))}
            podeExcluir={Boolean(user.is_platform_admin) || org.role === "admin"}
          >
            {conteudoLista}
          </ListaDoGestor>
        ) : (
          conteudoLista
        )}

        {gestor && <p className={cn("flex flex-wrap items-center gap-4 px-2 text-[12px] text-[#5b7284]")}>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-[#e07b2e]" /> esperando resposta
          </span>
          <span className="inline-flex items-center gap-1">
            <Lock weight="fill" className="size-3.5" /> off market
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowsClockwise className="size-3.5" /> voltou por outro formulário
          </span>
          <span className="inline-flex items-center gap-1">
            <BellSlash className="size-3.5" /> lembretes desligados
          </span>
        </p>}
      </CorpoOpa>
    </>
  );
}
