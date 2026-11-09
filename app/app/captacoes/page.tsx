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
import { AbasPilula, Avatar, Cartao, CartaoNumero, Chip, TituloBloco, Vazio, type Icone } from "../_opa/ui";
import { ImportarDoRadar } from "./_componentes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captações do Radar" };

/** Quantas linhas a lista mostra antes do "Ver mais" (padrão das listas da OPA). */
const VISIVEIS = 4;

const ABAS: Array<[AbaRadar, string, Icone]> = [
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
  const agora = Date.now();

  const linhas = cards.map((c) => {
    const s = situacaoRadar({ status: c.status, etapaSlug: c.etapa.slug, ultimoMovimento: c.ultimoMovimento, enviadoEm: c.radar.enviado_em }, agora, prazo);
    return { c, s, aba: abaDoCard(s, c.etapa.slug), dias: diasParado(c, agora) };
  });
  const porAba = (a: AbaRadar) => linhas.filter((l) => l.aba === a);
  const aba: AbaRadar = ABAS.some(([k]) => k === abaPedida) ? (abaPedida as AbaRadar) : "agir";
  const lista = porAba(aba).sort((x, y) => y.dias - x.dias || Date.parse(y.c.radar.enviado_em) - Date.parse(x.c.radar.enviado_em));
  const mostrar = mais ? lista : lista.slice(0, VISIVEIS);

  const link = (p: { aba?: string; mais?: boolean }) => {
    const q = new URLSearchParams();
    if ((p.aba ?? aba) !== "agir") q.set("aba", p.aba ?? aba);
    if (corretor && gestor) q.set("corretor", corretor);
    if (p.mais) q.set("mais", "1");
    const s = q.toString();
    return `/app/captacoes${s ? `?${s}` : ""}`;
  };

  const novas = linhas.filter((l) => l.s === "nova").length;
  const pedem = linhas.filter((l) => l.s === "lembrar" || l.s === "prazo").length;

  // Placar da equipe (só gestor, com a equipe toda à vista).
  const placar = gestor && !corretor
    ? [...new Set(cards.map((c) => c.donoId).filter((x): x is string => Boolean(x)))]
        .map((id) => {
          const m = linhas.filter((l) => l.c.donoId === id);
          return {
            pessoa: equipe.get(id),
            recebeu: m.length,
            abertos: m.filter((l) => l.aba === "agir" || l.aba === "andando").length,
            captou: m.filter((l) => l.s === "captado").length,
            parados: m.filter((l) => l.s === "prazo").length,
          };
        })
        .sort((a, b) => (a.pessoa?.nome ?? "").localeCompare(b.pessoa?.nome ?? ""))
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
            itens={ABAS.map(([k, rotulo, icone]) => ({ href: link({ aba: k }), rotulo, icone, contagem: porAba(k).length, ativo: k === aba }))}
          />
          <Link
            href="/app/pipeline?p=captacao"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
          >
            <Kanban className="size-4" /> Ver no funil
          </Link>
        </div>

        <Cartao bloco className="px-4 py-3 sm:px-5">
          {lista.length === 0 ? (
            <Vazio
              titulo={aba === "agir" ? "Nada pedindo ação agora" : "Nada nesta aba"}
              texto={cards.length === 0 ? (gestor ? "Importe o registro do Radar para os imóveis aparecerem aqui." : "Quando o Radar separar imóveis para você, eles aparecem aqui.") : "Quando houver, aparece aqui."}
            />
          ) : (
            <ul>
              {mostrar.map(({ c, s, dias }) => (
                <LinhaCaptacao key={c.id} c={c} s={s} dias={dias} dono={gestor ? equipe.get(c.donoId ?? "") : undefined} />
              ))}
            </ul>
          )}
          {!mais && lista.length > VISIVEIS && (
            <Link href={link({ mais: true })} className="inline-flex px-3 py-3 text-[14px] font-semibold text-[#2a7ca8]">
              Ver mais {lista.length - VISIVEIS}
            </Link>
          )}
        </Cartao>

        {placar.length > 0 && (
          <Cartao bloco>
            <TituloBloco icone={Target} titulo="Radar por corretor" sub={`Parado = ${prazo} dias ou mais sem anotação. Toque no nome para ver só os dele.`} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="text-[12px] text-[#5b7284]">
                    <th className="px-2 py-2 font-medium">Corretor</th>
                    <th className="px-2 py-2 font-medium">Recebeu</th>
                    <th className="px-2 py-2 font-medium">Em aberto</th>
                    <th className="px-2 py-2 font-medium">Captou</th>
                    <th className="px-2 py-2 font-medium">Parados</th>
                  </tr>
                </thead>
                <tbody>
                  {placar.map((p) => (
                    <tr key={p.pessoa?.id ?? p.recebeu} className="border-t border-[#eef3f6] text-[14px] text-[#0a2d40]">
                      <td className="px-2 py-3">
                        <Link href={`/app/captacoes?corretor=${p.pessoa?.id ?? ""}`} className="inline-flex items-center gap-2.5 font-semibold hover:text-[#2a7ca8]">
                          <Avatar texto={p.pessoa?.iniciais ?? "?"} foto={p.pessoa?.foto} className="size-8" />
                          {p.pessoa?.nome ?? "Fora da equipe"}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-[20px] font-light tabular-nums">{p.recebeu}</td>
                      <td className="px-2 py-3 text-[20px] font-light tabular-nums">{p.abertos}</td>
                      <td className="px-2 py-3">{p.captou ? <Chip icone={Trophy} tom="ok">{p.captou}</Chip> : <Chip>0</Chip>}</td>
                      <td className="px-2 py-3">{p.parados ? <Chip icone={ClockCountdown} tom="alerta">{p.parados}</Chip> : <Chip tom="ok">0</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
