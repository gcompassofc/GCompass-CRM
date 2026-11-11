"use client";

/**
 * Verificação de segurança do acesso (Cloudflare Turnstile). Ver lib/seguranca/captcha.ts.
 *
 * Só é desenhado quando a página do servidor entrega a chave do site. Fica invisível
 * na maioria das vezes (aparece só se a Cloudflare pedir um clique) e avisa em texto
 * o que está acontecendo, para o botão desabilitado nunca ficar sem explicação.
 *
 * O código vale uma vez só e vence em poucos minutos: depois de cada tentativa de
 * envio, quem usa troca a `key` do campo, que é redesenhado e pede um código novo.
 */
import { useEffect, useRef, useState } from "react";

const ENDERECO = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render(
    onde: HTMLElement,
    opcoes: {
      sitekey: string;
      callback: (codigo: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "light";
      language: string;
      size: "flexible";
      appearance: "interaction-only";
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let carregamento: Promise<void> | null = null;

function carregarTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!carregamento) {
    carregamento = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ENDERECO;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        carregamento = null;
        s.remove();
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
  }
  return carregamento;
}

type Situacao = "conferindo" | "pronto" | "falhou";

export function CampoCaptcha({
  siteKey,
  onCodigo,
}: {
  siteKey: string;
  onCodigo: (codigo: string | null) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const idDoWidget = useRef<string | null>(null);
  const avisar = useRef(onCodigo);
  const [situacao, setSituacao] = useState<Situacao>("conferindo");

  useEffect(() => {
    avisar.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    let vivo = true;
    carregarTurnstile()
      .then(() => {
        if (!vivo || !caixa.current || !window.turnstile) return;
        idDoWidget.current = window.turnstile.render(caixa.current, {
          sitekey: siteKey,
          theme: "light",
          language: "pt-BR",
          size: "flexible",
          appearance: "interaction-only",
          callback: (codigo) => {
            setSituacao("pronto");
            avisar.current(codigo);
          },
          "expired-callback": () => {
            setSituacao("conferindo");
            avisar.current(null);
            if (idDoWidget.current && window.turnstile) window.turnstile.reset(idDoWidget.current);
          },
          "error-callback": () => {
            setSituacao("falhou");
            avisar.current(null);
          },
        });
      })
      .catch(() => {
        if (vivo) setSituacao("falhou");
      });
    return () => {
      vivo = false;
      if (idDoWidget.current && window.turnstile) window.turnstile.remove(idDoWidget.current);
      idDoWidget.current = null;
    };
  }, [siteKey]);

  return (
    <div className="space-y-1.5">
      <div ref={caixa} />
      {situacao === "conferindo" && (
        <p className="text-xs text-muted-foreground" role="status">
          Conferindo a segurança da conexão.
        </p>
      )}
      {situacao === "falhou" && (
        <p className="text-xs text-destructive" role="alert">
          A verificação de segurança não carregou. Recarregue a página. Se continuar, desligue o bloqueador de
          anúncios neste site ou tente outra rede.
        </p>
      )}
    </div>
  );
}
