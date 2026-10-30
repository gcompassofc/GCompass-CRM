import Link from "next/link";

import { cn } from "@/lib/utils";
import { ArrowsClockwise, Fire, Lock, Snowflake, Thermometer } from "@/lib/ui/icons";
import { fotoUrl, type Imovel } from "@/lib/opa/imoveis";

/**
 * Peças das telas da OPA. Padrão aprovado para painel (Meu corretor, 22/10/2026):
 * fundo cinza-azulado com blocos brancos, número grande e leve, um só cartão
 * escuro por tela, iniciais das pessoas.
 */

export function Bloco({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(9,44,62,0.04)]", className)}>
      {children}
    </section>
  );
}

export function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("opa-rotulo", className)}>{children}</p>;
}

export function Numero({ valor, rotulo, alerta }: { valor: number | string; rotulo: string; alerta?: boolean }) {
  return (
    <div>
      <p className={cn("opa-numero", alerta ? "text-error-fg" : "text-text")}>{valor}</p>
      <p className="mt-2 text-sm text-text-muted">{rotulo}</p>
    </div>
  );
}

export function Iniciais({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e7f0f5] text-xs font-semibold text-[#12455f]",
        className,
      )}
    >
      {texto}
    </span>
  );
}

export function Temperatura({ valor }: { valor?: "quente" | "morno" | "frio" }) {
  if (!valor) return null;
  const mapa = {
    quente: { Icone: Fire, texto: "Quente", cls: "text-error-fg bg-error-bg" },
    morno: { Icone: Thermometer, texto: "Morno", cls: "text-warning-fg bg-warning-bg" },
    frio: { Icone: Snowflake, texto: "Frio", cls: "text-accent-600 bg-accent-soft" },
  }[valor];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", mapa.cls)}>
      <mapa.Icone weight="fill" className="size-3" />
      {mapa.texto}
    </span>
  );
}

export function FotoImovel({
  imovel,
  className,
  tamanho = "card",
}: {
  imovel: Pick<Imovel, "codigo" | "fotos" | "titulo"> | null | undefined;
  className?: string;
  tamanho?: "card" | "full";
}) {
  const src = imovel ? fotoUrl(imovel, 0, tamanho) : null;
  if (!src) return <div className={cn("bg-accent-100", className)} />;
  // eslint-disable-next-line @next/next/no-img-element -- fotos vêm do R2 da OPA, fora do otimizador do Next
  return <img src={src} alt={imovel?.titulo ?? ""} loading="lazy" className={cn("object-cover", className)} />;
}

export function LinkLead({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={`/app/leads/${id}`} className={cn("block rounded-xl transition-colors hover:bg-accent-soft", className)}>
      {children}
    </Link>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-text-muted">{children}</p>;
}

/** Selo escuro com cadeado: comprador ou proprietário off market. */
export function SeloOffMarket({ tipo, className }: { tipo: "comprador" | "proprietario" | null; className?: string }) {
  if (!tipo) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[#0a2d40] px-2 py-0.5 text-xs font-medium text-white",
        className,
      )}
    >
      <Lock weight="fill" className="size-3" /> Off market{tipo === "proprietario" ? " · proprietário" : ""}
    </span>
  );
}

/** Lead que já tinha dono e entrou de novo por outro formulário: "Voltou · 2º formulário". */
export function SeloVoltou({ vez, className }: { vez?: number | null; className?: string }) {
  if (!vez) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-accent-300 bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700",
        className,
      )}
    >
      <ArrowsClockwise className="size-3" /> Voltou · {vez}º formulário
    </span>
  );
}
