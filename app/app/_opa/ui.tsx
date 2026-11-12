/**
 * Kit visual do CRM da OPA (reformulação de 30/10/2026).
 *
 * Linguagem: design system Planta e Lastro (pasta 03-RECURSOS) com as cores e
 * a fonte da OPA, e o "menos é mais" da Central: fundo cinza-azulado, cartões
 * brancos bem arredondados (28 px, blocos 32 px), números grandes e leves, um
 * ícone em círculo em cada título e ação, um só cartão escuro por tela, barras
 * de fundo hachuradas. Detalhe fica atrás do clique.
 *
 * Tudo aqui é componente de servidor (sem estado), para a tela chegar pronta.
 */
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Icone = ComponentType<{ className?: string; weight?: "regular" | "fill" | "bold" | "duotone"; size?: number }>;

type Tom = "claro" | "acao" | "escuro" | "alerta" | "ok" | "aviso";

const TOM_ICONE: Record<Tom, string> = {
  claro: "bg-[#e7f0f5] text-[#12455f]",
  acao: "bg-[#2a7ca8] text-white",
  escuro: "bg-[#0a2d40] text-white",
  alerta: "bg-[#fdeee3] text-[#a4410e]",
  ok: "bg-[#e5f3ea] text-[#1d6b43]",
  aviso: "bg-[#fdf1dc] text-[#9a5b00]",
};

/** Ícone dentro de um círculo: o que diz, num olhar, do que o bloco trata. */
export function IconeRedondo({
  icone: I,
  tom = "claro",
  tamanho = "md",
  className,
}: {
  icone: Icone;
  tom?: Tom;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = { sm: "size-8 [&_svg]:size-4", md: "size-10 [&_svg]:size-5", lg: "size-12 [&_svg]:size-6" }[tamanho];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full", TOM_ICONE[tom], t, className)}>
      <I weight={tom === "claro" ? "regular" : "fill"} />
    </span>
  );
}

/** Cartão branco. `bloco` = área grande (32 px); `escuro` = o único destaque da tela. */
export function Cartao({
  children,
  className,
  bloco,
  escuro,
  href,
  tour,
}: {
  children: ReactNode;
  className?: string;
  bloco?: boolean;
  escuro?: boolean;
  href?: string;
  /** Âncora do tour guiado (`data-tour`), ver lib/opa/tour.ts. */
  tour?: string;
}) {
  const cls = cn(
    bloco ? "rounded-[32px] p-7" : "rounded-[28px] p-6",
    escuro ? "bg-[#0a2d40] text-white" : "bg-white text-[#0a2d40]",
    "shadow-[0_1px_2px_rgba(9,44,62,0.04)]",
    href && "block transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(9,44,62,0.10)]",
    className,
  );
  return href ? (
    <Link href={href} className={cls} data-tour={tour}>
      {children}
    </Link>
  ) : (
    <section className={cls} data-tour={tour}>
      {children}
    </section>
  );
}

/** Título de bloco: ícone + título + frase curta, e a ação à direita. */
export function TituloBloco({
  icone,
  titulo,
  sub,
  acao,
  tom = "claro",
  claro,
}: {
  icone: Icone;
  titulo: string;
  sub?: string;
  acao?: ReactNode;
  tom?: Tom;
  /** Texto branco (dentro do cartão escuro). */
  claro?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <IconeRedondo icone={icone} tom={claro ? "acao" : tom} />
        <div className="min-w-0">
          <h2 className={cn("truncate text-[17px] font-semibold tracking-[-0.02em]", claro ? "text-white" : "text-[#0a2d40]")}>{titulo}</h2>
          {sub && <p className={cn("truncate text-[13px]", claro ? "text-white/65" : "text-[#5b7284]")}>{sub}</p>}
        </div>
      </div>
      {acao}
    </div>
  );
}

/** Cartão de número (Planta): rótulo com ícone, número grande e leve, uma linha de contexto. */
export function CartaoNumero({
  icone,
  rotulo,
  valor,
  contexto,
  variacao,
  alerta,
  href,
  ilustracao,
  escuro,
  className,
}: {
  icone: Icone;
  rotulo: string;
  valor: ReactNode;
  contexto?: ReactNode;
  variacao?: { texto: string; bom: boolean };
  alerta?: boolean;
  href?: string;
  ilustracao?: ReactNode;
  escuro?: boolean;
  className?: string;
}) {
  // Valor longo ("R$ 105,3 mi") desce de tamanho para caber numa linha.
  const longo = typeof valor === "string" && valor.length > 6;
  return (
    <Cartao href={href} escuro={escuro} className={cn("relative flex min-h-[176px] flex-col overflow-hidden", className)}>
      <div className="flex items-center gap-2.5">
        <IconeRedondo icone={icone} tom={escuro ? "acao" : alerta ? "alerta" : "claro"} tamanho="sm" />
        <p className={cn("text-[14px] font-medium", escuro ? "text-white/75" : "text-[#5b7284]")}>{rotulo}</p>
      </div>
      <div className={cn("relative z-10 mt-auto pt-6", ilustracao && "max-w-[62%]")}>
        <p
          className={cn(
            longo ? "whitespace-nowrap text-[34px]" : "text-[46px]",
            "font-light leading-none tracking-[-0.045em] tabular-nums",
            alerta ? "text-[#a4410e]" : escuro ? "text-white" : "text-[#0a2d40]",
          )}
        >
          {valor}
        </p>
        {(contexto || variacao) && (
          <p className={cn("mt-2.5 flex flex-wrap items-center gap-2 text-[13px]", escuro ? "text-white/70" : "text-[#5b7284]")}>
            {variacao && (
              <span className={cn("font-semibold", variacao.bom ? "text-[#1d6b43]" : "text-[#a4410e]", escuro && "text-[#8fe0b0]")}>
                {variacao.texto}
              </span>
            )}
            {contexto}
          </p>
        )}
      </div>
      {ilustracao && <div className="pointer-events-none absolute -bottom-1 right-3 w-[42%] max-w-[170px]">{ilustracao}</div>}
    </Cartao>
  );
}

const TOM_CHIP: Record<Tom | "neutro", string> = {
  neutro: "bg-[#eef3f6] text-[#34566b]",
  claro: "bg-[#e7f0f5] text-[#12455f]",
  acao: "bg-[#2a7ca8] text-white",
  escuro: "bg-[#0a2d40] text-white",
  alerta: "bg-[#fdeee3] text-[#a4410e]",
  ok: "bg-[#e5f3ea] text-[#1d6b43]",
  aviso: "bg-[#fdf1dc] text-[#9a5b00]",
};

/** Pílula pequena com ícone opcional (origem, temperatura, selos). */
export function Chip({
  icone: I,
  children,
  tom = "neutro",
  className,
}: {
  icone?: Icone;
  children: ReactNode;
  tom?: Tom | "neutro";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium", TOM_CHIP[tom], className)}>
      {I && <I className="size-3.5" weight="bold" />}
      {children}
    </span>
  );
}

/** Abas em pílula (seletor segmentado da Planta), com ícone e contagem. */
export function AbasPilula({
  itens,
  className,
}: {
  itens: Array<{ href: string; rotulo: string; icone?: Icone; contagem?: number | null; ativo: boolean }>;
  className?: string;
}) {
  return (
    <nav className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(9,44,62,0.04)]", className)}>
      {itens.map(({ href, rotulo, icone: I, contagem, ativo }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
            ativo ? "bg-[#0a2d40] text-white" : "text-[#34566b] hover:bg-[#eef3f6]",
          )}
        >
          {I && <I className="size-4" weight={ativo ? "fill" : "regular"} />}
          {rotulo}
          {contagem != null && (
            <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", ativo ? "bg-white/15" : "bg-[#eef3f6] text-[#5b7284]")}>{contagem}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Botão redondo branco só com ícone (com rótulo para leitor de tela). */
export function BotaoRedondo({ href, icone: I, rotulo, escuro }: { href: string; icone: Icone; rotulo: string; escuro?: boolean }) {
  return (
    <Link
      href={href}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
        escuro ? "bg-[#0a2d40] text-white hover:bg-[#12455f]" : "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]",
      )}
    >
      <I className="size-5" />
    </Link>
  );
}

/** Botão em pílula com ícone. `primario` = escuro (ação principal da tela). */
export function BotaoPilula({
  href,
  icone: I,
  children,
  tom = "branco",
  className,
}: {
  href: string;
  icone?: Icone;
  children: ReactNode;
  tom?: "branco" | "escuro" | "acao";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors",
        tom === "escuro" && "bg-[#0a2d40] text-white hover:bg-[#12455f]",
        tom === "acao" && "bg-[#2a7ca8] text-white hover:bg-[#1f6a93]",
        tom === "branco" && "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]",
        className,
      )}
    >
      {I && <I className="size-4" weight="bold" />}
      {children}
    </Link>
  );
}

/** Barra de progresso: fundo hachurado, só o valor em cor sólida (Planta). */
export function BarraHachurada({ pct, tom = "acao", className }: { pct: number; tom?: "acao" | "alerta" | "escuro"; className?: string }) {
  return (
    <div className={cn("opa-hachurado h-2.5 overflow-hidden rounded-full", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          tom === "alerta" ? "bg-[#e07b2e]" : tom === "escuro" ? "bg-[#0a2d40]" : "bg-gradient-to-r from-[#12455f] to-[#2a7ca8]",
        )}
        style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/** Estado vazio com ilustração: diz o que significa o vazio, sem alarme. */
export function Vazio({ ilustracao, titulo, texto }: { ilustracao?: ReactNode; titulo: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {ilustracao && <div className="mb-4 w-40">{ilustracao}</div>}
      <p className="text-[15px] font-semibold text-[#0a2d40]">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-[13px] text-[#5b7284]">{texto}</p>}
    </div>
  );
}

/** Iniciais da pessoa num círculo (padrão aprovado no Meu corretor). */
/**
 * Círculo da pessoa: a foto (do site da OPA, via perfil do usuário) ou as
 * iniciais quando não há foto.
 */
export function Avatar({
  texto,
  foto,
  tom = "claro",
  className,
}: {
  texto: string;
  foto?: string | null;
  tom?: "claro" | "escuro" | "acao";
  className?: string;
}) {
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto pequena de origem externa já otimizada (webp do site)
      <img
        src={foto}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn("inline-block size-9 shrink-0 rounded-full bg-[#e7f0f5] object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        tom === "escuro" ? "bg-[#0a2d40] text-white" : tom === "acao" ? "bg-[#2a7ca8] text-white" : "bg-[#e7f0f5] text-[#12455f]",
        className,
      )}
    >
      {texto}
    </span>
  );
}

/**
 * Rosto do lead: a foto do WhatsApp que a tela Conversas já mostra, com as
 * iniciais por baixo. A <img> só monta quando o contato tem foto guardada (sem
 * isso o browser pediria a rota para cada lead sem foto e levaria 404); se a
 * foto não carregar, ela some e as iniciais continuam ali.
 */
export function AvatarContato({
  nome,
  contatoId,
  temFoto,
  tom = "claro",
  className,
}: {
  nome: string;
  contatoId: string | null | undefined;
  temFoto: boolean;
  tom?: "claro" | "escuro" | "acao";
  className?: string;
}) {
  const iniciais = <Avatar texto={iniciaisDe(nome)} tom={tom} className={className} />;
  if (!temFoto || !contatoId) return iniciais;
  return (
    <span className="relative inline-flex shrink-0">
      {iniciais}
      {/* eslint-disable-next-line @next/next/no-img-element -- rota própria que redireciona para URL assinada do Storage */}
      <img
        src={`/api/v1/contacts/${contatoId}/avatar`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full rounded-full object-cover"
      />
    </span>
  );
}

export function iniciaisDe(nome: string): string {
  const p = nome.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p.at(-1)![0] : "")).toUpperCase();
}
