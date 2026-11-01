/** Estado do WhatsApp do corretor, em palavras que a tela entende. */
export type EstadoMeuWhatsapp = "sem" | "preparando" | "qr" | "conectado" | "caiu";

/** Status do WAHA (coluna `channel_sessions.status`) para o estado da tela. */
export function estadoDaSessao(status: string | null | undefined): EstadoMeuWhatsapp {
  switch (status) {
    case "SCAN_QR_CODE":
      return "qr";
    case "WORKING":
      return "conectado";
    case "STOPPED":
    case "FAILED":
      return "caiu";
    default:
      return "preparando";
  }
}

/** (12) 9••••-1170: o número aparece só pelo DDD e pelo final. */
export function mascararTelefone(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)}••••-${d.slice(-4)}`;
}
