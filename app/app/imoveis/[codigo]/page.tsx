import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, carregarImoveis, carregarLeads } from "@/lib/opa/dados";
import { afinidade, AFINIDADE_MINIMA, fotoUrl, precoCheio, precoPrincipal } from "@/lib/opa/imoveis";
import {
  ArrowLeft,
  ArrowSquareOut,
  Bed,
  Buildings,
  CaretRight,
  Fire,
  HouseLine,
  IdentificationCard,
  Key,
  Lock,
  MapPin,
  Notepad,
  Receipt,
  Ruler,
  Snowflake,
  Sparkle,
  Tag,
  Target,
  Thermometer,
  Trophy,
  UserPlus,
} from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../../_opa/cabecalho";
import { IlustraCasa } from "../../_opa/ilustracoes";
import { Avatar, BotaoPilula, Cartao, Chip, IconeRedondo, TituloBloco, Vazio, iniciaisDe, type Icone } from "../../_opa/ui";

export const dynamic = "force-dynamic";

const TEMPERATURA: Record<string, { icone: Icone; tom: "alerta" | "aviso" | "claro"; rotulo: string }> = {
  quente: { icone: Fire, tom: "alerta", rotulo: "Quente" },
  morno: { icone: Thermometer, tom: "aviso", rotulo: "Morno" },
  frio: { icone: Snowflake, tom: "claro", rotulo: "Frio" },
};

export default async function ImovelPage({ params }: { params: Promise<{ codigo: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const { codigo } = await params;
  const [imoveis, leads, equipe] = await Promise.all([carregarImoveis(org.orgId), carregarLeads(org.orgId), carregarEquipe(org.orgId)]);
  const imovel = imoveis.find((i) => i.codigo === codigo);
  if (!imovel) notFound();
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));

  const entraram = leads.filter((l) => l.imoveisInteresse.includes(imovel.codigo));
  const combinam = leads
    .filter((l) => !l.imoveisInteresse.includes(imovel.codigo))
    .map((l) => ({ lead: l, a: afinidade(imovel, { ...l.campos, imovelEntrada: porCodigo.get(l.imovelCodigo ?? "") ?? null }) }))
    .filter((x) => x.a.pontos >= AFINIDADE_MINIMA)
    .sort((x, y) => y.a.pontos - x.a.pontos);

  const fotos = imovel.fotos
    .slice(0, 5)
    .map((_, n) => fotoUrl(imovel, n, n === 0 ? "full" : "card"))
    .filter((f): f is string => Boolean(f));
  const captador = equipe.get(imovel.captador_user_id ?? "");
  const vendido = imovel.status === "vendido";

  const dados: Array<[Icone, string, string | null]> = [
    [HouseLine, "Tipo", imovel.tipo ? imovel.tipo[0]!.toUpperCase() + imovel.tipo.slice(1) : null],
    [Target, "Finalidade", imovel.finalidade],
    [MapPin, "Bairro", imovel.bairro ? `${imovel.bairro} · ${imovel.regiao}` : null],
    [Bed, "Suítes", imovel.suites != null ? String(imovel.suites) : null],
    [Ruler, "Área construída", imovel.area_m2 ? `${Math.round(Number(imovel.area_m2))} m²` : null],
    [Ruler, "Terreno", imovel.area_terreno_m2 ? `${Math.round(Number(imovel.area_terreno_m2)).toLocaleString("pt-BR")} m²` : null],
    [Buildings, "Condomínio", imovel.condominio_cents ? `${precoCheio(imovel.condominio_cents)}/mês` : null],
    [Receipt, "IPTU", imovel.iptu_cents ? `${precoCheio(imovel.iptu_cents)}/ano` : null],
    [Key, "Locação", imovel.preco_locacao_cents ? `${precoCheio(imovel.preco_locacao_cents)}/mês` : null],
    [IdentificationCard, "Captador", captador?.nome ?? null],
  ];

  return (
    <>
      <CabecalhoOpa secao="Carteira de imóveis" titulo={imovel.codigo} subtitulo={imovel.titulo} icone={HouseLine} equipe={false}>
        <BotaoPilula href="/app/imoveis" icone={ArrowLeft}>
          Carteira
        </BotaoPilula>
      </CabecalhoOpa>
      <CorpoOpa>
        {fotos.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-4 md:grid-rows-2">
            {fotos.map((src, n) => (
              // eslint-disable-next-line @next/next/no-img-element -- fotos do R2 da OPA
              <img
                key={src}
                src={src}
                alt={imovel.titulo}
                loading={n === 0 ? "eager" : "lazy"}
                className={
                  n === 0
                    ? `h-72 w-full rounded-[32px] object-cover md:col-span-2 md:row-span-2 md:h-[440px] ${vendido ? "grayscale" : ""}`
                    : "hidden h-[214px] w-full rounded-[28px] object-cover md:block"
                }
              />
            ))}
          </div>
        ) : (
          <Cartao bloco className="flex justify-center">
            <IlustraCasa className="max-w-xs" />
          </Cartao>
        )}

        <div className="grid gap-5 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
            <Cartao bloco>
              <TituloBloco icone={Notepad} titulo="Dados para a conversa" sub="O que preenche o Kit de mensagens" />
              <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dados
                  .filter(([, , v]) => v)
                  .map(([I, k, v]) => (
                    <div key={k} className="flex items-center gap-3 rounded-[20px] bg-[#f2f6f9] p-3">
                      <IconeRedondo icone={I} tamanho="sm" className="bg-white" />
                      <div className="min-w-0">
                        <dt className="text-[12px] text-[#5b7284]">{k}</dt>
                        <dd className="truncate text-[14px] font-semibold text-[#0a2d40]">{v}</dd>
                      </div>
                    </div>
                  ))}
              </dl>
              {imovel.caracteristicas.length > 0 && (
                <div className="mt-6 border-t border-[#eef3f6] pt-5">
                  <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[#5b7284]">
                    <Tag className="size-4" /> Características
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {imovel.caracteristicas.map((c) => (
                      <Chip key={c} tom="claro">
                        {c}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </Cartao>

            {imovel.descricao && (
              <Cartao bloco>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <TituloBloco icone={Notepad} titulo="Descrição do anúncio" sub="O texto que está no site" />
                    <CaretRight className="size-5 shrink-0 text-[#8aa3b3] transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-5 whitespace-pre-line text-[14px] leading-relaxed text-[#34566b]">{imovel.descricao}</p>
                </details>
              </Cartao>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
            <Cartao escuro bloco className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                {imovel.off_market && (
                  <Chip icone={Lock} tom="acao">
                    Off market
                  </Chip>
                )}
                {vendido && (
                  <Chip icone={Trophy} tom="ok">
                    Vendido
                  </Chip>
                )}
                <Chip icone={MapPin} className="bg-white/10 text-white">
                  {imovel.bairro}
                </Chip>
              </div>
              <div>
                <p className="text-[13px] text-white/60">Valor pedido</p>
                <p className="mt-1 text-[44px] font-light leading-none tracking-[-0.045em] tabular-nums">{precoPrincipal(imovel)}</p>
              </div>
              {imovel.off_market ? (
                <p className="rounded-[18px] bg-white/10 px-4 py-3 text-[13px] text-white/80">
                  Só por link reservado, sem foto solta, sem portal e sem post. Quem entra por ele já ganha a etiqueta de comprador off market.
                </p>
              ) : imovel.url_site ? (
                <a
                  href={imovel.url_site}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
                >
                  <ArrowSquareOut className="size-5" /> Ver no site
                </a>
              ) : null}
            </Cartao>

            <Cartao bloco>
              <TituloBloco icone={UserPlus} titulo="Entraram por este imóvel" sub={`${entraram.length} ${entraram.length === 1 ? "lead" : "leads"}`} />
              {entraram.length > 0 ? (
                <ul className="mt-4 flex flex-col">
                  {entraram.map((l) => {
                    const t = TEMPERATURA[l.copiloto.temperatura ?? ""];
                    return (
                      <li key={l.id}>
                        <Link href={`/app/leads/${l.id}`} className="flex items-center gap-3 rounded-[20px] px-2 py-2.5 hover:bg-[#f2f6f9]">
                          <Avatar texto={iniciaisDe(l.nome)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-[#0a2d40]">{l.nome}</p>
                            <p className="truncate text-[12px] text-[#5b7284]">
                              {l.etapa.nome} · {equipe.get(l.donoId ?? "")?.nome.split(" ")[0] ?? "sem corretor"}
                            </p>
                          </div>
                          {t && <t.icone className={`size-4 shrink-0 ${t.tom === "alerta" ? "text-[#b42318]" : t.tom === "aviso" ? "text-[#9a5b00]" : "text-[#2a7ca8]"}`} aria-label={t.rotulo} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Vazio titulo="Ninguém entrou por ele ainda" />
              )}
            </Cartao>

            <Cartao bloco>
              <TituloBloco icone={Sparkle} titulo="Compradores que combinam" sub="Bairro, faixa, suítes e o que não abrem mão" />
              {combinam.length > 0 ? (
                <ul className="mt-4 flex flex-col">
                  {combinam.slice(0, 8).map(({ lead, a }) => (
                    <li key={lead.id}>
                      <Link href={`/app/leads/${lead.id}`} className="flex items-center gap-3 rounded-[20px] px-2 py-2.5 hover:bg-[#f2f6f9]">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e7f0f5] text-[15px] font-light tabular-nums text-[#12455f]">
                          {a.pontos}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-[#0a2d40]">{lead.nome}</p>
                          <p className="truncate text-[12px] text-[#5b7284]">{a.motivos.slice(0, 3).join(", ")}</p>
                        </div>
                        <CaretRight className="size-4 shrink-0 text-[#b9cfdc]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vazio titulo={`Ninguém acima de ${AFINIDADE_MINIMA}`} texto="Quando um lead novo combinar, ele aparece aqui." />
              )}
            </Cartao>
          </div>
        </div>
      </CorpoOpa>
    </>
  );
}
