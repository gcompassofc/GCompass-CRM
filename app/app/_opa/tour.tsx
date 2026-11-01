"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/hooks/auth/AuthProvider";
import {
  linkDoTour,
  passosAtivos,
  posicaoDoBalao,
  recorte,
  TOURS,
  tourDaRota,
  toursPermitidos,
  type PassoAtivo,
  type Retangulo,
  type TourId,
} from "@/lib/opa/tour";
import { versaoDoPapel, versoesPermitidas, type VersaoTutorial } from "@/lib/opa/tutorial";
import { ArrowLeft, ArrowRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { marcarTourConcluido } from "../tutoriais/actions";

/**
 * Tour guiado nas telas reais (01/11/2026). Um recorte em volta do elemento de
 * verdade, com contorno petróleo e brilho que pulsa; o resto da tela escurece
 * e desfoca. O recorte desliza de um elemento para o próximo. Sem biblioteca:
 * o recorte é um retângulo com sombra gigante (escurece fora dele, com cantos
 * arredondados) e quatro painéis com `backdrop-filter` em volta (o desfoque).
 * Sem suporte a desfoque, fica só o escuro.
 *
 * Começa por evento (`iniciarTour`), pelo endereço (`?tour=fila&como=corretor`)
 * ou pelo "?" de cada tela. Os passos e a geometria estão em lib/opa/tour.ts.
 */
export const EVENTO_TOUR = "opa:tour";

export function iniciarTour(tour: TourId, como?: VersaoTutorial) {
  window.dispatchEvent(new CustomEvent(EVENTO_TOUR, { detail: { tour, como } }));
}

function elementoVisivel(alvo: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${alvo}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** Espera a tela carregar (as telas chegam por streaming): até `ms`, de 120 em 120 ms. */
function esperar(cond: () => boolean, ms: number): Promise<void> {
  return new Promise((ok) => {
    const fim = Date.now() + ms;
    const tentar = () => (cond() || Date.now() >= fim ? ok() : setTimeout(tentar, 120));
    tentar();
  });
}

const consultaMovimento = "(prefers-reduced-motion: reduce)";
function useMenosMovimento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consultaMovimento);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consultaMovimento).matches,
    () => false,
  );
}

const igual = (a: Retangulo | null, b: Retangulo | null) =>
  a === b ||
  (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

const ESCURO = "rgba(10,45,64,0.58)";
const CURVA = "cubic-bezier(.2,.8,.2,1)";

function Spotlight({ tour, versao, onFim }: { tour: TourId; versao: VersaoTutorial; onFim: (concluiu: boolean) => void }) {
  const [passos, setPassos] = useState<PassoAtivo[] | null>(null);
  const [i, setI] = useState(0);
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  const [tela, setTela] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [tamBalao, setTamBalao] = useState({ w: 360, h: 210 });
  const balaoRef = useRef<HTMLDivElement>(null);
  const menos = useMenosMovimento();
  const passo = passos?.[i] ?? null;
  const ultimo = passos ? i === passos.length - 1 : false;

  // Monta os passos depois que a tela carrega: elemento ausente sai ou vira explicação no centro.
  useEffect(() => {
    let vivo = true;
    const t = TOURS[tour];
    const alvos = t.passos.filter((p) => !p.so || p.so === versao).map((p) => p.alvo);
    void esperar(() => alvos.some((a) => elementoVisivel(a)), 2500).then(() => {
      if (vivo) setPassos(passosAtivos(t, versao, (a) => elementoVisivel(a) !== null));
    });
    return () => {
      vivo = false;
    };
  }, [tour, versao]);

  // Rola até o elemento do passo.
  useEffect(() => {
    if (!passo?.alvo) return;
    const el = elementoVisivel(passo.alvo);
    if (el) {
      // No celular o elemento sobe para o topo; sem folga, o brilho do recorte
      // ficava cortado na borda da tela. scroll-margin vale para qualquer rolagem.
      el.style.scrollMarginTop = "24px";
      el.scrollIntoView({
        block: window.innerWidth < 768 ? "start" : "center",
        inline: "nearest",
        behavior: menos ? "auto" : "smooth",
      });
    }
    balaoRef.current?.focus({ preventScroll: true });
  }, [passo, menos]);

  // Mede a cada quadro: acompanha rolagem, mudança de tamanho e a tela que ainda está carregando.
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      const el = passo?.alvo ? elementoVisivel(passo.alvo) : null;
      const r = el?.getBoundingClientRect();
      const novo = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setAlvo((v) => (igual(v, novo) ? v : novo));
      setTela((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const b = balaoRef.current;
      if (b) setTamBalao((v) => (v.w === b.offsetWidth && v.h === b.offsetHeight ? v : { w: b.offsetWidth, h: b.offsetHeight }));
      quadro = requestAnimationFrame(medir);
    };
    quadro = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(quadro);
  }, [passo]);

  const ir = useCallback(
    (delta: number) => {
      if (!passos) return;
      if (delta > 0 && i === passos.length - 1) return onFim(true);
      setI((v) => Math.min(passos.length - 1, Math.max(0, v + delta)));
    },
    [passos, i, onFim],
  );

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFim(false);
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ir, onFim]);

  if (!passos || !passo) return null;

  const furo = passo.alvo && alvo ? recorte(alvo, tela) : null;
  const pos = posicaoDoBalao(furo, tamBalao, tela);
  const transicao = menos ? undefined : `top 380ms ${CURVA}, left 380ms ${CURVA}, width 380ms ${CURVA}, height 380ms ${CURVA}`;
  const raio = furo ? Math.min(22, furo.height / 2, furo.width / 2) : 0;
  const painel = "fixed backdrop-blur-[3px] pointer-events-auto";

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-tour-ativo={tour}>
      <style>{`@keyframes opa-tour-pulso{0%{transform:scale(1);opacity:.75}70%{transform:scale(1.035);opacity:0}100%{opacity:0}}`}</style>

      {furo ? (
        <>
          {/* Desfoque em volta (quatro painéis) e o escuro, com cantos redondos, na sombra do recorte. */}
          <div className={painel} style={{ top: 0, left: 0, width: "100%", height: furo.top, transition: transicao }} />
          <div className={painel} style={{ top: furo.top + furo.height, left: 0, width: "100%", bottom: 0, transition: transicao }} />
          <div className={painel} style={{ top: furo.top, left: 0, width: furo.left, height: furo.height, transition: transicao }} />
          <div
            className={painel}
            style={{ top: furo.top, left: furo.left + furo.width, right: 0, height: furo.height, transition: transicao }}
          />
          <div
            data-tour-recorte
            className="pointer-events-auto fixed border-2 border-[#8fc4dd]"
            style={{
              top: furo.top,
              left: furo.left,
              width: furo.width,
              height: furo.height,
              borderRadius: raio,
              boxShadow: `0 0 0 4px rgba(42,124,168,0.35), 0 0 28px 6px rgba(42,124,168,0.55), 0 0 0 200vmax ${ESCURO}`,
              transition: transicao,
            }}
          >
            {!menos && (
              <span
                aria-hidden
                className="absolute -inset-1.5 border-2 border-[#2a7ca8]"
                style={{ borderRadius: raio + 6, animation: "opa-tour-pulso 1.8s ease-out infinite" }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 backdrop-blur-[3px]" style={{ background: ESCURO }} />
      )}

      <div
        ref={balaoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="opa-tour-titulo"
        aria-describedby="opa-tour-texto"
        tabIndex={-1}
        className={cn(
          "pointer-events-auto fixed z-[61] bg-white text-[#0a2d40] shadow-[0_24px_60px_rgba(9,44,62,0.28)] outline-none",
          pos.modo === "faixa" ? "inset-x-0 bottom-0 rounded-t-[28px] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-5" : "w-[360px] rounded-[28px] p-6",
        )}
        style={
          pos.modo === "flutuante"
            ? { top: pos.top, left: pos.left, transition: menos ? undefined : `top 380ms ${CURVA}, left 380ms ${CURVA}` }
            : pos.modo === "centro"
              ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
              : undefined
        }
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#eef3f6] px-3 py-1 text-[12px] font-semibold tabular-nums text-[#12455f]">
            {i + 1} de {passos.length}
          </span>
          <button
            type="button"
            onClick={() => onFim(false)}
            className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b7284] hover:bg-[#eef3f6] hover:text-[#0a2d40]"
          >
            Sair
          </button>
        </div>
        <h2 id="opa-tour-titulo" className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em]">
          {passo.titulo}
        </h2>
        <p id="opa-tour-texto" aria-live="polite" className="mt-1.5 text-[15px] leading-relaxed text-[#34566b]">
          {passo.texto}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {passos.map((p, n) => (
              <span key={`${p.alvo ?? "centro"}-${n}`} className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-[#0a2d40]" : "w-1.5 bg-[#c9d8e2]")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => ir(-1)}
                aria-label="Voltar"
                className="flex size-11 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e2ecf2]"
              >
                <ArrowLeft className="size-5" weight="bold" />
              </button>
            )}
            <button
              type="button"
              onClick={() => ir(1)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
            >
              {ultimo ? "Concluir" : "Próximo"}
              {!ultimo && <ArrowRight className="size-4" weight="bold" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Fica montado no AppShell do perfil imobiliária: ouve o evento, lê
 * `?tour=` no endereço e leva para a tela certa quando o tour é de outra.
 * O admin ou gestor pode pedir `como=corretor` para ver o tour do corretor.
 */
export function TourHost() {
  const { user, activeOrg } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [ativo, setAtivo] = useState<{ tour: TourId; versao: VersaoTutorial } | null>(null);
  const papel = activeOrg?.role ?? null;

  const comecar = useCallback(
    async (tour: string, como?: string | null) => {
      if (!Object.hasOwn(TOURS, tour)) return;
      const id = tour as TourId;
      const versoes = versoesPermitidas(papel, user.is_platform_admin);
      const versao = como && versoes.includes(como as VersaoTutorial) ? (como as VersaoTutorial) : versaoDoPapel(papel, user.is_platform_admin);
      if (!versao || !toursPermitidos(versao).some((t) => t.id === id)) return;
      const aqui = tourDaRota(pathname);
      if (aqui === id) return setAtivo({ tour: id, versao });
      if (id === "ficha" && aqui === "leads") {
        // O tour da ficha precisa de um lead aberto: entra no primeiro da lista.
        await esperar(() => elementoVisivel("leads-item") !== null, 2000);
        const primeiro = document.querySelector<HTMLAnchorElement>('[data-tour="leads-item"]')?.getAttribute("href");
        if (primeiro) return router.push(`${primeiro}?tour=ficha&como=${versao}`);
        return setAtivo({ tour: id, versao });
      }
      router.push(linkDoTour(id, versao));
    },
    [papel, user.is_platform_admin, pathname, router],
  );

  // `?tour=` no endereço: começa e tira o parâmetro (recarregar não repete).
  const tourNoEndereco = params.get("tour");
  const comoNoEndereco = params.get("como");
  useEffect(() => {
    if (!tourNoEndereco) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    url.searchParams.delete("como");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const t = setTimeout(() => void comecar(tourNoEndereco, comoNoEndereco), 0);
    return () => clearTimeout(t);
  }, [tourNoEndereco, comoNoEndereco, comecar]);

  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent<{ tour: string; como?: string }>).detail;
      if (d?.tour) void comecar(d.tour, d.como);
    };
    window.addEventListener(EVENTO_TOUR, ouvir);
    return () => window.removeEventListener(EVENTO_TOUR, ouvir);
  }, [comecar]);

  if (!ativo) return null;
  return (
    <Spotlight
      key={`${ativo.tour}:${ativo.versao}`}
      tour={ativo.tour}
      versao={ativo.versao}
      onFim={(concluiu) => {
        setAtivo(null);
        if (concluiu) void marcarTourConcluido(ativo.tour).catch(() => undefined);
      }}
    />
  );
}
