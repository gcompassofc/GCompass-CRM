/**
 * Esqueleto das telas da OPA (V2 da revisão de 31/10): aparece na hora do toque,
 * enquanto o servidor monta a tela. Mesmo fundo, mesmo topo e os mesmos cartões
 * arredondados, só que vazios e pulsando, para a tela não "piscar" de layout.
 */
import { cn } from "@/lib/utils";

function Bloco({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[28px] bg-white/70", className)} />;
}

export function EsqueletoOpa({
  titulo,
  forma = "lista",
}: {
  /** O nome da tela já aparece, para quem tocou saber que está indo ao lugar certo. */
  titulo: string;
  /** "lista" (Fila, Leads, Lembretes), "quadro" (Funil), "painel" (Início), "ficha" (lead), "grade" (Imóveis). */
  forma?: "lista" | "quadro" | "painel" | "ficha" | "grade";
}) {
  return (
    <div role="status" aria-live="polite" className="min-h-full">
      <span className="sr-only">Carregando {titulo}</span>
      <header className="px-5 pb-2 pt-6 md:px-10 md:pt-9">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4">
          <div className="hidden size-14 animate-pulse rounded-full bg-white/70 sm:block" />
          <div>
            <div className="h-3.5 w-20 animate-pulse rounded-full bg-white/70" />
            <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.035em] text-[#0a2d40] md:text-[40px]">{titulo}</h1>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-5 pb-16 pt-5 md:px-10">
        {forma === "painel" && (
          <>
            <div className="grid gap-5 sm:grid-cols-3">
              <Bloco className="h-32" />
              <Bloco className="h-32" />
              <Bloco className="h-32" />
            </div>
            <Bloco className="h-72 rounded-[32px]" />
          </>
        )}
        {forma === "lista" && (
          <>
            <Bloco className="h-14 rounded-full" />
            {Array.from({ length: 6 }, (_, i) => (
              <Bloco key={i} className="h-20" />
            ))}
          </>
        )}
        {forma === "quadro" && (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex w-72 shrink-0 flex-col gap-3">
                <Bloco className="h-12 rounded-full" />
                <Bloco className="h-28" />
                <Bloco className="h-28" />
              </div>
            ))}
          </div>
        )}
        {forma === "ficha" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="flex flex-col gap-6">
              <Bloco className="h-40 rounded-[32px]" />
              <Bloco className="h-80 rounded-[32px]" />
            </div>
            <Bloco className="h-96 rounded-[32px]" />
          </div>
        )}
        {forma === "grade" && (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Bloco key={i} className="h-64" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
