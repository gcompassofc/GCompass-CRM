"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";
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
import { Cartao, Chip, IconeRedondo, Vazio, type Icone } from "../_opa/ui";

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

/** Como a variável aparece no texto enquanto falta: em palavras, não o nome do campo. */
const FALTA_VAR: Record<keyof Dados, string> = {
  corretor: "seu nome",
  lead: "nome do cliente",
  imovel: "o imóvel",
  bairro: "bairro",
  link: "link do imóvel",
};

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
    if (await copyToClipboard(textoFinal(txt))) toast.success("Mensagem copiada já personalizada");
    else toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
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
          <span key={n} className="rounded-[5px] bg-[#a4410e]/10 px-0.5 font-semibold text-[#a4410e]">
            {FALTA_VAR[v[1] as keyof Dados] ?? v[1]}
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
          <span key={n} className="rounded-[5px] bg-[#a4410e]/10 px-0.5 font-semibold text-[#a4410e]">
            [{t[1]}]
          </span>
        );
      }
      return <Fragment key={n}>{parte}</Fragment>;
    });

  const campo =
    "h-11 w-full rounded-[14px] border px-3.5 text-[14px] text-[#0a2d40] outline-none transition-colors focus:border-[#2a7ca8] focus:bg-white";
  const cor = (v: string) => (v ? "border-transparent bg-[#e7f0f5]" : "border-transparent bg-[#fdf1dc]");
  const seletor =
    "h-12 w-full min-w-0 appearance-none rounded-[16px] border border-transparent bg-[#f2f6f9] pl-12 pr-10 text-[15px] text-[#0a2d40] outline-none focus:border-[#8fc4dd] focus:bg-white";
  const foto = imovel ? fotoUrl(imovel, 0) : null;
  const IconeEtapa = etapaAtual ? iconeDaEtapa(etapaAtual.nome, modulo.id) : ChatText;
  const temBusca = busca.trim().length > 0;

  // O que ainda está sem valor nas mensagens à vista (vira laranja no texto).
  const faltando = [
    ...new Set(
      visiveis.flatMap((v) =>
        [...v.it.m.matchAll(PARTES)]
          .map((x) => x[0])
          .filter((p) => {
            const variavel = p.match(/^\{(\w+)\}$/);
            if (variavel) return !dados[variavel[1] as keyof Dados];
            const termo = p.match(/^\[([^\]]+)\]$/);
            return termo ? !valorDoTermo(termo[1]!) : false;
          }),
      ),
    ),
  ];
  const temDicas = !temBusca && (Boolean(descDe(modulo, perfil)) || Boolean(etapaAtual?.desc) || (etapaAtual?.regras?.length ?? 0) > 0 || (Boolean(modulo.guia) && etapa === 0));

  return (
    <div className="flex flex-col gap-5">
      {/* Passo 1: para quem */}
      <Cartao>
        <TituloPasso
          n={1}
          titulo="Para quem é a mensagem?"
          sub="Escolha o cliente. O nome dele e o imóvel entram sozinhos no texto."
          acao={
            leadId || imovelCod ? (
              <button
                type="button"
                onClick={limpar}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#eef3f6] px-4 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
              >
                <X className="size-4" aria-hidden /> Trocar
              </button>
            ) : null
          }
        />

        <label className="relative mt-5 block">
          <UserCircle className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2a7ca8]" aria-hidden />
          <select aria-label="Escolher cliente" value={leadId} onChange={(e) => escolherLead(e.target.value)} className={seletor}>
            <option value="">Escolher cliente...</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
                {l.offMarket ? " · off market" : ""}
              </option>
            ))}
          </select>
          <CaretDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
        </label>

        {imovel && (
          <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-[#f2f6f9] p-2.5">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- fotos do R2 da OPA
              <img src={foto} alt="" className="h-12 w-16 shrink-0 rounded-[14px] object-cover" />
            ) : (
              <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-[14px] bg-[#e7f0f5] text-[#12455f]">
                <HouseLine className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0a2d40]">
                {imovel.offMarket && <Lock weight="fill" className="size-4 shrink-0" aria-label="Off market" />}
                <span className="truncate">{imovel.titulo}</span>
              </p>
              <p className="truncate text-[13px] text-[#5b7284]">
                {imovel.codigo}
                {imovel.precoVendaCents ? ` · ${precoCheio(imovel.precoVendaCents)}` : ""}
              </p>
            </div>
            <Link
              href={`/app/imoveis/${imovel.codigo}`}
              title="Ver o imóvel"
              aria-label="Ver o imóvel"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0a2d40] hover:bg-[#e7f0f5]"
            >
              <ArrowSquareOut className="size-4" />
            </Link>
          </div>
        )}

        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full text-[14px] font-semibold text-[#2a7ca8] [&::-webkit-details-marker]:hidden">
            <PencilSimple className="size-4" aria-hidden />
            {imovel ? "Ajustar o texto ou trocar o imóvel" : "Falar de um imóvel ou ajustar o texto"}
            <CaretDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 flex flex-col gap-4 rounded-[22px] bg-[#f7fafb] p-4">
            <label className="relative block">
              <HouseLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#2a7ca8]" aria-hidden />
              <select aria-label="Escolher imóvel" value={imovelCod} onChange={(e) => escolherImovel(e.target.value)} className={cn(seletor, "bg-white")}>
                <option value="">Escolher imóvel...</option>
                {imoveis.map((i) => (
                  <option key={i.codigo} value={i.codigo}>
                    {i.codigo} · {i.titulo.slice(0, 48)}
                  </option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
            </label>
            {imovel && (
              <div className="flex flex-wrap gap-1.5">
                {imovel.condominioCents ? <Chip icone={Coins}>Condomínio {precoCheio(imovel.condominioCents)}/mês</Chip> : null}
                {imovel.iptuCents ? <Chip>IPTU {precoCheio(imovel.iptuCents)}/ano</Chip> : null}
                {imovel.precoLocacaoCents ? <Chip>Locação {precoCheio(imovel.precoLocacaoCents)}/mês</Chip> : null}
                {termosDoCadastro.length > 0 && (
                  <Chip icone={Sparkle} tom="claro">
                    Valores do cadastro já entram no texto
                  </Chip>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
              {VARS.map(([k, rotulo, dica]) => (
                <label key={k} className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                  {rotulo}
                  <input value={dados[k]} placeholder={dica} onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))} className={cn(campo, cor(dados[k]))} />
                </label>
              ))}
              {termosLivres.slice(0, 12).map((t) => (
                <label key={t} className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  <input value={termos[t] ?? ""} onChange={(e) => setTermos((x) => ({ ...x, [t]: e.target.value }))} className={cn(campo, cor(termos[t] ?? ""))} />
                </label>
              ))}
            </div>
            <p className="text-[13px] text-[#5b7284]">Adapte antes de mandar: nenhuma mensagem sai igual para dois clientes.</p>
          </div>
        </details>
      </Cartao>

      {/* Passo 2: a situação */}
      <Cartao>
        <TituloPasso n={2} titulo="O que está acontecendo?" sub="Toque na situação do cliente. As mensagens certas aparecem embaixo." />

        <div role="radiogroup" aria-label="Situação" className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {KIT.map((m) => {
            const on = m.id === mod && !temBusca;
            const I = ICONE_MODULO[m.id];
            const s = SITUACAO[m.id];
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setMod(m.id);
                  setEtapa(0);
                  setBusca("");
                }}
                className={cn(
                  "flex min-h-[88px] flex-col items-start gap-2 rounded-[22px] p-3.5 text-left transition-colors",
                  on ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#0a2d40] hover:bg-[#e7f0f5]",
                )}
              >
                <span className={cn("flex size-9 items-center justify-center rounded-full", on ? "bg-white/15" : "bg-white text-[#12455f]")}>
                  <I className="size-[18px]" weight={on ? "fill" : "regular"} />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold leading-tight">{s.titulo}</span>
                  <span className={cn("mt-0.5 block text-[12.5px] leading-snug", on ? "text-white/70" : "text-[#5b7284]")}>{s.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {!temBusca && etapas.length > 1 && (
          <>
            <p className="mt-5 text-[13px] font-semibold text-[#34566b]">{modulo.id === "objecoes" ? "Qual foi a objeção?" : "Em que momento está?"}</p>
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
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
                      on ? "bg-[#2a7ca8] text-white" : "bg-[#f2f6f9] text-[#34566b] hover:bg-[#e7f0f5]",
                    )}
                  >
                    <span className={cn("flex size-8 items-center justify-center rounded-full", on ? "bg-white/20" : "bg-white text-[#12455f]")}>
                      <I className="size-4" />
                    </span>
                    {e.nome}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-[#eef3f6] pt-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <MagnifyingGlass className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque pelo que o cliente disse: caro, balsa"
              aria-label="Buscar mensagem"
              className="h-11 w-full rounded-full border border-transparent bg-[#f2f6f9] pl-11 pr-4 text-[14px] text-[#0a2d40] outline-none focus:border-[#8fc4dd] focus:bg-white"
            />
          </label>
          <div role="radiogroup" aria-label="Padrão do imóvel" className="flex w-full shrink-0 gap-1 rounded-full bg-[#f2f6f9] p-1 sm:inline-flex sm:w-auto">
            {PERFIS_KIT.map((p) => {
              const on = p.id === perfil;
              const I = ICONE_PERFIL[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={`Imóvel de ${p.nome.toLowerCase()}`}
                  onClick={() => {
                    setPerfil(p.id);
                    setEtapa(0);
                  }}
                  className={cn(
                    "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors sm:flex-none",
                    on ? "bg-white text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.08)]" : "text-[#5b7284] hover:text-[#0a2d40]",
                  )}
                >
                  <I className="hidden size-4 sm:block" weight={on ? "fill" : "regular"} />
                  <span className="sm:hidden">{p.id === "off" ? p.nome : p.nome.split(" ")[0]}</span>
                  <span className="hidden sm:inline">{p.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Cartao>

      {/* Dicas do momento: atrás de um clique */}
      {temDicas && etapaAtual && (
        <details className="group rounded-[28px] bg-white px-6 py-4 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <IconeRedondo icone={IconeEtapa} tom="claro" tamanho="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[#0a2d40]">Dicas para {etapaAtual.nome.toLowerCase()}</span>
              <span className="block text-[13px] text-[#5b7284]">O que fazer antes de mandar</span>
            </span>
            <CaretDown className="size-4 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-4 flex flex-col gap-3 pb-2">
            {etapaAtual.desc && <p className="text-[14px] leading-relaxed text-[#34566b]">{etapaAtual.desc}</p>}
            {etapaAtual.regras && etapaAtual.regras.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {etapaAtual.regras.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 rounded-[16px] bg-[#f2f6f9] px-3.5 py-3 text-[13px] leading-snug text-[#0a2d40]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" weight="bold" /> {r}
                  </li>
                ))}
              </ul>
            )}
            {modulo.guia && etapa === 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {modulo.guia.map((g) => (
                  <li key={g.b} className="rounded-[16px] bg-[#f2f6f9] px-3.5 py-3 text-[13px] leading-snug text-[#5b7284]">
                    <b className="flex items-center gap-1.5 font-semibold text-[#0a2d40]">
                      <Lightbulb className="size-4 text-[#2a7ca8]" /> {g.b}
                    </b>
                    {g.s}
                  </li>
                ))}
              </ul>
            )}
            {descDe(modulo, perfil) && <p className="text-[13px] leading-relaxed text-[#5b7284]">{descDe(modulo, perfil)}</p>}
          </div>
        </details>
      )}

      {/* Passo 3: as mensagens */}
      <div className="flex flex-col gap-3 pt-1">
        <TituloPasso
          n={3}
          titulo={temBusca ? `${visiveis.length} ${visiveis.length === 1 ? "mensagem" : "mensagens"} para “${busca.trim()}”` : "Escolha a mensagem e mande"}
          sub={
            faltando.length > 0
              ? "O que está em laranja ainda falta. Complete no passo 1 ou edite no WhatsApp."
              : lead
                ? `Pronta para ${dados.lead || "o cliente"}. Copie ou mande direto no WhatsApp.`
                : "Escolha o cliente no passo 1 para mandar direto no WhatsApp."
          }
          acao={
            temBusca ? (
              <button type="button" onClick={() => setBusca("")} className="inline-flex h-11 shrink-0 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]">
                Limpar busca
              </button>
            ) : null
          }
        />
      </div>

      {visiveis.length === 0 ? (
        <Cartao>
          <Vazio ilustracao={<IlustraConversa />} titulo="Nenhuma mensagem com essa palavra" texto="Tente pelo que o cliente disse, por exemplo “balsa” ou “caro”." />
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
                      {it.a ? "Áudio para gravar. " : ""}
                      {it.o ? `Quando o cliente diz: “${it.o}”` : it.q ? `Quando usar: ${it.q.charAt(0).toLowerCase()}${it.q.slice(1)}` : ""}
                      {temBusca ? ` · ${SITUACAO[m.id].titulo}, ${e.nome.toLowerCase()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 whitespace-pre-line rounded-[20px] rounded-tr-md bg-[#dcf8c6] px-4 py-3.5 text-[14px] leading-relaxed text-[#0a2d40]">
                  {destacar(it.m)}
                </div>
                {it.p && (
                  <details className="group mt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-[#2a7ca8] [&::-webkit-details-marker]:hidden">
                      <Lightbulb className="size-4" aria-hidden /> Por que funciona
                    </summary>
                    <p className="pb-1 text-[13px] leading-snug text-[#5b7284]">{it.p}</p>
                  </details>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => copiar(it.m)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#eef3f6] px-4 text-[14px] font-semibold text-[#0a2d40] transition-colors hover:bg-[#e7f0f5]"
                  >
                    <Copy className="size-[18px]" aria-hidden /> Copiar
                  </button>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#1d8f4e] px-4 text-[14px] font-semibold text-white hover:bg-[#177a42] sm:flex-none"
                    >
                      <WhatsappLogo weight="fill" className="size-[18px]" aria-hidden /> Mandar no WhatsApp
                    </a>
                  ) : (
                    <span className="text-[13px] text-[#5b7284]">Para mandar direto, escolha o cliente no passo 1.</span>
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

/** Situações em linguagem de corretor (os módulos do kit por trás). */
const SITUACAO: Record<ModuloKit["id"], { titulo: string; sub: string }> = {
  atendimento: { titulo: "Atender", sub: "Do primeiro contato à proposta" },
  resgate: { titulo: "Cliente sumiu", sub: "Retomar a conversa" },
  objecoes: { titulo: "Fez uma objeção", sub: "Caro, financiamento, balsa..." },
  audio: { titulo: "Mandar áudio", sub: "Roteiro curto para gravar" },
};

/** Título de passo: número no círculo, frase curta e a ação à direita. */
function TituloPasso({ n, titulo, sub, acao }: { n: number; titulo: string; sub?: string; acao?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-[15px] font-semibold text-white">{n}</span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#0a2d40]">{titulo}</h2>
          {sub && <p className="mt-0.5 text-[13px] leading-snug text-[#5b7284]">{sub}</p>}
        </div>
      </div>
      {acao}
    </div>
  );
}
