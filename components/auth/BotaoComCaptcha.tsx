"use client";

/**
 * Botão de envio para formulário de servidor (sem estado no cliente), com a verificação
 * de segurança junto. O Turnstile acrescenta sozinho o campo com o código ao <form>;
 * aqui o botão só espera o código chegar. Sem chave do site, é um botão comum.
 */
import { useState } from "react";

import { CampoCaptcha } from "@/components/auth/CampoCaptcha";

export function BotaoComCaptcha({
  siteKey,
  className,
  children,
}: {
  siteKey: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [codigo, setCodigo] = useState<string | null>(null);
  return (
    <>
      {siteKey && <CampoCaptcha siteKey={siteKey} onCodigo={setCodigo} />}
      <button type="submit" className={className} disabled={Boolean(siteKey) && !codigo}>
        {children}
      </button>
    </>
  );
}
