"use client";

import { useState, useTransition } from "react";

import { TOTPInput } from "@/components/auth/TOTPInput";
import { Button } from "@/components/ui/button";
import { confirmarCodigoDeAcesso, reenviarCodigoDeAcesso } from "@/app/actions/auth/codigoDeAcesso";

const ERROS: Record<string, string> = {
  invalido: "Digite os 6 números.",
  expirado: "Este código venceu. Peça um novo.",
  tentativas: "Muitas tentativas com este código. Peça um novo.",
  sem_codigo: "Não há código valendo. Peça um novo.",
};

/** Digitar o código do e-mail ou do WhatsApp, com reenvio (e e-mail como saída). */
export function CodigoDeAcessoForm({ next, podeUsarEmail }: { next?: string; podeUsarEmail: boolean }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();
  const [isPending, startTransition] = useTransition();

  const enviar = (valor?: string) => {
    const c = valor ?? codigo;
    if (c.length !== 6) return;
    setErro(null);
    startTransition(async () => {
      const r = await confirmarCodigoDeAcesso(c, next);
      if (!r) return; // redirecionou
      setCodigo("");
      setErro(
        r.erro === "errado"
          ? `Código errado.${r.restam ? ` Restam ${r.restam} tentativa${r.restam > 1 ? "s" : ""}.` : ""}`
          : (ERROS[r.erro] ?? "Não deu certo. Tente de novo."),
      );
    });
  };

  const reenviar = (porEmail: boolean) => {
    setErro(null);
    setAviso(null);
    startEnvio(async () => {
      const r = await reenviarCodigoDeAcesso(porEmail);
      if (r.ok) setAviso(`Código novo enviado para ${r.destinoMascarado}.`);
      else if (r.erro === "aguarde") setAviso(`Aguarde ${r.segundos ?? 45}s para pedir outro código.`);
      else if (r.erro === "whatsapp_indisponivel")
        setErro("O WhatsApp de avisos está fora do ar agora." + (podeUsarEmail ? " Peça pelo e-mail." : " Fale com o administrador."));
      else setErro("Não consegui mandar o código. Tente de novo em instantes.");
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="space-y-6"
      noValidate
    >
      <TOTPInput
        value={codigo}
        onChange={setCodigo}
        onComplete={(c) => enviar(c)}
        disabled={isPending}
        autoFocus
        hasError={!!erro}
      />

      {erro && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {erro}
        </div>
      )}
      {aviso && !erro && (
        <div role="status" className="rounded-md bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
          {aviso}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending || codigo.length !== 6}>
        {isPending ? "Conferindo…" : "Entrar"}
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm">
        <button type="button" disabled={enviando} onClick={() => reenviar(false)} className="font-medium text-[#2a7ca8] hover:underline disabled:opacity-60">
          {enviando ? "Enviando…" : "Não chegou? Mandar outro código"}
        </button>
        {podeUsarEmail && (
          <button type="button" disabled={enviando} onClick={() => reenviar(true)} className="text-muted-foreground hover:underline disabled:opacity-60">
            Receber pelo e-mail
          </button>
        )}
      </div>
    </form>
  );
}
