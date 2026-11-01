/**
 * Telas de acesso na identidade da OPA (login, esqueci a senha, nova senha,
 * segundo fator, recuperação e aceite de convite): foto da caneca à esquerda e
 * o formulário à direita, num fundo claro e quente. No celular a foto vira uma
 * faixa no topo e o formulário ocupa o resto da tela.
 *
 * A foto fica em `public/opa/login-caneca.jpg`, com versões leves ao lado
 * (`login-caneca-<largura>.avif` e `.webp`, em 480, 768 e 1000 px). O otimizador
 * do next/image está desligado no `next.config.ts` (evita o `sharp` no contêiner),
 * então as versões são arquivos prontos e o `<picture>` escolhe a menor que serve.
 *
 * Para trocar a foto: substitua `login-caneca.jpg` (retrato, ao menos 1000 px de
 * largura), rode `python scripts/opa-foto-login.py` para refazer as versões e
 * ajuste `FOCO` para o ponto que não pode ser cortado: hoje é a caneca, em 51% na
 * horizontal e 56% na vertical.
 */

import { branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

const FOTO = "/opa/login-caneca";
const LARGURAS = [480, 768, 1000];
const FOCO = "51% 56%";
const TAMANHOS = "(min-width: 1024px) 52vw, 100vw";
const versoes = (ext: string) => LARGURAS.map((w) => `${FOTO}-${w}.${ext} ${w}w`).join(", ");

/**
 * Os formulários são os mesmos da instalação genérica; aqui só muda a pele, por
 * escopo: campos e botão principal maiores, botão em petróleo e cantos mais
 * redondos. Assim a lógica de autenticação não se mexe.
 */
const PELE = cn(
  "[&_label]:text-[13px] [&_label]:font-semibold [&_label]:text-[#0a2d40]",
  "[&_input:not([data-totp])]:h-12 [&_input:not([data-totp])]:rounded-[14px] [&_input:not([data-totp])]:border-[#d9d2c7]",
  "[&_input]:bg-white [&_input]:text-[15px] [&_input]:text-[#0a2d40] [&_input]:placeholder:text-[#8a8378]",
  // Foco no azul do logo: o petróleo transparente sobre o creme virava cinza.
  "[&_input:hover]:border-[#bfb6a8] [&_input:focus-visible]:border-[#2a7ca8] [&_input:focus-visible]:ring-[3px] [&_input:focus-visible]:ring-[#2a7ca8]/55",
  "[&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-full [&_button[type=submit]]:bg-[#0a2d40] [&_button[type=submit]]:text-[15px] [&_button[type=submit]]:font-semibold [&_button[type=submit]]:text-white",
  "[&_button[type=submit]:hover]:bg-[#123c55] [&_button[type=submit]:focus-visible]:ring-[3px] [&_button[type=submit]:focus-visible]:ring-[#0a2d40]/25 [&_button[type=submit]:focus-visible]:ring-offset-2",
  "[&_button[type=submit]:disabled]:opacity-70",
  "[&_[role=alert]]:rounded-[14px] [&_[role=status]]:rounded-[14px]",
);

export function LayoutAcessoOpa({ children }: { children: React.ReactNode }) {
  const { logoUrl, name } = branding();
  return (
    <div className="min-h-dvh bg-[#f7f3ee] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* Foto: faixa no celular, metade da tela no computador. */}
      <aside className="relative h-[32dvh] min-h-[220px] overflow-hidden rounded-b-[28px] lg:sticky lg:top-0 lg:h-dvh lg:rounded-none">
        <picture>
          <source type="image/avif" srcSet={versoes("avif")} sizes={TAMANHOS} />
          <source type="image/webp" srcSet={versoes("webp")} sizes={TAMANHOS} />
          { }
          <img
            src={`${FOTO}.jpg`}
            alt="Caneca de cerâmica com a marca OPA sobre a bancada"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: FOCO }}
          />
        </picture>
        {/* Gradiente só embaixo, onde fica a frase: o resto mantém a luz quente. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0a2d40]/85 via-[#0a2d40]/30 to-transparent lg:h-[42%]"
        />
        <div className="absolute inset-x-0 bottom-0 hidden p-12 text-white lg:block xl:p-14">
          <p className="max-w-[440px] text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Nós somos a OPA.
          </p>
          <p className="mt-3 max-w-[420px] text-[17px] leading-relaxed text-white/85">
            Cada conversa bem cuidada vira um bom negócio em Ilhabela.
          </p>
        </div>
      </aside>

      <main className="flex items-start justify-center px-6 pb-12 pt-8 sm:px-10 lg:min-h-dvh lg:items-center lg:py-16">
        <div className={cn("w-full max-w-[400px]", PELE)}>
          <div className="mb-8 lg:mb-10">
            {logoUrl ? (
              // Logo em SVG: next/image não otimiza SVG, então vai direto.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} width={104} height={40} className="h-9 w-auto lg:h-10" />
            ) : (
              <span className="text-2xl font-semibold text-[#0a2d40]">{name}</span>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Título das telas de acesso. Na OPA fica alinhado à esquerda, maior; na
 * instalação genérica continua centralizado, como era.
 */
export function CabecalhoAcesso({
  opa,
  titulo,
  subtitulo,
}: {
  opa: boolean;
  titulo: string;
  subtitulo?: React.ReactNode;
}) {
  if (!opa) {
    return (
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo ? <p className="text-sm text-muted-foreground">{subtitulo}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#0a2d40]">{titulo}</h1>
      {subtitulo ? <p className="text-[15px] leading-relaxed text-[#5b6b74]">{subtitulo}</p> : null}
    </div>
  );
}
