/**
 * Ilustrações geométricas simples, no espírito do design system Planta
 * (prédios em blocos, uma janela de destaque), com as cores da OPA:
 * profundo #0a2d40, marinho #12455f, ação #2a7ca8, claro #8fc4dd, névoa #dce8ee.
 * SVG puro, sem imagem para baixar: carrega junto com a página.
 */
import { cn } from "@/lib/utils";

type P = { className?: string };

/** Casa de ilha com telhado e uma janela acesa, mais o mar embaixo. */
export function IlustraCasa({ className }: P) {
  return (
    <svg viewBox="0 0 220 150" aria-hidden className={cn("h-auto w-full", className)}>
      <circle cx="176" cy="38" r="22" fill="#8fc4dd" />
      <path d="M0 132 Q55 120 110 132 T220 132 V150 H0Z" fill="#dce8ee" />
      <rect x="36" y="70" width="104" height="66" rx="6" fill="#12455f" />
      <path d="M28 74 L88 30 L148 74Z" fill="#0a2d40" />
      <rect x="52" y="86" width="20" height="18" rx="3" fill="#dce8ee" />
      <rect x="80" y="86" width="20" height="18" rx="3" fill="#2a7ca8" />
      <rect x="108" y="86" width="20" height="18" rx="3" fill="#dce8ee" />
      <rect x="80" y="112" width="20" height="24" rx="3" fill="#f2f8fb" />
      <rect x="150" y="96" width="44" height="40" rx="6" fill="#0a2d40" />
      <rect x="158" y="104" width="12" height="10" rx="2" fill="#dce8ee" />
      <rect x="174" y="104" width="12" height="10" rx="2" fill="#8fc4dd" />
    </svg>
  );
}

/** Prédios em blocos (Planta), para totais e carteira. */
export function IlustraPredios({ className }: P) {
  const janelas = (x: number, y: number, cols: number, rows: number, destaque: number[]) =>
    Array.from({ length: cols * rows }, (_, i) => (
      <rect
        key={`${x}-${i}`}
        x={x + (i % cols) * 14}
        y={y + Math.floor(i / cols) * 14}
        width="9"
        height="7"
        rx="1.5"
        fill={destaque.includes(i) ? "#2a7ca8" : "#dce8ee"}
      />
    ));
  return (
    <svg viewBox="0 0 150 130" aria-hidden className={cn("h-auto w-full", className)}>
      <rect x="10" y="40" width="58" height="90" rx="6" fill="#0a2d40" />
      {janelas(18, 50, 3, 5, [4])}
      <rect x="74" y="12" width="70" height="118" rx="6" fill="#12455f" />
      {janelas(82, 22, 4, 7, [5, 18])}
    </svg>
  );
}

/** Balão de conversa, para fila e WhatsApp. */
export function IlustraConversa({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={cn("h-auto w-full", className)}>
      <rect x="10" y="14" width="96" height="62" rx="20" fill="#12455f" />
      <path d="M30 76 L26 96 L48 76Z" fill="#12455f" />
      <circle cx="40" cy="45" r="6" fill="#dce8ee" />
      <circle cx="58" cy="45" r="6" fill="#8fc4dd" />
      <circle cx="76" cy="45" r="6" fill="#dce8ee" />
      <rect x="70" y="56" width="80" height="48" rx="18" fill="#dce8ee" />
      <path d="M132 104 L138 116 L122 104Z" fill="#dce8ee" />
      <rect x="84" y="72" width="40" height="7" rx="3.5" fill="#2a7ca8" />
      <rect x="84" y="84" width="26" height="7" rx="3.5" fill="#8fc4dd" />
    </svg>
  );
}

/** Sino com selo, para lembretes. */
export function IlustraSino({ className }: P) {
  return (
    <svg viewBox="0 0 140 120" aria-hidden className={cn("h-auto w-full", className)}>
      <path d="M70 18 C46 18 36 36 36 58 V78 L26 92 H114 L104 78 V58 C104 36 94 18 70 18Z" fill="#12455f" />
      <rect x="58" y="94" width="24" height="12" rx="6" fill="#0a2d40" />
      <circle cx="104" cy="26" r="14" fill="#2a7ca8" />
      <rect x="50" y="44" width="40" height="7" rx="3.5" fill="#dce8ee" />
      <rect x="50" y="58" width="26" height="7" rx="3.5" fill="#8fc4dd" />
    </svg>
  );
}

/** Calendário com um dia marcado, para visitas e agenda. */
export function IlustraAgenda({ className }: P) {
  return (
    <svg viewBox="0 0 140 120" aria-hidden className={cn("h-auto w-full", className)}>
      <rect x="18" y="20" width="104" height="90" rx="14" fill="#12455f" />
      <rect x="18" y="20" width="104" height="24" rx="12" fill="#0a2d40" />
      <rect x="40" y="12" width="8" height="18" rx="4" fill="#8fc4dd" />
      <rect x="92" y="12" width="8" height="18" rx="4" fill="#8fc4dd" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={30 + (i % 4) * 22} y={54 + Math.floor(i / 4) * 17} width="14" height="10" rx="3" fill={i === 6 ? "#2a7ca8" : "#dce8ee"} />
      ))}
    </svg>
  );
}

/** Vazio tranquilo: onda e sol, para "ninguém esperando". */
export function IlustraCalma({ className }: P) {
  return (
    <svg viewBox="0 0 200 100" aria-hidden className={cn("h-auto w-full", className)}>
      <circle cx="100" cy="58" r="30" fill="#8fc4dd" />
      <path d="M0 70 Q50 56 100 70 T200 70 V100 H0Z" fill="#2a7ca8" />
      <path d="M0 82 Q50 70 100 82 T200 82 V100 H0Z" fill="#12455f" />
    </svg>
  );
}
