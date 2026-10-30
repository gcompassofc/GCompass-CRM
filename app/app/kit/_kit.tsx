"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { fotoUrl, precoCheio } from "@/lib/opa/imoveis";
import { KIT, PERFIS_KIT, type EtapaKit, type ItemKit, type ModuloKit, type PerfilKit } from "@/lib/opa/kit";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Buildings,
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  ChatCircle,
  ChatsCircle,
  ChatText,
  Check,
  Clock,
  Coins,
  Copy,
  FileText,
  Handshake,
  House,
  HouseLine,
  Lightbulb,
  Lock,
  MagnifyingGlass,
  MapPin,
  Microphone,
  PencilSimple,
  Receipt,
  Scales,
  ShieldCheck,
  Sparkle,
  Sun,
  Target,
  UserCircle,
  UsersThree,
  WhatsappLogo,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { IlustraConversa } from "../_opa/ilustracoes";
import { Cartao, Chip, IconeRedondo, TituloBloco, Vazio, type Icone } from "../_opa/ui";

export interface LeadKit {
  id: string;
  nome: string;
  telefone: string | null;
  imovelCodigo: string | null;
  offMarket: boolean;
  valorCents: number | null;
  esperandoMin: number | null;
}

export interface ImovelKit {
  codigo: string;
  titulo: string;
  tipo: string | null;
  bairro: string | null;
  fotos: string[];
  precoVendaCents: number | null;
  precoLocacaoCents: number | null;
  condominioCents: number | null;
  iptuCents: number | null;
  urlSite: string | null;
  offMarket: boolean;
}

type Dados = { corretor: string; lead: string; imovel: string; bairro: string; link: string };

/** Os campos que valem para todas as mensagens (VARS_KIT do protótipo). */
const VARS: Array<[keyof Dados, string, string]> = [
  ["corretor", "Corretor", "seu nome"],
  ["lead", "Nome do lead", "Fernanda"],
  ["imovel", "Imóvel, como você fala dele", "a casa do Julião"],
  ["bairro", "Bairro", "Julião"],
  ["link", "Link do imóvel", "opailhabela.com.br/imovel/..."],
];

/** [bairro], [lead]... entre colchetes usam o mesmo campo das variáveis, sem pedir de novo. */
const VAR_DO_TERMO: Record<string, keyof Dados> = {
  bairro: "bairro",
  lead: "lead",
  nome: "lead",
  imóvel: "imovel",
  imovel: "imovel",
  link: "link",
  corretor: "corretor",
};

// ---------------------------------------------------------------- regras do kit

const vale = (x: { perfis?: PerfilKit[] }, p: PerfilKit) => !x.perfis || x.perfis.includes(p);

function etapasDe(m: ModuloKit, p: PerfilKit): EtapaKit[] {
  const lista = Array.isArray(m.etapas) ? m.etapas : (m.etapas[p] ?? []);
  return lista
    .filter((e) => vale(e, p))
    .map((e) => ({ ...e, itens: e.itens.filter((i) => vale(i, p)) }))
    .filter((e) => e.itens.length > 0);
}

function descDe(m: ModuloKit, p: PerfilKit): string {
  return typeof m.desc === "string" ? m.desc : (m.desc[p] ?? m.desc.todos ?? "");
}

const contar = (m: ModuloKit, p: PerfilKit) => etapasDe(m, p).reduce((s, e) => s + e.itens.length, 0);

/** Como o corretor fala do imóvel: "a casa no Condomínio Ponta da Sela". */
function nomeFalado(i: ImovelKit): string {
  const t = i.titulo.replace(/\s*[-,]\s*Ilhabela\/?SP\s*$/i, "").replace(/\s+/g, " ").trim();
  const tipo = (i.tipo ?? t.split(" ")[0] ?? "").toLowerCase();
  const artigo = tipo.startsWith("casa") ? "a " : tipo.startsWith("apart") || tipo.startsWith("terreno") ? "o " : "";
  return artigo + t.charAt(0).toLowerCase() + t.slice(1);
}

function linkDo(i: ImovelKit): string {
  return i.offMarket ? "link reservado do Painel OPA" : (i.urlSite ?? "");
}

/** O que o cadastro do imóvel já responde dos termos entre colchetes (termosProduto do protótipo). */
function termosDoImovel(i: ImovelKit | undefined): Record<string, string> {
  if (!i) return {};
  const custos = i.condominioCents
    ? `condomínio de ${precoCheio(i.condominioCents)} por mês${i.iptuCents ? ` e IPTU de ${precoCheio(i.iptuCents)} por ano` : ""}`
    : i.iptuCents
      ? `IPTU de ${precoCheio(i.iptuCents)} por ano`
      : "";
  const m: Record<string, string> = {
    valor: i.precoVendaCents ? precoCheio(i.precoVendaCents) : "",
    "condomínio e IPTU, ou custo de manutenção": custos,
    "outros custos": custos,
    "valor de locação": i.precoLocacaoCents ? `${precoCheio(i.precoLocacaoCents)} por mês na locação anual` : "",
    link: linkDo(i),
  };
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v));
}

function perfilDoImovel(i: ImovelKit): PerfilKit {
  return i.offMarket ? "off" : (i.precoVendaCents ?? 0) >= 300_000_000 ? "alto" : "medio";
}

function perfilDoLead(l: LeadKit, i: ImovelKit | undefined): PerfilKit {
  if (l.offMarket || i?.offMarket) return "off";
  return (l.valorCents ?? i?.precoVendaCents ?? 0) >= 300_000_000 ? "alto" : "medio";
}

const PARTES = /(\{\w+\}|\[[^\]]+\])/g;

// ---------------------------------------------------------------- ícones

const ICONE_PERFIL: Record<PerfilKit, Icone> = { medio: House, alto: Buildings, off: Lock };

const ICONE_MODULO: Record<ModuloKit["id"], Icone> = {
  atendimento: ChatsCircle,
  resgate: ArrowsClockwise,
  audio: Microphone,
  objecoes: Scales,
};

/** Ícone de cada momento ou tema, pelo começo do nome (o kit vem do protótipo e não tem ícone). */
const ICONE_ETAPA: Array<[RegExp, Icone]> = [
  [/^primeiro contato/i, ChatCircle],
  [/^diagn/i, Target],
  [/^apresenta/i, HouseLine],
  [/^visita/i, CalendarBlank],
  [/^p[óo]s-visita/i, ChatText],
  [/^proposta/i, Handshake],
  [/^cad[êe]ncia/i, ArrowsClockwise],
  [/^mensagens criativas/i, Lightbulb],
  [/^roteiros/i, Microphone],
  [/^pre[çc]o/i, Coins],
  [/^pagamento/i, Receipt],
  [/^off market/i, Lock],
  [/^tempo/i, Clock],
  [/^im[óo]vel/i, MapPin],
  [/^fam[íi]lia/i, UsersThree],
  [/^documenta/i, FileText],
  [/^confian/i, ShieldCheck],
  [/^patrim/i, ChartLineUp],
  [/^a ilha/i, Sun],
];

function iconeDaEtapa(nome: string, modulo: ModuloKit["id"]): Icone {
  return ICONE_ETAPA.find(([re]) => re.test(nome))?.[1] ?? ICONE_MODULO[modulo] ?? ChatText;
}

// ---------------------------------------------------------------- tela

interface Visivel {
  m: ModuloKit;
  e: EtapaKit;
  it: ItemKit;
}

export function KitCliente({
  corretor,
  leads,
  imoveis,
  leadInicial,
  imovelInicial,
}: {
  corretor: string;
  leads: LeadKit[];
  imoveis: ImovelKit[];
  leadInicial: string | null;
  imovelInicial: string | null;
}) {
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));

  // Estado inicial: o lead (ou imóvel) que veio pelo endereço já preenche tudo.
  const inicio = (() => {
    const l = leads.find((x) => x.id === leadInicial);
    const i = porCodigo.get(l?.imovelCodigo ?? imovelInicial ?? "");
    const dados: Dados = {
      corretor,
      lead: l ? (l.nome.replace(/^Família /, "").split(" ")[0] ?? "") : "",
      imovel: i ? nomeFalado(i) : "",
      bairro: i?.bairro ?? "",
      link: i ? linkDo(i) : "",
    };
    const perfil: PerfilKit = l ? perfilDoLead(l, i) : i ? perfilDoImovel(i) : "medio";
    return { leadId: l?.id ?? "", imovel: i?.codigo ?? "", dados, perfil };
  })();

  const [perfil, setPerfil] = useState<PerfilKit>(inicio.perfil);
  const [mod, setMod] = useState<ModuloKit["id"]>("atendimento");
  const [etapa, setEtapa] = useState(0);
  const [busca, setBusca] = useState("");
  const [leadId, setLeadId] = useState(inicio.leadId);
  const [imovelCod, setImovelCod] = useState(inicio.imovel);
  const [dados, setDados] = useState<Dados>(inicio.dados);
  const [termos, setTermos] = useState<Record<string, string>>({});

  const lead = leads.find((l) => l.id === leadId);
  const imovel = porCodigo.get(imovelCod);
  const doImovel = termosDoImovel(imovel);
  const modulo = KIT.find((m) => m.id === mod) ?? KIT[0]!;
  const etapas = etapasDe(modulo, perfil);
  const etapaAtual = etapas[Math.min(etapa, etapas.length - 1)];

  const visiveis: Visivel[] = (() => {
    const q = busca.trim().toLowerCase();
    if (q) {
      return KIT.flatMap((m) =>
        etapasDe(m, perfil).flatMap((e) =>
          e.itens
            .filter((it) => `${it.t} ${it.o ?? ""} ${it.q ?? ""} ${it.m}`.toLowerCase().includes(q))
            .map((it) => ({ m, e, it })),
        ),
      );
    }
    return etapaAtual ? etapaAtual.itens.map((it) => ({ m: modulo, e: etapaAtual, it })) : [];
  })();

  const valorDoTermo = (t: string): string =>
    termos[t] || doImovel[t] || (VAR_DO_TERMO[t.toLowerCase()] ? dados[VAR_DO_TERMO[t.toLowerCase()]!] : "") || "";

  const textoFinal = (txt: string) =>
    txt.replace(/\{(\w+)\}/g, (s, k: string) => dados[k as keyof Dados] || s).replace(/\[([^\]]+)\]/g, (s, t: string) => valorDoTermo(t) || s);

  // Termos que sobram para o corretor: tira as variáveis e o que o cadastro do imóvel já preenche.
  const todosTermos = [...new Set(visiveis.flatMap((v) => [...v.it.m.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]!)))];
  const termosDoCadastro = todosTermos.filter((t) => doImovel[t]);
  const termosLivres = todosTermos.filter((t) => !VAR_DO_TERMO[t.toLowerCase()] && !doImovel[t]);

  const escolherImovel = (cod: string) => {
    setImovelCod(cod);
    const i = porCodigo.get(cod);
    setDados((d) => ({ ...d, imovel: i ? nomeFalado(i) : "", bairro: i?.bairro ?? "", link: i ? linkDo(i) : "" }));
    if (i) {
      setPerfil(perfilDoImovel(i));
      setEtapa(0);
    }
  };

  const escolherLead = (id: string) => {
    setLeadId(id);
    const l = leads.find((x) => x.id === id);
    if (!l) {
      setDados({ corretor: dados.corretor, lead: "", imovel: "", bairro: "", link: "" });
      setImovelCod("");
      return;
    }
    const i = porCodigo.get(l.imovelCodigo ?? "");
    setImovelCod(i?.codigo ?? "");
    setDados((d) => ({
      ...d,
      lead: l.nome.replace(/^Família /, "").split(" ")[0] ?? "",
      imovel: i ? nomeFalado(i) : "",
      bairro: i?.bairro ?? "",
      link: i ? linkDo(i) : "",
    }));
    setPerfil(perfilDoLead(l, i));
    setEtapa(0);
  };

  const limpar = () => {
    setLeadId("");
    setImovelCod("");
    setTermos({});
    setDados({ corretor, lead: "", imovel: "", bairro: "", link: "" });
  };

  const copiar = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(textoFinal(txt));
      toast.success("Mensagem copiada já personalizada");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  };

  const wa = (txt: string) =>
    lead?.telefone ? `https://wa.me/${lead.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(textoFinal(txt))}` : null;

  const destacar = (txt: string) =>
    txt.split(PARTES).map((parte, n) => {
      const v = parte.match(/^\{(\w+)\}$/);
      if (v) {
        const val = dados[v[1] as keyof Dados];
        return val ? (
          <span key={n} className="rounded-[5px] bg-[#2a7ca8]/12 px-0.5 font-semibold text-[#12455f]">
            {val}
          </span>
        ) : (
          <span key={n} className="rounded-[5px] bg-[#b42318]/10 px-0.5 font-semibold text-[#b42318]">
            {v[1]}
          </span>
        );
      }
      const t = parte.match(/^\[([^\]]+)\]$/);
      if (t) {
        const val = valorDoTermo(t[1]!);
        return val ? (
          <span key={n} className="rounded-[5px] bg-[#2a7ca8]/12 px-0.5 font-semibold text-[#12455f]">
            {val}
          </span>
        ) : (
          <span key={n} className="rounded-[5px] bg-[#b42318]/10 px-0.5 font-semibold text-[#b42318]">
            [{t[1]}]
          </span>
        );
      }
      return <Fragment key={n}>{parte}</Fragment>;
    });

  const campo =
    "h-11 w-full rounded-[14px] border px-3.5 text-[14px] text-[#0a2d40] outline-none transition-colors focus:border-[#2a7ca8] focus:bg-white";
  const cor = (v: string) => (v ? "border-transparent bg-[#e7f0f5]" : "border-dashed border-[#e3a59e] bg-[#fdf3f2]");
  const seletor =
    "h-11 w-full min-w-0 appearance-none rounded-[14px] border border-transparent bg-[#f2f6f9] pl-11 pr-4 text-[14px] text-[#0a2d40] outline-none focus:border-[#8fc4dd] focus:bg-white";
  const foto = imovel ? fotoUrl(imovel, 0) : null;
  const IconeEtapa = etapaAtual ? iconeDaEtapa(etapaAtual.nome, modulo.id) : ChatText;

  return (
    <div className="flex flex-col gap-5">
      {/* Perfil e busca */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Perfil do kit" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
          {PERFIS_KIT.map((p) => {
            const on = p.id === perfil;
            const I = ICONE_PERFIL[p.id];
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setPerfil(p.id);
                  setEtapa(0);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                  on ? "bg-[#0a2d40] text-white" : "text-[#34566b] hover:bg-[#eef3f6]",
                )}
              >
                <I className="size-4" weight={on ? "fill" : "regular"} /> {p.nome}
              </button>
            );
          })}
        </div>
        <label className="relative w-full sm:ml-auto sm:w-80">
          <MagnifyingGlass className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar: balsa, caro, sumiu..."
            aria-label="Buscar mensagem"
            className="h-11 w-full rounded-full border border-transparent bg-white pl-11 pr-4 text-[14px] text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none focus:border-[#8fc4dd]"
          />
        </label>
      </div>

      {/* Módulos do kit */}
      <nav className="inline-flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
        {KIT.map((m) => {
          const on = m.id === mod && !busca;
          const I = ICONE_MODULO[m.id];
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMod(m.id);
                setEtapa(0);
                setBusca("");
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                on ? "bg-[#0a2d40] text-white" : "text-[#34566b] hover:bg-[#eef3f6]",
              )}
            >
              <I className="size-4" weight={on ? "fill" : "regular"} />
              {m.nome}
              <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", on ? "bg-white/15" : "bg-[#eef3f6] text-[#5b7284]")}>
                {contar(m, perfil)}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Personalizar */}
      <Cartao>
        <TituloBloco
          icone={PencilSimple}
          titulo="Personalizar as mensagens"
          sub="Escolha o lead ou o imóvel: vale para todas as mensagens"
          acao={
            <button
              type="button"
              onClick={limpar}
              aria-label="Limpar personalização"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#eef3f6] px-3.5 text-[13px] font-medium text-[#0a2d40] hover:bg-[#e7f0f5]"
            >
              <X className="size-4" aria-hidden /> <span className="hidden sm:inline">Limpar</span>
            </button>
          }
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className="relative">
            <UserCircle className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2a7ca8]" aria-hidden />
            <select aria-label="Escolher lead" value={leadId} onChange={(e) => escolherLead(e.target.value)} className={seletor}>
              <option value="">Escolher lead...</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                  {l.offMarket ? " · off market" : ""}
                </option>
              ))}
            </select>
            <CaretDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
          </label>
          <label className="relative">
            <HouseLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2a7ca8]" aria-hidden />
            <select aria-label="Escolher imóvel" value={imovelCod} onChange={(e) => escolherImovel(e.target.value)} className={seletor}>
              <option value="">Escolher imóvel...</option>
              {imoveis.map((i) => (
                <option key={i.codigo} value={i.codigo}>
                  {i.codigo} · {i.titulo.slice(0, 48)}
                </option>
              ))}
            </select>
            <CaretDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
          </label>
        </div>

        {imovel && (
          <div className="mt-4 flex flex-col gap-3 rounded-[20px] bg-[#f2f6f9] p-3 sm:flex-row sm:items-center">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- fotos do R2 da OPA
              <img src={foto} alt={imovel.titulo} className="h-16 w-24 shrink-0 rounded-2xl object-cover" />
            ) : (
              <div className="h-16 w-24 shrink-0 rounded-2xl bg-[#e7f0f5]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-[#0a2d40]">
                {imovel.offMarket && <Lock weight="fill" className="size-4 shrink-0" aria-label="Off market" />}
                <span className="truncate">
                  {imovel.codigo} · {imovel.titulo}
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {imovel.precoVendaCents ? <Chip icone={Coins}>{precoCheio(imovel.precoVendaCents)}</Chip> : null}
                {imovel.condominioCents ? <Chip>Condomínio {precoCheio(imovel.condominioCents)}/mês</Chip> : null}
                {imovel.iptuCents ? <Chip>IPTU {precoCheio(imovel.iptuCents)}/ano</Chip> : null}
                {imovel.precoLocacaoCents ? <Chip>Locação {precoCheio(imovel.precoLocacaoCents)}/mês</Chip> : null}
              </div>
              {termosDoCadastro.length > 0 && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px] text-[#5b7284]">
                  <Sparkle weight="fill" className="size-3.5 text-[#2a7ca8]" /> Do cadastro, já nas mensagens:
                  {termosDoCadastro.map((t) => (
                    <code key={t} className="rounded-md bg-white px-1.5">
                      [{t}]
                    </code>
                  ))}
                </p>
              )}
            </div>
            <Link
              href={`/app/imoveis/${imovel.codigo}`}
              title="Ver cadastro"
              aria-label="Ver cadastro do imóvel"
              className="flex size-10 shrink-0 items-center justify-center self-end rounded-full bg-white text-[#0a2d40] hover:bg-[#e7f0f5] sm:self-center"
            >
              <ArrowSquareOut className="size-4" />
            </Link>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
          {VARS.map(([k, rotulo, dica]) => (
            <label key={k} className="flex flex-col gap-1.5 text-[12px] font-medium text-[#5b7284]">
              {rotulo}
              <input
                value={dados[k]}
                placeholder={dica}
                onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))}
                className={cn(campo, cor(dados[k]))}
              />
            </label>
          ))}
        </div>

        {termosLivres.length > 0 && (
          <>
            <p className="mt-5 flex items-center gap-2 text-[12px] font-semibold text-[#12455f]">
              <ChatText className="size-4" /> O que é desta conversa
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
              {termosLivres.slice(0, 12).map((t) => (
                <label key={t} className="flex flex-col justify-between gap-1.5 text-[12px] font-medium text-[#5b7284]">
                  [{t}]
                  <input value={termos[t] ?? ""} onChange={(e) => setTermos((x) => ({ ...x, [t]: e.target.value }))} className={cn(campo, cor(termos[t] ?? ""))} />
                </label>
              ))}
            </div>
          </>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#5b7284]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#2a7ca8]" /> preenchido
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#b42318]" /> falta completar
          </span>
          <span>Adapte antes de mandar: nenhuma mensagem sai igual para dois leads.</span>
        </p>
      </Cartao>

      {/* Momentos */}
      {busca.trim() ? (
        <p className="flex flex-wrap items-center gap-2 text-[14px] text-[#5b7284]">
          <MagnifyingGlass className="size-4" /> {visiveis.length} resultado(s) para “{busca.trim()}”.
          <button type="button" onClick={() => setBusca("")} className="font-semibold text-[#2a7ca8]">
            Limpar busca
          </button>
        </p>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-[#5b7284]">{descDe(modulo, perfil)}</p>
          {etapas.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {etapas.map((e, i) => {
                const on = etapaAtual?.nome === e.nome;
                const I = iconeDaEtapa(e.nome, modulo.id);
                return (
                  <button
                    key={e.nome}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setEtapa(i)}
                    className={cn(
                      "inline-flex h-11 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 text-[14px] font-medium transition-colors",
                      on ? "bg-[#0a2d40] text-white" : "bg-white text-[#34566b] shadow-[0_1px_2px_rgba(9,44,62,0.04)] hover:bg-[#e7f0f5]",
                    )}
                  >
                    <span className={cn("flex size-8 items-center justify-center rounded-full", on ? "bg-white/15" : "bg-[#eef3f6] text-[#12455f]")}>
                      <I className="size-4" />
                    </span>
                    {i + 1}. {e.nome}
                  </button>
                );
              })}
            </div>
          )}
          {etapaAtual && (etapaAtual.desc || (etapaAtual.regras?.length ?? 0) > 0) && (
            /* O único cartão escuro da tela: o momento escolhido e as regras dele. */
            <Cartao escuro>
              <div className="flex items-start gap-4">
                <IconeRedondo icone={IconeEtapa} tom="acao" />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#8fc4dd]">
                    {etapas.length > 1 ? `Momento ${Math.min(etapa, etapas.length - 1) + 1} de ${etapas.length}` : modulo.nome}
                  </p>
                  <h2 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">{etapaAtual.nome}</h2>
                  {etapaAtual.desc && <p className="mt-2 text-[14px] leading-relaxed text-white/80">{etapaAtual.desc}</p>}
                </div>
              </div>
              {etapaAtual.regras && etapaAtual.regras.length > 0 && (
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {etapaAtual.regras.map((r) => (
                    <li key={r} className="flex items-start gap-2.5 rounded-[16px] bg-white/[0.07] px-3.5 py-3 text-[13px] leading-snug text-white/90">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#8fc4dd]" weight="bold" /> {r}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          )}
          {modulo.guia && etapa === 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modulo.guia.map((g) => (
                <div key={g.b} className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-[#0a2d40]">
                    <Lightbulb className="size-4 text-[#2a7ca8]" /> {g.b}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-[#5b7284]">{g.s}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Mensagens */}
      {visiveis.length === 0 ? (
        <Cartao>
          <Vazio ilustracao={<IlustraConversa />} titulo="Nada encontrado" texto="Tente pelo que o cliente disse, por exemplo “balsa” ou “caro”." />
        </Cartao>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {visiveis.map(({ m, e, it }, n) => {
            const link = wa(it.m);
            const I = it.a ? Microphone : iconeDaEtapa(e.nome, m.id);
            return (
              <Cartao key={`${m.id}-${e.nome}-${it.t}-${n}`} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <IconeRedondo icone={I} tom={it.a ? "escuro" : "claro"} />
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[#0a2d40]">{it.t}</h3>
                    <p className="mt-0.5 text-[13px] text-[#5b7284]">
                      {it.a ? "Roteiro de áudio · " : ""}
                      {it.o ? `Cliente diz: “${it.o}”` : it.q}
                      {busca.trim() ? ` · ${m.nome} › ${e.nome}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 whitespace-pre-line rounded-[20px] rounded-tr-md bg-[#dcf8c6] px-4 py-3.5 text-[14px] leading-relaxed text-[#0a2d40]">
                  {destacar(it.m)}
                </div>
                {it.p && (
                  <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-[#5b7284]">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" />
                    <span>
                      <b className="font-semibold text-[#12455f]">Por que funciona.</b> {it.p}
                    </span>
                  </p>
                )}
                <div className="mt-auto flex items-center justify-end gap-2 pt-5">
                  {!link && <span className="mr-auto text-[12px] text-[#8aa3b3]">Escolha um lead para abrir no WhatsApp dele</span>}
                  <button
                    type="button"
                    onClick={() => copiar(it.m)}
                    title="Copiar"
                    aria-label="Copiar mensagem"
                    className="flex size-11 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] transition-colors hover:bg-[#0a2d40] hover:text-white"
                  >
                    <Copy className="size-5" />
                  </button>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir no WhatsApp"
                      aria-label="Abrir no WhatsApp"
                      className="flex size-11 items-center justify-center rounded-full bg-[#25d366] text-white hover:brightness-105"
                    >
                      <WhatsappLogo weight="fill" className="size-5" />
                    </a>
                  ) : (
                    <span
                      title="Escolha um lead para abrir no WhatsApp dele"
                      aria-label="WhatsApp indisponível sem lead"
                      className="flex size-11 cursor-not-allowed items-center justify-center rounded-full bg-[#f2f6f9] text-[#b5c6d1]"
                    >
                      <WhatsappLogo weight="fill" className="size-5" />
                    </span>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
