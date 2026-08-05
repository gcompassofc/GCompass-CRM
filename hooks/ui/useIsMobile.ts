"use client";
import { useEffect, useState } from "react";

/**
 * `true` abaixo do breakpoint `md` do Tailwind (768px).
 *
 * Existe para o punhado de casos que CSS não resolve: TEXTO que muda com a
 * largura. Um placeholder é atributo, não elemento — não dá para escondê-lo
 * com `max-md:hidden`, e "Enter envia, Shift+Enter quebra linha" é instrução
 * morta em quem não tem teclado.
 *
 * Preferir SEMPRE `max-md:` no className quando o que muda é aparência. Este
 * hook só entra quando muda o conteúdo.
 *
 * Começa `false` e corrige no efeito: no servidor não existe largura, e chutar
 * `true` faria o desktop renderizar o texto curto e trocar depois da
 * hidratação — piscada visível. `false` primeiro significa que o desktop
 * acerta de primeira e só o celular ajusta, uma vez.
 */
const MOBILE_ATE = 767;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // `matchMedia` não existe no jsdom (e falta em navegadores muito antigos).
    // Sem esta guarda, o hook DERRUBAVA todo componente que o montasse — o
    // Composer inteiro quebrou nos testes por causa de um placeholder.
    // Ausência de `matchMedia` significa "não sei a largura", e o padrão
    // seguro é o layout de desktop, que é o mais completo.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_ATE}px)`);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isMobile;
}
