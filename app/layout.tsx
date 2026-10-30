import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Mono, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { branding } from "@/lib/branding";
import { ThemeProvider } from "@/lib/theme";
import { Providers } from "./providers";
import { PublicEnvScript } from "./public-env-script";
import "./globals.css";
import "./marca-opa.css";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-atkinson",
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

/**
 * Metadata dinâmica (não `export const metadata`) para a marca ser lida em RUNTIME.
 * Constante seria resolvida durante o `next build`, e a imagem self-host — que é
 * pré-buildada — carregaria a nossa marca para sempre. Ver `lib/branding.ts`.
 *
 * O `template` é o que faz a marca existir em UM lugar só: as páginas filhas
 * declaram apenas o próprio nome ("Entrar") e herdam o sufixo daqui.
 */
export function generateMetadata(): Metadata {
  const { name } = branding();
  return {
    title: {
      default: `${name} — atendimento e vendas por WhatsApp com agentes de IA`,
      template: `%s · ${name}`,
    },
    description:
      "Centralize o atendimento por WhatsApp num funil só. Agentes de IA resolvem o que dá pra resolver e passam para o time humano o que importa — com tudo registrado. Multi-tenant, LGPD-nativo, feito para operações brasileiras.",
    applicationName: name,
    authors: [{ name }],
    keywords: [
      "CRM",
      "atendimento",
      "WhatsApp",
      "IA conversacional",
      "LGPD",
      "multi-tenant",
    ],
    robots: { index: false, follow: false },
  };
}

// App instalável em celular: viewport travado como o do WhatsApp. Sem pinch-zoom
// e sem duplo-toque, senão o usuário zoomando um balão desalinha a tela inteira
// e não tem gesto óbvio pra voltar. `interactive-widget` impede que o teclado
// virtual encolha o layout viewport — a barra de escrever sobe junto com ele.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#161510" },
  ],
};

// Inline FOUC-prevention. Conteúdo é string literal estática (zero input do usuário),
// portanto seguro. Lê localStorage + prefers-color-scheme antes do primeiro paint.
// Inline FOUC-prevention. Conteúdo é string literal estática (zero input do usuário),
// portanto seguro. Lê localStorage + prefers-color-scheme antes do primeiro paint.
// O tema padrão (sem escolha salva) vem de APP_THEME_DEFAULT, lido em runtime
// como a marca: a instalação da OPA nasce clara, a padrão nasce escura.
function themeInitScript(padrao: "light" | "dark"): string {
  return `(function(){try{var s=localStorage.getItem('deskcomm-theme');var r=(s==='dark'||s==='light')?s:'${padrao}';document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','${padrao}');}})();`;
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const temaPadrao = process.env.APP_THEME_DEFAULT === "light" ? "light" : "dark";
  const marca = process.env.APP_PALETTE?.trim() || undefined;
  return (
    <html
      lang="pt-BR"
      data-theme={temaPadrao}
      data-tema-padrao={temaPadrao}
      data-marca={marca}
      suppressHydrationWarning
      className={`${atkinson.variable} ${plexMono.variable} ${inter.variable}`}
    >
      <head>
        {/* Config pública do Supabase em runtime (imagem genérica self-host). */}
        <PublicEnvScript />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(temaPadrao) }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <Providers>
          <ThemeProvider>{children}</ThemeProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
          />
        </Providers>
      </body>
    </html>
  );
}
