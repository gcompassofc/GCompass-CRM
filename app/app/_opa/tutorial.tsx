"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CalendarBlank,
  CaretDown,
  ChartBar,
  Funnel,
  MagnifyingGlass,
  QrCode,
  Robot,
  SlidersHorizontal,
  Sparkle,
  Sun,
  Timer,
  UserPlus,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { tourDaRota } from "@/lib/opa/tour";
import { deveAbrirSozinho, PASSOS, type IconePasso, type VersaoTutorial } from "@/lib/opa/tutorial";

import { marcarTutorialVisto } from "../tutoriais/actions";
import { iniciarTour, TourHost } from "./tour";
import type { Icone } from "./ui";

/**
 * Tutorial de boas-vindas do perfil imobiliária (01/11/2026). Um cartão por
 * passo, um foco por cartão; o detalhe fica atrás do "Ver mais". No celular o
 * cartão sobe do rodapé, no computador fica no centro. Ilustração simples por
 * passo em vez de recortar a tela real: recorte quebra a cada mudança de layout.
 */
const ICONES: Record<IconePasso, Icone> = {
  "boas-vindas": Sparkle,
  hoje: Sun,
  fila: Timer,
  leads: MagnifyingGlass,
  ficha: Robot,
  imoveis: Buildings,
  agenda: CalendarBlank,
  whatsapp: QrCode,
  funis: Funnel,
  equipe: UserPlus,
  roleta: SlidersHorizontal,
  numeros: ChartBar,
};

/** "Ver depois" vale até fechar a aba: no próximo acesso o tutorial volta. */
const CHAVE_DEPOIS = "opa-tutorial-depois";
/** Cinto de segurança local: a sessão do navegador pode demorar a trazer o metadata novo. */
const chaveVistoLocal = (userId: string, versao: VersaoTutorial) => `opa-tutorial-visto:${userId}:${versao}`;

function lerArmazenado(area: "session" | "local", chave: string): boolean {
  try {
    return (area === "session" ? window.sessionStorage : window.localStorage).getItem(chave) === "1";
  } catch {
    return false;
  }
}

function gravarArmazenado(area: "session" | "local", chave: string): void {
  try {
    (area === "session" ? window.sessionStorage : window.localStorage).setItem(chave, "1");
  } catch {
    // Navegador sem armazenamento: o servidor continua sendo a fonte.
  }
}

export function PassoAPasso({
  versao,
  aberto,
  inicio = 0,
  primeiroAcesso = false,
  onFechar,
  onConcluir,
}: {
  versao: VersaoTutorial;
  aberto: boolean;
  /** Abre direto neste passo (tópico de Tutoriais ou link `?passo=`). */
  inicio?: number;
  /** No primeiro acesso aparecem "Pular" e "Ver depois"; reaberto, só fechar. */
  primeiroAcesso?: boolean;
  /** Fechou sem terminar (X, Esc, clique fora). */
  onFechar: () => void;
  /** Terminou ou pulou: conta como visto. */
  onConcluir: () => void;
}) {
  const passos = PASSOS[versao];
  // Quem abre monta este componente só enquanto está aberto: cada abertura
  // começa do passo pedido sem efeito de "reset".
  const [i, setI] = useState(() => Math.min(Math.max(0, inicio), passos.length - 1));
  const [verMais, setVerMais] = useState(false);
  const passo = passos[i]!;
  const ultimo = i === passos.length - 1;
  const I = ICONES[passo.icone];

  const ir = useCallback(
    (delta: number) => {
      setVerMais(false);
      setI((atual) => Math.min(passos.length - 1, Math.max(0, atual + delta)));
    },
    [passos.length],
  );

  return (
    <Dialog.Root open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0a2d40]/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="opa-tutorial-texto"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" && !ultimo) ir(1);
            if (e.key === "ArrowLeft") ir(-1);
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-white text-[#0a2d40] shadow-[0_24px_60px_rgba(9,44,62,0.22)] outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[32px] pb-[max(20px,env(safe-area-inset-bottom))]",
            "md:inset-auto md:left-1/2 md:top-1/2 md:w-[460px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[32px] md:pb-0",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 max-md:data-[state=open]:slide-in-from-bottom-8",
          )}
        >
          {/* Topo: ilustração do passo, contador e saídas. */}
          <div className="relative overflow-hidden rounded-t-[32px] bg-[#e7f0f5] px-6 pb-8 pt-5">
            <span aria-hidden className="absolute -right-10 -top-12 size-44 rounded-full border-[18px] border-white/45" />
            <span aria-hidden className="absolute -bottom-16 -left-8 size-40 rounded-full border-[14px] border-white/35" />
            <div className="relative flex items-center justify-between">
              <span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold tabular-nums text-[#12455f]">
                {i + 1} de {passos.length}
              </span>
              <div className="flex items-center gap-1">
                {primeiroAcesso && !ultimo && (
                  <button
                    type="button"
                    onClick={onConcluir}
                    className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#34566b] hover:bg-white/70"
                  >
                    Pular
                  </button>
                )}
                <Dialog.Close
                  aria-label={primeiroAcesso ? "Ver depois" : "Fechar"}
                  title={primeiroAcesso ? "Ver depois" : "Fechar"}
                  className="flex size-9 items-center justify-center rounded-full text-[#34566b] hover:bg-white/70"
                >
                  <X className="size-4" weight="bold" />
                </Dialog.Close>
              </div>
            </div>
            <div className="relative mt-6 flex justify-center">
              <span className="flex size-24 items-center justify-center rounded-full bg-[#0a2d40] text-white shadow-[0_12px_30px_rgba(9,44,62,0.25)]">
                <I className="size-11" weight="fill" />
              </span>
            </div>
          </div>

          {/* Corpo: um foco por passo. */}
          <div className="flex-1 overflow-y-auto px-6 pt-6">
            <Dialog.Title className="text-[24px] font-semibold leading-tight tracking-[-0.03em]">{passo.titulo}</Dialog.Title>
            <p id="opa-tutorial-texto" className="mt-2 text-[15px] leading-relaxed text-[#34566b]">
              {passo.texto}
            </p>

            {passo.detalhes && passo.detalhes.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  aria-expanded={verMais}
                  onClick={() => setVerMais((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#2a7ca8]"
                >
                  {verMais ? "Ver menos" : "Ver mais"}
                  <CaretDown className={cn("size-4 transition-transform", verMais && "rotate-180")} weight="bold" />
                </button>
                {verMais && (
                  <ul className="mt-3 space-y-2">
                    {passo.detalhes.map((d) => (
                      <li key={d} className="rounded-[18px] bg-[#f2f6f9] px-4 py-3 text-[14px] leading-snug text-[#34566b]">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!primeiroAcesso && passo.href && (
              <Link
                href={passo.href}
                onClick={onFechar}
                className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0a2d40] underline-offset-4 hover:underline"
              >
                {passo.rotuloLink ?? "Abrir a tela"}
                <ArrowRight className="size-4" weight="bold" />
              </Link>
            )}
          </div>

          {/* Rodapé: progresso e navegação. */}
          <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-6 md:pb-6">
            <div className="flex items-center gap-1.5" aria-hidden>
              {passos.map((p, n) => (
                <span
                  key={p.id}
                  className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-[#0a2d40]" : "w-1.5 bg-[#c9d8e2]")}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => ir(-1)}
                  aria-label="Passo anterior"
                  className="flex size-11 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e2ecf2]"
                >
                  <ArrowLeft className="size-5" weight="bold" />
                </button>
              )}
              <button
                type="button"
                onClick={() => (ultimo ? onConcluir() : ir(1))}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
              >
                {ultimo ? "Começar" : "Próximo"}
                {!ultimo && <ArrowRight className="size-4" weight="bold" />}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Guarda que a pessoa viu: servidor (fonte) e um marcador local (resposta imediata). */
export function useMarcarVisto() {
  const { user } = useAuth();
  const [, iniciar] = useTransition();
  return useCallback(
    (versao: VersaoTutorial) => {
      gravarArmazenado("local", chaveVistoLocal(user.id, versao));
      iniciar(async () => {
        const r = await marcarTutorialVisto(versao).catch(() => ({ ok: false }));
        if (!r.ok) console.warn("[tutorial] não consegui guardar que o tutorial foi visto");
      });
    },
    [user.id],
  );
}

/**
 * Abre sozinho no primeiro acesso, com a versão do papel. Montado no AppShell
 * do perfil imobiliária. Lê o `user_metadata` da sessão do navegador, sem ida
 * ao servidor a cada tela.
 */
export function BoasVindasOpa() {
  const { user, activeOrg } = useAuth();
  const [versao, setVersao] = useState<VersaoTutorial | null>(null);
  const [oferta, setOferta] = useState<VersaoTutorial | null>(null);
  const marcar = useMarcarVisto();
  const checado = useRef(false);

  useEffect(() => {
    if (checado.current || !activeOrg) return;
    checado.current = true;
    if (lerArmazenado("session", CHAVE_DEPOIS)) return;
    // A marca vem do servidor (loadAuthUser): o cookie de sessão é HttpOnly e o
    // getSession() do navegador volta vazio, o que deixava o tutorial sem abrir
    // nunca no primeiro acesso (teste completo de 01/11/2026).
    const v = deveAbrirSozinho(activeOrg.role, user.is_platform_admin, { tutorial_opa: user.tutorial_opa });
    if (v && !lerArmazenado("local", chaveVistoLocal(user.id, v))) setVersao(v);
  }, [activeOrg, user.id, user.is_platform_admin, user.tutorial_opa]);

  return (
    <>
      {versao && (
        <PassoAPasso
          versao={versao}
          aberto
          primeiroAcesso
          onFechar={() => {
            gravarArmazenado("session", CHAVE_DEPOIS);
            setVersao(null);
          }}
          onConcluir={() => {
            marcar(versao);
            setVersao(null);
            setOferta(versao);
          }}
        />
      )}
      {oferta && <ConviteTour versao={oferta} onFechar={() => setOferta(null)} />}
      {/* useSearchParams pede Suspense; sem ele a tela inteira cai para render no cliente. */}
      <Suspense fallback={null}>
        <TourHost />
      </Suspense>
    </>
  );
}

/** Depois dos cartões: "agora na tela de verdade". Leva ao tour da tela atual, ou ao do Hoje. */
function ConviteTour({ versao, onFechar }: { versao: VersaoTutorial; onFechar: () => void }) {
  const pathname = usePathname();
  return (
    <div
      role="dialog"
      aria-labelledby="opa-convite-tour"
      className="fixed inset-x-3 bottom-[calc(var(--m-nav-clearance,0px)+12px)] z-50 rounded-[28px] bg-[#0a2d40] p-5 text-white shadow-[0_24px_60px_rgba(9,44,62,0.3)] md:inset-x-auto md:bottom-6 md:right-6 md:w-[360px]"
    >
      <p id="opa-convite-tour" className="text-[17px] font-semibold tracking-[-0.02em]">
        Agora na tela de verdade?
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-white/75">Um tour rápido aponta cada parte desta tela e diz o que ela faz.</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onFechar} className="h-11 rounded-full px-4 text-[14px] font-semibold text-white/80 hover:bg-white/10">
          Agora não
        </button>
        <button
          type="button"
          onClick={() => {
            onFechar();
            iniciarTour(tourDaRota(pathname) ?? "hoje", versao);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
        >
          Fazer o tour desta tela
          <ArrowRight className="size-4" weight="bold" />
        </button>
      </div>
    </div>
  );
}
