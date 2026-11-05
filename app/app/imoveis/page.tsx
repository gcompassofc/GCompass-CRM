import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarImoveis, carregarLeads, configDaOrg } from "@/lib/opa/dados";
import { afinidade, precoPrincipal } from "@/lib/opa/imoveis";
import { Bed, Buildings, Globe, HouseLine, Lock, MagnifyingGlass, MapPin, Ruler, Sparkle, Sun, Trophy, UserPlus, XCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FotoImovel } from "../_opa/componentes";
import { IlustraPredios } from "../_opa/ilustracoes";
import { AbasPilula, Cartao, CartaoNumero, Chip, Vazio, type Icone } from "../_opa/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carteira de imóveis" };

const REGIOES: Array<[string | undefined, string, Icone]> = [
  [undefined, "Todas", Globe],
  ["Sul", "Sul", Sun],
  ["Norte", "Norte", MapPin],
  ["Centro e Vila", "Centro e Vila", Buildings],
];

export default async function ImoveisPage({
  searchParams,
}: {
  searchParams: Promise<{ regiao?: string; q?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const { regiao, q } = await searchParams;
  const gestor = user.is_platform_admin || org.role === "manager" || org.role === "admin";
  const [imoveis, leads, config] = await Promise.all([carregarImoveis(org.orgId), carregarLeads(org.orgId), configDaOrg(org.orgId)]);

  const busca = (q ?? "").trim().toLowerCase();
  const daBusca = imoveis.filter(
    (i) => !busca || [i.codigo, i.titulo, i.bairro ?? ""].some((t) => t.toLowerCase().includes(busca)),
  );
  const lista = daBusca.filter((i) => !regiao || i.regiao === regiao);

  // Leads que entraram pelo imóvel e compradores abertos que combinam com ele.
  const entradas = new Map<string, number>();
  for (const l of leads) for (const c of l.imoveisInteresse) entradas.set(c, (entradas.get(c) ?? 0) + 1);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const combinam = new Map<string, number>();
  for (const i of lista) {
    let n = 0;
    for (const l of leads) {
      if (l.imoveisInteresse.includes(i.codigo)) continue;
      const a = afinidade(i, { ...l.campos, imovelEntrada: porCodigo.get(l.imovelCodigo ?? "") ?? null }, config.cruzamento.pesos);
      if (a.pontos >= config.cruzamento.minimo) n++;
    }
    combinam.set(i.codigo, n);
  }

  const ativos = imoveis.filter((i) => i.status !== "vendido");
  const offMarket = imoveis.filter((i) => i.off_market).length;
  const comLead = imoveis.filter((i) => (entradas.get(i.codigo) ?? 0) > 0).length;

  const link = (r?: string) => {
    const p = new URLSearchParams();
    if (r) p.set("regiao", r);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/app/imoveis${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <CabecalhoOpa
        titulo="Carteira de imóveis"
        subtitulo="Os mesmos imóveis do site da OPA, com quem combina com cada um"
        icone={HouseLine}
        equipe={false}
      />
      <CorpoOpa>
        {/* No celular a lista vem primeiro; o resumo aparece a partir do tablet. */}
        {gestor && <div className="hidden gap-5 sm:grid sm:grid-cols-3">
          <CartaoNumero
            icone={HouseLine}
            rotulo="No acervo"
            valor={ativos.length}
            contexto={`${imoveis.length - ativos.length} vendidos fora da conta`}
            ilustracao={<IlustraPredios />}
          />
          <CartaoNumero icone={UserPlus} rotulo="Com lead interessado" valor={comLead} contexto="imóveis que trouxeram alguém" />
          <CartaoNumero icone={Lock} rotulo="Off market" valor={offMarket} contexto="só por link reservado" />
        </div>}

        <div data-tour="imoveis-regioes" className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={REGIOES.map(([r, rotulo, icone]) => ({
              href: link(r),
              rotulo,
              icone,
              contagem: daBusca.filter((i) => !r || i.regiao === r).length,
              ativo: (regiao ?? undefined) === r,
            }))}
          />
          <form data-tour="imoveis-busca" className="relative h-11 w-full sm:w-72" action="/app/imoveis">
            {regiao && <input type="hidden" name="regiao" value={regiao} />}
            <MagnifyingGlass className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Código, bairro ou nome"
              className="h-full w-full rounded-full bg-white pl-10 pr-4 text-[14px] text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
            />
          </form>
        </div>

        {q && (
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-[#5b7284]">
            <Chip icone={MagnifyingGlass} tom="claro">
              “{q}”
            </Chip>
            {lista.length} {lista.length === 1 ? "imóvel" : "imóveis"}
            <Link
              href={regiao ? `/app/imoveis?regiao=${encodeURIComponent(regiao)}` : "/app/imoveis"}
              className="inline-flex items-center gap-1 font-semibold text-[#2a7ca8]"
            >
              <XCircle className="size-4" /> Limpar busca
            </Link>
          </div>
        )}

        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((i) => {
            const n = entradas.get(i.codigo) ?? 0;
            const c = combinam.get(i.codigo) ?? 0;
            const vendido = i.status === "vendido";
            return (
              <li key={i.id}>
                <Link
                  href={`/app/imoveis/${i.codigo}`}
                  data-tour="imoveis-card"
                  className="group block rounded-[28px] bg-white p-3 shadow-[0_1px_2px_rgba(9,44,62,0.04)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(9,44,62,0.10)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[22px]">
                    <FotoImovel
                      imovel={i}
                      className={cn("size-full transition-transform duration-500 group-hover:scale-[1.03]", vendido && "grayscale")}
                    />
                    <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-[#0a2d40]">{i.codigo}</span>
                      {i.off_market && (
                        <Chip icone={Lock} tom="escuro">
                          Off market
                        </Chip>
                      )}
                      {vendido && (
                        <Chip icone={Trophy} tom="ok">
                          Vendido
                        </Chip>
                      )}
                    </span>
                  </div>
                  <div className="px-2 pb-2 pt-4">
                    <p className="text-[28px] font-light leading-none tracking-[-0.04em] text-[#0a2d40] tabular-nums">{precoPrincipal(i)}</p>
                    <p className="mt-2 line-clamp-1 text-[14px] text-[#34566b]">{i.titulo}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Chip icone={MapPin} tom="neutro">
                        {i.bairro}
                      </Chip>
                      {i.suites ? (
                        <Chip icone={Bed} tom="neutro">
                          {i.suites} {i.suites === 1 ? "suíte" : "suítes"}
                        </Chip>
                      ) : null}
                      {i.area_m2 ? (
                        <Chip icone={Ruler} tom="neutro">
                          {Math.round(Number(i.area_m2))} m²
                        </Chip>
                      ) : null}
                    </div>
                    {(n > 0 || c > 0) && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#eef3f6] pt-3">
                        {n > 0 && (
                          <Chip icone={UserPlus} tom="claro">
                            {n} {n === 1 ? "lead" : "leads"}
                          </Chip>
                        )}
                        {c > 0 && (
                          <Chip icone={Sparkle} tom="claro">
                            {c} {c === 1 ? "combina" : "combinam"}
                          </Chip>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {lista.length === 0 && (
          <Cartao bloco>
            <Vazio ilustracao={<IlustraPredios />} titulo="Nenhum imóvel aqui" texto="Troque a região ou limpe a busca." />
          </Cartao>
        )}
      </CorpoOpa>
    </>
  );
}
