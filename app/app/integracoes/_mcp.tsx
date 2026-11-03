"use client";

import { useState } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";
import { Check, Copy } from "@/lib/ui/icons";

/**
 * Endereço completo do servidor MCP, com copiar: quem configura o Claude precisa
 * da URL e do token, e só o caminho (/api/mcp) não basta (03/11/2026).
 */
export function UrlMcp({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!(await copyToClipboard(url))) {
      toast.error("Não consegui copiar. Selecione e copie à mão.");
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 select-all truncate rounded-full bg-white px-3 py-1.5 font-mono text-[12px] text-[#0a2d40]" title={url}>
        {url}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar URL
      </button>
    </div>
  );
}
