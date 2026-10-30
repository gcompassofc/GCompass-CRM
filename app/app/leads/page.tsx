import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, carregarImoveis, carregarLeads, filtrarCorretor, ROTULO_ORIGEM, type LeadOpa } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowsClockwise,
  BellSlash,
  CaretRight,
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
  searchParams: Promise<{ aba?: string; q?: string; corretor?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { aba = "todos", q, corretor } = await searchParams;
  const supabase = await createClient();

  const [todos, imoveis, equipe, { data: funis }] = await Promise.all([
    carregarLeads(org.orgId, { funil: "todos" }),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    supabase.from("crm_pipelines").select("id, name, slug").eq("organization_id", org.orgId),
  ]);
  const nomeFunil = new Map(((funis ?? []) as Array<{ id: string; name: string; slug: string }>).map((f) => [f.id, f.name]));
  const compradores = ((funis ?? []) as Array<{ id: string; slug: string }>).find((f) => f.slug === "compradores")?.id ?? "";
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));

  const busca = (q ?? "").trim().toLowerCase();
  const digitos = busca.replace(/\D/g, "");
  const base = filtrarCorretor(todos, corretor)
    .filter((l) => {
      if (!busca) return true;
      const im = porCodigo.get(l.imovelCodigo ?? "");
      return (
        l.nome.toLowerCase().includes(busca) ||
        (digitos.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos)) ||
        l.imoveisInteresse.some((c) => c.toLowerCase().includes(busca)) ||
        (im?.titulo.toLowerCase().includes(busca) ?? false)
      );
    })
    .sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
  const filtro = ABAS.find((a) => a[0] === aba) ?? ABAS[0]!;
  const lista = base.filter((l) => filtro[3](l, compradores));
  const esperando = base.filter((l) => l.conversa?.esperandoMin != null).length;
  const offMarket = base.filter((l) => l.offMarket !== null).length;
  const link = (a: string) => {
    const p = new URLSearchParams();
    if (a !== "todos") p.set("aba", a);
    if (q) p.set("q", q);
    if (corretor) p.set("corretor", corretor);
    return `/app/leads${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <CabecalhoOpa titulo="Leads" subtitulo="Toda a base, com origem e imóvel de interesse" icone={UserPlus} />
      <CorpoOpa>
        {/* No celular a lista vem primeiro; o resumo aparece a partir do tablet. */}
        <div className="hidden gap-5 sm:grid sm:grid-cols-3">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={ABAS.map(([k, r, icone, f]) => ({
              href: link(k),
              rotulo: r,
              icone,
              contagem: base.filter((l) => f(l, compradores)).length,
              ativo: filtro[0] === k,
            }))}
          />
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

        <Cartao bloco className="p-3 md:p-4">
          <ul className="flex flex-col">
            {lista.map((l) => {
              const im = porCodigo.get(l.imovelCodigo ?? "");
              const dono = equipe.get(l.donoId ?? "");
              const IconeOrigem = ICONE_ORIGEM[l.origem.canal ?? ""] ?? UserPlus;
              const temp = TEMPERATURA[l.copiloto.temperatura ?? ""];
              const espera = l.conversa?.esperandoMin != null;
              return (
                <li key={l.id}>
                  <Link
                    href={`/app/leads/${l.id}`}
                    className="group flex items-center gap-4 rounded-[22px] px-3 py-3.5 transition-colors hover:bg-[#f2f6f9]"
                  >
                    <span className="relative shrink-0">
                      <Avatar texto={iniciaisDe(l.nome)} tom={l.offMarket ? "escuro" : "claro"} className="size-11 text-[13px]" />
                      {espera && (
                        <span
                          title="Esperando resposta"
                          className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[#d64545]"
                        />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-[#0a2d40]">
                        <span className="truncate">{l.nome}</span>
                        {l.offMarket && <Lock weight="fill" className="size-3.5 shrink-0 text-[#0a2d40]" aria-label="Off market" />}
                        {l.voltou && l.voltou.vez > 1 && (
                          <ArrowsClockwise className="size-3.5 shrink-0 text-[#2a7ca8]" aria-label={`Voltou, ${l.voltou.vez}º formulário`} />
                        )}
                        {l.lembretesDesligados && <BellSlash className="size-3.5 shrink-0 text-[#5b7284]" aria-label="Lembretes desligados" />}
                        {l.proprio && (
                          <span className="shrink-0 rounded-full bg-[#0a2d40] px-2 py-0.5 text-[10px] font-semibold text-white">Próprio</span>
                        )}
                      </p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-[#5b7284]">
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
                      </p>
                    </div>

                    <div className="hidden w-44 shrink-0 lg:block">
                      <p className="truncate text-[13px] font-medium text-[#0a2d40]">{l.etapa.nome}</p>
                      <p className="truncate text-[12px] text-[#8aa3b3]">{nomeFunil.get(l.pipelineId) ?? ""}</p>
                    </div>

                    <div className="hidden w-40 shrink-0 md:block">
                      <Chip icone={IconeOrigem} tom={l.pago ? "claro" : "neutro"}>
                        {ROTULO_ORIGEM[l.origem.canal ?? ""] ?? l.origem.canal ?? "Origem"}
                      </Chip>
                    </div>

                    <div className="hidden w-[92px] shrink-0 sm:block">
                      {temp ? (
                        <Chip icone={temp.icone} tom={temp.tom}>
                          {temp.rotulo}
                        </Chip>
                      ) : null}
                    </div>

                    <span title={dono?.nome ?? "Sem corretor"} className="hidden shrink-0 sm:block">
                      <Avatar texto={dono?.iniciais ?? "?"} foto={dono?.foto} tom="acao" className="size-8 text-[11px]" />
                    </span>

                    <span className="hidden w-20 shrink-0 text-right text-[12px] tabular-nums text-[#8aa3b3] xl:block">
                      {new Date(l.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
                    </span>

                    <CaretRight className="size-4 shrink-0 text-[#b9cfdc] transition-colors group-hover:text-[#2a7ca8]" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {lista.length === 0 && <Vazio titulo="Nenhum lead aqui" texto="Troque a aba ou limpe a busca." />}
        </Cartao>

        <p className={cn("flex flex-wrap items-center gap-4 px-2 text-[12px] text-[#5b7284]")}>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-[#d64545]" /> esperando resposta
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
        </p>
      </CorpoOpa>
    </>
  );
}
