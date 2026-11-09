"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";
import { Check, Copy } from "@/lib/ui/icons";

import { gerarChaveRadar, pegarChaveRadar, pegarTokenEntrada } from "./actions";

/** Token mascarado na tela; o completo só vai para a área de transferência. */
export function CopiarPorta({ porta, finalToken }: { porta: string; finalToken: string | null }) {
  const [copiado, setCopiado] = useState<"porta" | "token" | null>(null);
  const [pendente, iniciar] = useTransition();
  const final = finalToken ? `••••${finalToken}` : "sem token";

  // Pelo copyToClipboard (lib/clipboard): fora de contexto seguro (http, IP
  // direto) a API de área de transferência nem existe, e o clique quebrava sem aviso.
  const copiar = async (texto: string, o: "porta" | "token") => {
    if (!(await copyToClipboard(texto))) {
      toast.error("Não consegui copiar. Selecione e copie à mão.");
      return;
    }
    setCopiado(o);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[12px] text-[#5b7284]">token {final}</span>
      <button
        type="button"
        onClick={() => copiar(`${window.location.origin}${porta}`, "porta")}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
      >
        {copiado === "porta" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar endereço
      </button>
      {finalToken && (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const t = await pegarTokenEntrada();
              if (!t) {
                toast.error("Só gestor copia o token.");
                return;
              }
              await copiar(t, "token");
            })
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
        >
          {copiado === "token" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar token
        </button>
      )}
    </div>
  );
}

/**
 * Chave do OPA Radar (09/11/2026): o Radar manda sozinho as distribuições para
 * Captações do Radar. O administrador gera; gestor e administrador copiam. Na tela
 * só o final; a chave inteira vai direto para a área de transferência.
 */
export function ChaveDoRadar({ porta, finalChave, podeGerar }: { porta: string; finalChave: string | null; podeGerar: boolean }) {
  const [final, setFinal] = useState(finalChave);
  const [copiado, setCopiado] = useState<"porta" | "chave" | null>(null);
  const [pendente, iniciar] = useTransition();

  const copiar = async (texto: string, o: "porta" | "chave") => {
    if (!(await copyToClipboard(texto))) {
      toast.error("Não consegui copiar. Selecione e copie à mão.");
      return false;
    }
    setCopiado(o);
    setTimeout(() => setCopiado(null), 2000);
    return true;
  };

  const botao = "inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[12px] text-[#5b7284]">chave {final ? `••••${final}` : "não gerada"}</span>
      <button type="button" onClick={() => copiar(`${window.location.origin}${porta}`, "porta")} className={botao}>
        {copiado === "porta" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar endereço
      </button>
      {final && (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const t = await pegarChaveRadar();
              if (!t) return void toast.error("Só gestor copia a chave.");
              await copiar(t, "chave");
            })
          }
          className={botao}
        >
          {copiado === "chave" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar chave
        </button>
      )}
      {podeGerar && (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              if (final && !window.confirm("Trocar a chave do Radar? A atual para de valer na hora.")) return;
              const r = await gerarChaveRadar();
              if (!r.ok) return void toast.error(r.erro);
              setFinal(r.chave.slice(-4));
              if (await copiar(r.chave, "chave")) toast.success("Chave nova copiada. Cole no .env do Radar (RADAR_CRM_TOKEN).");
            })
          }
          className={botao}
        >
          {final ? "Trocar chave" : "Gerar chave"}
        </button>
      )}
    </div>
  );
}
