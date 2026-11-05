import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { quandoVolta, situacaoDoRelogio } from "@/lib/opa/atendimento";
import { carregarConfig } from "@/lib/opa/config";
import {
  carregarEquipe,
  carregarImoveis,
  carregarLeads,
  filtrarCorretor,
  proximoNaFila,
  tempoCurto,
  type LeadOpa,
  perguntarLeadOuPessoal,
} from "@/lib/opa/dados";
import { precoCompacto, type Imovel } from "@/lib/opa/imoveis";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowsClockwise,
  ChatCircle,
  Check,
  CheckCircle,
  Clock,
  Globe,
  Info,
  ListNumbers,
  Lock,
  Megaphone,
  Timer,
  UserCircle,
  WhatsappLogo,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { AtualizaSozinho } from "../_opa/atualiza-sozinho";
import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FotoImovel } from "../_opa/componentes";
import { IlustraCalma } from "../_opa/ilustracoes";
import { AbasPilula, Avatar, BarraHachurada, Cartao, Chip, IconeRedondo, Vazio, iniciaisDe } from "../_opa/ui";
import { BotaoEnvio, FormComRetorno } from "../_opa/form-com-retorno";
import { marcarRespondido } from "../leads/actions";
import { LeadOuPessoal } from "../leads/[id]/_pessoal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fila de atendimento" };

type Aba = "todos" | "esperando" | "pago" | "organico";

/** Quem espera há mais tempo no topo; quem não espera vai para o fim, pela última atividade. */
function ordemDaFila(a: LeadOpa, b: LeadOpa): number {
  const ea = a.conversa?.esperandoMin;
  const eb = b.conversa?.esperandoMin;
  if (ea != null && eb != null) return eb - ea;
  if (ea != null) return -1;
  if (eb != null) return 1;
  return Date.parse(b.conversa?.ultimaEm ?? b.criadoEm) - Date.parse(a.conversa?.ultimaEm ?? a.criadoEm);
}

type Prazos = { pago_min: number; organico_min: number; avisos_pago: number[]; avisos_organico: number[] };

/** Botão redondo "Respondi": o lead desce para o fim até escrever de novo. */
function Respondi({ leadId, escuro }: { leadId: string; escuro?: boolean }) {
  return (
    <FormComRetorno action={marcarRespondido} sucesso="Marcado como respondido. O lead desceu na fila.">
      <input type="hidden" name="leadId" value={leadId} />
      <BotaoEnvio
        title="Respondi"
        enviando="Salvando"
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors",
          escuro ? "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]" : "bg-[#e5f3ea] text-[#1d6b43] hover:bg-[#cdebd9]",
        )}
      >
        <Check className="size-4" weight="bold" /> Respondi
      </BotaoEnvio>
    </FormComRetorno>
  );
}

function Selos({ l }: { l: LeadOpa }) {
  return (
    <>
      {l.offMarket && (
        <span title="Off market" aria-label="Off market">
          <Lock weight="fill" className="size-4 shrink-0 text-[#0a2d40]" />
        </span>
      )}
      {l.voltou && l.voltou.vez > 1 && (
        <span title={`Voltou pelo ${l.voltou.vez}º formulário`} aria-label={`Voltou pelo ${l.voltou.vez}º formulário`}>
          <ArrowsClockwise className="size-4 shrink-0 text-[#2a7ca8]" />
        </span>
      )}
      {l.proprio && (
        <span title="Lead próprio" aria-label="Lead próprio">
          <UserCircle weight="fill" className="size-4 shrink-0 text-[#12455f]" />
        </span>
      )}
    </>
  );
}

/** O único cartão escuro: quem responder primeiro. */
function Proximo({ l, im, dono, prazos }: { l: LeadOpa; im?: Imovel; dono?: string; prazos: Prazos }) {
  const prox = proximoNaFila(l, prazos);
  return (
    <Cartao escuro bloco tour="fila-proximo" className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-center">
      <div className="flex min-w-0 items-center gap-5">
        <FotoImovel imovel={im} className="size-[88px] shrink-0 rounded-[22px]" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white/60">Responda primeiro</p>
          <p className="mt-0.5 flex items-center gap-2 truncate text-[26px] font-semibold tracking-[-0.03em]">{l.nome}</p>
          <p className="truncate text-[14px] text-white/65">
            {im ? `${im.codigo} · ${precoCompacto(im.preco_venda_cents)}` : "Sem imóvel ainda"}
            {dono ? ` · com ${dono}` : ""}
          </p>
          {l.conversa?.previa && <p className="mt-2 line-clamp-1 text-[15px] text-white/85">“{l.conversa.previa}”</p>}
        </div>
      </div>
      <div data-tour="fila-prazo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Chip icone={Clock} tom={prox.estourou ? "alerta" : "acao"}>
            {tempoCurto(l.conversa?.esperandoMin ?? 0)}
          </Chip>
          <span className="truncate text-[12px] text-white/60">{prox.texto}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full", prox.estourou ? "bg-[#ff8a80]" : "bg-[#8fc4dd]")} style={{ width: `${Math.max(3, prox.pct)}%` }} />
        </div>
        <div data-tour="fila-acoes" className="flex gap-2">
          <Link
            href={`/app/leads/${l.id}/conversa`}
            prefetch={false}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#2a7ca8] text-[14px] font-semibold text-white hover:bg-[#1f6a93]"
          >
            <WhatsappLogo weight="fill" className="size-4" /> Conversa
          </Link>
          <Respondi leadId={l.id} escuro />
        </div>
        {perguntarLeadOuPessoal(l) && <LeadOuPessoal leadId={l.id} variante="escuro" />}
      </div>
    </Cartao>
  );
}

function CartaoFila({ l, i, im, dono, prazos }: { l: LeadOpa; i: number; im?: Imovel; dono?: string; prazos: Prazos }) {
  const espera = l.conversa?.esperandoMin;
  const prox = espera != null ? proximoNaFila(l, prazos) : null;
  return (
    <Cartao tour="fila-item" className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-center">
      <Link href={`/app/leads/${l.id}`} className="flex min-w-0 items-center gap-4">
        <div className="relative shrink-0">
          {im ? <FotoImovel imovel={im} className="size-[60px] rounded-[18px]" /> : <Avatar texto={iniciaisDe(l.nome)} className="size-[60px] text-[15px]" />}
          <span
            className={cn(
              "absolute -left-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white",
              espera != null ? "bg-[#0a2d40] text-white" : "bg-[#e7f0f5] text-[#5b7284]",
            )}
          >
            {i}
          </span>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[16px] font-semibold text-[#0a2d40]">
            <span className="truncate">{l.nome}</span>
            <Selos l={l} />
          </p>
          <p className="truncate text-[13px] text-[#5b7284]">
            {l.etapa.nome}
            {dono ? ` · ${dono}` : ""}
            {im ? ` · ${im.codigo} · ${precoCompacto(im.preco_venda_cents)}` : ""}
          </p>
          <p className="mt-1 truncate text-[13px] text-[#34566b]">{l.conversa?.previa ? `“${l.conversa.previa}”` : "Sem conversa ainda"}</p>
        </div>
      </Link>

      <div className="min-w-0">
        {prox ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Chip icone={Timer} tom={prox.estourou ? "alerta" : "claro"}>
                {tempoCurto(espera ?? 0)}
              </Chip>
              <Chip icone={l.pago ? Megaphone : Globe} tom="neutro">
                {l.pago ? "Pago" : "Orgânico"}
              </Chip>
            </div>
            <BarraHachurada pct={prox.pct} tom={prox.estourou ? "alerta" : "acao"} className="mt-2.5" />
            <p className="mt-1.5 truncate text-[12px] text-[#5b7284]">{prox.texto}</p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-[#1d6b43]">
            <CheckCircle weight="fill" className="size-4" /> Respondido
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <Link
          href={`/app/leads/${l.id}/conversa`}
          prefetch={false}
          title="Abrir a conversa"
          aria-label="Abrir a conversa"
          className="relative inline-flex size-11 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e7f0f5]"
        >
          <ChatCircle className="size-5" />
          {espera != null && <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-[#e07b2e] ring-2 ring-white" />}
        </Link>
        {espera != null && <Respondi leadId={l.id} />}
      </div>
      {perguntarLeadOuPessoal(l) && <LeadOuPessoal leadId={l.id} variante="pilulas" className="md:col-span-3" />}
    </Cartao>
  );
}

export default async function FilaPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; corretor?: string; tudo?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { aba: abaBruta = "todos", corretor, tudo } = await searchParams;
  const aba: Aba = (["todos", "esperando", "pago", "organico"] as const).includes(abaBruta as Aba) ? (abaBruta as Aba) : "todos";

  const [todos, imoveis, equipe, config] = await Promise.all([
    carregarLeads(org.orgId),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    carregarConfig(await createClient(), org.orgId),
  ]);
  const leads = filtrarCorretor(todos, corretor).sort(ordemDaFila);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const filtro = (l: LeadOpa) =>
    aba === "esperando" ? l.conversa?.esperandoMin != null : aba === "pago" ? l.pago : aba === "organico" ? !l.pago : true;
  const conta = {
    todos: leads.length,
    esperando: leads.filter((l) => l.conversa?.esperandoMin != null).length,
    pago: leads.filter((l) => l.pago).length,
    organico: leads.filter((l) => !l.pago).length,
  };
  const lista = leads.filter(filtro);
  const aguardando = lista.filter((l) => l.conversa?.esperandoMin != null);
  const respondidos = lista.filter((l) => l.conversa?.esperandoMin == null);
  const [primeiro, ...resto] = aguardando;
  // A fila desenha os 30 mais urgentes de cada bloco; "Ver todos" abre o resto.
  // Com 1.500 leads abertos a página passava de 4 MB e 8 segundos.
  const LIMITE = 30;
  const mostrarTudo = tudo === "1";
  const restoVisivel = mostrarTudo ? resto : resto.slice(0, LIMITE);
  const respondidosVisiveis = mostrarTudo ? respondidos : respondidos.slice(0, LIMITE);
  const escondidos = resto.length - restoVisivel.length + respondidos.length - respondidosVisiveis.length;
  const pz = config.prazos;
  const nomeDono = (l: LeadOpa) => equipe.get(l.donoId ?? "")?.nome.split(" ")[0];
  // Fora do horário o relógio para; sem dizer isso, o corretor acha que a fila travou.
  const agora = new Date().getTime();
  const relogio = situacaoDoRelogio(agora, config.horario);

  const link = (a: Aba, comTudo = false) => {
    const p = new URLSearchParams();
    if (a !== "todos") p.set("aba", a);
    if (corretor) p.set("corretor", corretor);
    if (comTudo) p.set("tudo", "1");
    return `/app/fila${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <CabecalhoOpa icone={ListNumbers} titulo="Fila de atendimento" subtitulo="Quem espera há mais tempo fica no topo" />
      <CorpoOpa>
        <AtualizaSozinho />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={[
              { href: link("todos"), rotulo: "Todos", icone: ListNumbers, contagem: conta.todos, ativo: aba === "todos" },
              { href: link("esperando"), rotulo: "Esperando", icone: Clock, contagem: conta.esperando, ativo: aba === "esperando" },
              { href: link("pago"), rotulo: "Pago", icone: Megaphone, contagem: conta.pago, ativo: aba === "pago" },
              { href: link("organico"), rotulo: "Orgânico", icone: Globe, contagem: conta.organico, ativo: aba === "organico" },
            ]}
          />
          <details className="group relative">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#34566b] hover:bg-[#e7f0f5] [&::-webkit-details-marker]:hidden">
              <Info className="size-4 text-[#2a7ca8]" /> Como a fila funciona
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[min(92vw,380px)] rounded-[24px] bg-white p-5 text-[13px] leading-relaxed text-[#34566b] shadow-[0_18px_44px_rgba(9,44,62,0.16)]">
              <p className="flex items-start gap-2">
                <ListNumbers className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Mais tempo sem resposta fica no topo. Respondeu, desce para o fim; se o lead escrever de novo, volta a subir.
              </p>
              <p className="mt-2 flex items-start gap-2">
                <Megaphone className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Pago: {tempoCurto(pz.pago_min)}, avisos aos {pz.avisos_pago.map((a) => `${a} min`).join(" e ")}.
              </p>
              <p className="mt-2 flex items-start gap-2">
                <Globe className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Orgânico: {tempoCurto(pz.organico_min)}, avisos aos {pz.avisos_organico.map((a) => tempoCurto(a)).join(", ")}.
              </p>
              <p className="mt-2 flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> O relógio para fora do horário de atendimento.
              </p>
            </div>
          </details>
        </div>

        {!relogio.aberto && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-[20px] bg-[#e7f0f5] px-4 py-3 text-[14px] leading-relaxed text-[#12455f]"
          >
            <Clock className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" />
            <span>
              Fora do horário de atendimento. O relógio está parado e volta a contar {quandoVolta(relogio.voltaMs, agora)}.
            </span>
          </p>
        )}

        {primeiro ? (
          <Proximo l={primeiro} im={porCodigo.get(primeiro.imovelCodigo ?? "")} dono={nomeDono(primeiro)} prazos={pz} />
        ) : (
          <Cartao bloco>
            <Vazio ilustracao={<IlustraCalma />} titulo="Ninguém esperando resposta" texto="Quando um lead escrever, ele aparece aqui primeiro." />
          </Cartao>
        )}

        {resto.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 px-1">
              <IconeRedondo icone={Clock} tamanho="sm" />
              <p className="text-[15px] font-semibold text-[#0a2d40]">Na fila</p>
              <span className="text-[13px] text-[#5b7284]">{resto.length}</span>
            </div>
            {restoVisivel.map((l, i) => (
              <CartaoFila key={l.id} l={l} i={i + 2} im={porCodigo.get(l.imovelCodigo ?? "")} dono={nomeDono(l)} prazos={pz} />
            ))}
          </section>
        )}

        {respondidos.length > 0 && (
          <details className="group" open={aba !== "todos" && aba !== "esperando" && aguardando.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-1 [&::-webkit-details-marker]:hidden">
              <IconeRedondo icone={CheckCircle} tom="ok" tamanho="sm" />
              <p className="text-[15px] font-semibold text-[#0a2d40]">Já respondidos</p>
              <span className="text-[13px] text-[#5b7284]">{respondidos.length}</span>
              <span className="ml-1 text-[13px] font-medium text-[#2a7ca8] group-open:hidden">mostrar</span>
              <span className="ml-1 hidden text-[13px] font-medium text-[#2a7ca8] group-open:inline">esconder</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {respondidosVisiveis.map((l, i) => (
                <CartaoFila key={l.id} l={l} i={aguardando.length + i + 1} im={porCodigo.get(l.imovelCodigo ?? "")} dono={nomeDono(l)} prazos={pz} />
              ))}
            </div>
          </details>
        )}

        {escondidos > 0 && (
          <Link
            href={link(aba, true)}
            className="inline-flex h-11 items-center justify-center self-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#12455f] hover:bg-[#e7f0f5]"
          >
            Ver todos ({escondidos} a mais)
          </Link>
        )}
      </CorpoOpa>
    </>
  );
}
