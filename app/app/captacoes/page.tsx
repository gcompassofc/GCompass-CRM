import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { carregarEquipe } from "@/lib/opa/dados";
import { abaDoCard, diasParado, LEMBRETE_DIAS, precoCurto, situacaoRadar, type AbaRadar, type SituacaoRadar } from "@/lib/opa/radar-captacoes";
import { carregarCardsRadar, type CardRadar } from "@/lib/opa/radar-captacoes-dados";
import { createClient } from "@/lib/supabase/server";
import {
  Archive,
  ArrowsClockwise,
  Buildings,
  Check,
  ClockCountdown,
  HouseLine,
  Kanban,
  Prohibit,
  Sparkle,
  Target,
  Trophy,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { AbasPilula, Avatar, Cartao, CartaoNumero, Chip, Vazio, type Icone } from "../_opa/ui";
import { ImportarDoRadar } from "./_componentes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captações do Radar" };

/** Quantas linhas a lista mostra antes do "Ver mais" (padrão das listas da OPA). */
const VISIVEIS = 4;

/** "todos" só existe para o gestor: todos os imóveis, separados por corretor. */
type Aba = AbaRadar | "todos";

const ABAS: Array<[Aba, string, Icone]> = [
  ["todos", "Todos", Target],
  ["agir", "Para agir", ClockCountdown],
  ["andando", "Em andamento", ArrowsClockwise],
  ["captados", "Captados", Trophy],
  ["encerrados", "Encerrados", Archive],
];

function seloDaSituacao(s: SituacaoRadar, dias: number, motivo: string | null) {
  if (s === "nova") return <Chip icone={Sparkle} tom="claro">Chegou hoje</Chip>;
  if (s === "prazo") return <Chip icone={ClockCountdown} tom="alerta">{dias} dias sem retorno</Chip>;
  if (s === "lembrar") return <Chip icone={ClockCountdown} tom="aviso">Parada há {dias} dias</Chip>;
  if (s === "captado") return <Chip icone={Trophy} tom="ok">Captado</Chip>;
  if (s === "perdido") return <Chip icone={Prohibit} tom="neutro">{(motivo ?? "Não serve").replace(/^Radar: /, "")}</Chip>;
  return <Chip icone={Check} tom="ok">{dias === 0 ? "Em dia" : `Retorno há ${dias} ${dias === 1 ? "dia" : "dias"}`}</Chip>;
}

export default async function CaptacoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; corretor?: string; mais?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const gestor = Boolean(user.is_platform_admin) || org.role === "manager" || org.role === "admin";
  const { aba: abaPedida, corretor, mais } = await searchParams;

  const supabase = await createClient();
  // O RLS já limita o corretor aos cards dele; o filtro "Equipe toda / corretor" é do gestor.
  const [cards, equipe, config] = await Promise.all([
    carregarCardsRadar(supabase, org.orgId, { donoId: gestor ? corretor || null : user.id }),
    carregarEquipe(org.orgId),
    carregarConfig(supabase, org.orgId),
  ]);
  const prazo = config.captacao.devolutiva_dias;
  const agora = new Date().getTime();

  const linhas = cards.map((c) => {
    const s = situacaoRadar({ status: c.status, etapaSlug: c.etapa.slug, ultimoMovimento: c.ultimoMovimento, enviadoEm: c.radar.enviado_em }, agora, prazo);
    return { c, s, aba: abaDoCard(s, c.etapa.slug), dias: diasParado(c, agora) };
  });
  const porAba = (a: Aba) => (a === "todos" ? linhas : linhas.filter((l) => l.aba === a));
  // Gestor e administrador abrem em "Todos", separado por corretor; o corretor, no que pede ação.
  const visaoEquipe = gestor && !corretor;
  const abas = ABAS.filter(([k]) => k !== "todos" || gestor);
  const padrao: Aba = gestor ? "todos" : "agir";
  const aba: Aba = abas.some(([k]) => k === abaPedida) ? (abaPedida as Aba) : padrao;
  const lista = porAba(aba).sort((x, y) => y.dias - x.dias || Date.parse(y.c.radar.enviado_em) - Date.parse(x.c.radar.enviado_em));
  const mostrar = mais ? lista : lista.slice(0, VISIVEIS);

  const link = (p: { aba?: string; mais?: boolean }) => {
    const q = new URLSearchParams();
    if ((p.aba ?? aba) !== padrao) q.set("aba", p.aba ?? aba);
    if (corretor && gestor) q.set("corretor", corretor);
    if (p.mais) q.set("mais", "1");
    const s = q.toString();
    return `/app/captacoes${s ? `?${s}` : ""}`;
  };

  const novas = linhas.filter((l) => l.s === "nova").length;
  const pedem = linhas.filter((l) => l.s === "lembrar" || l.s === "prazo").length;

  // Visão da equipe: um bloco por corretor, com os imóveis dele na aba escolhida.
  const ordem = (x: (typeof linhas)[number], y: (typeof linhas)[number]) =>
    y.dias - x.dias || Date.parse(y.c.radar.enviado_em) - Date.parse(x.c.radar.enviado_em);
  const grupos = visaoEquipe
    ? [...new Set(cards.map((c) => c.donoId ?? ""))]
        .map((id) => {
          const m = linhas.filter((l) => (l.c.donoId ?? "") === id);
          return {
            id,
            pessoa: equipe.get(id),
            itens: m.filter((l) => aba === "todos" || l.aba === aba).sort(ordem),
            recebeu: m.length,
            abertos: m.filter((l) => l.aba === "agir" || l.aba === "andando").length,
            captou: m.filter((l) => l.s === "captado").length,
            parados: m.filter((l) => l.s === "prazo").length,
          };
        })
        .sort((a, b) => (a.pessoa?.nome ?? "~").localeCompare(b.pessoa?.nome ?? "~"))
    : [];

  return (
    <>
      <CabecalhoOpa
        secao="Imóveis"
        titulo="Captações do Radar"
        subtitulo={gestor ? "Os imóveis que o Radar separou para cada corretor captar" : "Imóveis que o Radar separou para você captar. Cada passo fica registrado."}
        icone={Target}
      >
        {gestor && <ImportarDoRadar />}
      </CabecalhoOpa>
      <CorpoOpa>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <CartaoNumero icone={Sparkle} rotulo="Chegaram hoje" valor={novas} contexto="enviados nas últimas 24 h" />
          <CartaoNumero
            icone={ClockCountdown}
            rotulo="Pedem retorno"
            valor={pedem}
            alerta={pedem > 0}
            contexto={`${LEMBRETE_DIAS} dias ou mais sem anotação (prazo: ${prazo} dias)`}
          />
          <CartaoNumero icone={ArrowsClockwise} rotulo="Em andamento" valor={porAba("andando").length} contexto="já houve contato" />
          <CartaoNumero icone={Trophy} rotulo="Captados" valor={porAba("captados").length} contexto="viraram imóvel da OPA" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={abas.map(([k, rotulo, icone]) => ({ href: link({ aba: k }), rotulo, icone, contagem: porAba(k).length, ativo: k === aba }))}
          />
          <Link
            href="/app/pipeline?p=captacao"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
          >
            <Kanban className="size-4" /> Ver no funil
          </Link>
        </div>

        {visaoEquipe ? (
          grupos.length === 0 ? (
            <Cartao bloco>
              <Vazio titulo="Nenhum imóvel do Radar ainda" texto="Importe o registro do Radar para os imóveis de cada corretor aparecerem aqui." />
            </Cartao>
          ) : (
            grupos.map((g) => (
              <Cartao key={g.id || "sem-dono"} bloco className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar texto={g.pessoa?.iniciais ?? "?"} foto={g.pessoa?.foto} className="size-10" />
                    <div className="min-w-0">
                      <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[#0a2d40]">{g.pessoa?.nome ?? "Fora da equipe"}</h2>
                      <p className="text-[13px] text-[#5b7284]">
                        Recebeu {g.recebeu} · {g.abertos} em aberto
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.captou > 0 && <Chip icone={Trophy} tom="ok">{g.captou} {g.captou === 1 ? "captado" : "captados"}</Chip>}
                    {g.parados > 0 ? (
                      <Chip icone={ClockCountdown} tom="alerta">{g.parados} {g.parados === 1 ? "parado" : "parados"}</Chip>
                    ) : (
                      <Chip icone={Check} tom="ok">Nenhum parado</Chip>
                    )}
                    {g.id && (
                      <Link href={`/app/captacoes?corretor=${g.id}`} className="ml-1 text-[13px] font-semibold text-[#2a7ca8] hover:underline">
                        Só os dele
                      </Link>
                    )}
                  </div>
                </div>
                {g.itens.length === 0 ? (
                  <p className="px-2 py-3 text-[14px] text-[#5b7284]">Nada nesta aba.</p>
                ) : (
                  <ul>
                    {(mais ? g.itens : g.itens.slice(0, VISIVEIS)).map(({ c, s, dias }) => (
                      <LinhaCaptacao key={c.id} c={c} s={s} dias={dias} />
                    ))}
                  </ul>
                )}
                {!mais && g.itens.length > VISIVEIS && g.id && (
                  <Link
                    href={`/app/captacoes?corretor=${g.id}${aba !== "todos" ? `&aba=${aba}` : ""}&mais=1`}
                    className="inline-flex px-3 py-3 text-[14px] font-semibold text-[#2a7ca8]"
                  >
                    Ver mais {g.itens.length - VISIVEIS}
                  </Link>
                )}
              </Cartao>
            ))
          )
        ) : (
        <Cartao bloco className="px-4 py-3 sm:px-5">
          {gestor && corretor && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
              <p className="text-[15px] font-semibold text-[#0a2d40]">{equipe.get(corretor)?.nome ?? "Corretor"}</p>
              <Link href="/app/captacoes" className="text-[13px] font-semibold text-[#2a7ca8] hover:underline">
                Ver a equipe toda
              </Link>
            </div>
          )}
          {lista.length === 0 ? (
            <Vazio
              titulo={aba === "agir" ? "Nada pedindo ação agora" : "Nada nesta aba"}
              texto={cards.length === 0 ? (gestor ? "Importe o registro do Radar para os imóveis aparecerem aqui." : "Quando o Radar separar imóveis para você, eles aparecem aqui.") : "Quando houver, aparece aqui."}
            />
          ) : (
            <ul>
              {mostrar.map(({ c, s, dias }) => (
                <LinhaCaptacao key={c.id} c={c} s={s} dias={dias} />
              ))}
            </ul>
          )}
          {!mais && lista.length > VISIVEIS && (
            <Link href={link({ mais: true })} className="inline-flex px-3 py-3 text-[14px] font-semibold text-[#2a7ca8]">
              Ver mais {lista.length - VISIVEIS}
            </Link>
          )}
        </Cartao>
        )}
      </CorpoOpa>
    </>
  );
}

function LinhaCaptacao({ c, s, dias, dono }: { c: CardRadar; s: SituacaoRadar; dias: number; dono?: { nome: string; iniciais: string; foto: string | null } }) {
  const apartamento = /apart|flat/i.test(c.radar.tipo ?? "");
  return (
    <li className="border-t border-[#eef3f6] first:border-t-0">
      <Link href={`/app/leads/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-2 py-3.5 hover:bg-[#f6f9fb] sm:flex-nowrap">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
            s === "prazo" ? "bg-[#fdeee3] text-[#a4410e]" : s === "lembrar" ? "bg-[#fdf1dc] text-[#9a5b00]" : "bg-[#e7f0f5] text-[#12455f]",
          )}
        >
          {apartamento ? <Buildings /> : <HouseLine />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{c.titulo}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-[#34566b]">
            <span className="truncate">
              {c.radar.imobiliaria} · {c.radar.codigo} · {c.radar.dist}
            </span>
            {seloDaSituacao(s, dias, c.lostReason)}
          </div>
        </div>
        <div className="ml-14 flex shrink-0 items-center gap-3 sm:ml-0">
          {dono && <Avatar texto={dono.iniciais} foto={dono.foto} className="size-8" />}
          <span className="min-w-[96px] text-right text-[22px] font-light tracking-[-0.04em] text-[#0a2d40] tabular-nums">{precoCurto(c.radar.preco_anunciado)}</span>
          <span className="hidden min-w-[150px] rounded-full bg-[#eef3f6] px-3.5 py-2 text-[13px] text-[#0a2d40] md:inline-flex">{c.etapa.nome || "Sem etapa"}</span>
        </div>
      </Link>
    </li>
  );
}
