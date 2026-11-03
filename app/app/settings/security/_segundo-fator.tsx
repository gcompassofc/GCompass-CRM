"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TOTPInput } from "@/components/auth/TOTPInput";
import { RecoveryCodesPanel } from "@/components/auth/RecoveryCodesPanel";
import { enrollMfa } from "@/app/actions/auth/enrollMfa";
import { confirmMfaEnroll } from "@/app/actions/auth/confirmMfaEnroll";
import {
  concluirAplicativo,
  confirmarAtivacao,
  desligarSegundoFator,
  pedirCodigoDeAtivacao,
} from "@/app/actions/settings/segundoFator";
import { cn } from "@/lib/utils";

type Metodo = "nenhum" | "app" | "email" | "whatsapp";

interface Props {
  metodo: Metodo;
  email: string | null;
  whatsapp: string | null;
  canais: { email: boolean; whatsapp: boolean };
}

type Passo =
  | { tipo: "lista" }
  | { tipo: "app"; fator: string; qr: string; segredo: string }
  | { tipo: "app-codigos"; codigos: string[] }
  | { tipo: "numero" }
  | { tipo: "codigo"; canal: "email" | "whatsapp"; destino: string };

const ERRO_ENVIO: Record<string, string> = {
  aguarde: "Espere alguns segundos para pedir outro código.",
  email_indisponivel: "O envio de e-mail não está configurado nesta instalação.",
  whatsapp_indisponivel: "O WhatsApp de avisos da OPA não está conectado agora.",
  numero_invalido: "Número inválido. Use DDD + número, por exemplo 12 99999-9999.",
  falha_envio: "Não consegui mandar o código. Tente de novo.",
};

/**
 * Verificação em duas etapas, escolhida pela própria pessoa (03/11/2026):
 * aplicativo, código por e-mail, código por WhatsApp ou desligada. Trocar de
 * aplicativo é ligar o aplicativo de novo: o novo só substitui o antigo depois
 * de confirmado, então ninguém fica sem acesso no meio da troca.
 */
export function SegundoFatorCard({ metodo, email, whatsapp, canais }: Props) {
  const [passo, setPasso] = useState<Passo>({ tipo: "lista" });
  const [codigo, setCodigo] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const voltar = () => {
    setPasso({ tipo: "lista" });
    setCodigo("");
    setErro(null);
  };

  const comecarApp = () =>
    startTransition(async () => {
      setErro(null);
      const r = await enrollMfa();
      if (!r.ok) {
        setErro("Não consegui gerar o QR code. Tente de novo.");
        return;
      }
      setPasso({ tipo: "app", fator: r.factor_id, qr: r.qr_data_url, segredo: r.secret });
    });

  const confirmarApp = (valor: string, fator: string) =>
    startTransition(async () => {
      setErro(null);
      const r = await confirmMfaEnroll(valor, fator);
      if (!r.ok) {
        setCodigo("");
        setErro("Código errado. Confira o aplicativo e tente de novo.");
        return;
      }
      const fim = await concluirAplicativo(fator);
      if (!fim.ok) {
        setErro("O aplicativo novo foi confirmado, mas não consegui tirar o antigo. Recarregue a página.");
        return;
      }
      setCodigo("");
      setPasso({ tipo: "app-codigos", codigos: r.recovery_codes });
    });

  const pedirCodigo = (canal: "email" | "whatsapp") =>
    startTransition(async () => {
      setErro(null);
      const r = await pedirCodigoDeAtivacao(canal, canal === "whatsapp" ? numero : undefined);
      if (!r.ok) {
        setErro(ERRO_ENVIO[r.erro] ?? "Não deu certo.");
        return;
      }
      setPasso({ tipo: "codigo", canal, destino: r.destinoMascarado });
    });

  const confirmarCanal = (valor: string) =>
    startTransition(async () => {
      setErro(null);
      const r = await confirmarAtivacao(valor);
      if (!r.ok) {
        setCodigo("");
        setErro(
          r.erro === "errado"
            ? `Código errado.${r.restam ? ` Restam ${r.restam}.` : ""}`
            : r.erro === "falhou"
              ? "Não consegui salvar. Tente de novo."
              : "Este código não vale mais. Peça outro.",
        );
        return;
      }
      toast.success("Verificação em duas etapas atualizada.");
      window.location.reload();
    });

  const desligar = () => {
    if (!confirm("Desligar a verificação em duas etapas? Você vai entrar só com a senha.")) return;
    startTransition(async () => {
      const r = await desligarSegundoFator();
      if (!r.ok) {
        toast.error("Não consegui desligar. Tente de novo.");
        return;
      }
      toast.success("Verificação em duas etapas desligada.");
      window.location.reload();
    });
  };

  const opcoes: Array<{
    id: Metodo;
    titulo: string;
    texto: string;
    acao: string;
    indisponivel?: string;
    onClick: () => void;
  }> = [
    {
      id: "app",
      titulo: "Aplicativo autenticador",
      texto: "Google Authenticator, Microsoft Authenticator ou outro. Funciona sem internet no celular.",
      acao: metodo === "app" ? "Trocar de aplicativo" : "Usar aplicativo",
      onClick: comecarApp,
    },
    {
      id: "email",
      titulo: "Código por e-mail",
      texto: email ? `Chega em ${email} a cada entrada.` : "Chega no e-mail da conta a cada entrada.",
      acao: "Usar e-mail",
      indisponivel: canais.email ? undefined : "Envio de e-mail não configurado nesta instalação.",
      onClick: () => pedirCodigo("email"),
    },
    {
      id: "whatsapp",
      titulo: "Código por WhatsApp",
      texto:
        metodo === "whatsapp" && whatsapp
          ? `Chega em ${whatsapp}, pelo número de avisos da OPA.`
          : "Chega no seu WhatsApp, pelo número de avisos da OPA.",
      acao: metodo === "whatsapp" ? "Trocar número" : "Usar WhatsApp",
      indisponivel: canais.whatsapp ? undefined : "O número de avisos da OPA ainda não está conectado.",
      onClick: () => {
        setErro(null);
        setPasso({ tipo: "numero" });
      },
    },
    {
      id: "nenhum",
      titulo: "Desligada",
      texto: "Entra só com e-mail e senha.",
      acao: "Desligar",
      onClick: desligar,
    },
  ];

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold">Verificação em duas etapas</h2>
        <p className="text-sm text-muted-foreground">
          Além da senha, um código confirma que é você. Escolha como receber, ou desligue.
        </p>
      </div>

      {passo.tipo === "lista" && (
        <ul className="flex flex-col gap-2">
          {opcoes.map((o) => {
            const atual = o.id === metodo;
            const podeAgir = !o.indisponivel && (!atual || o.id === "app" || o.id === "whatsapp");
            return (
              <li
                key={o.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
                  atual ? "border-[#2a7ca8] bg-[#f2f8fb]" : "border-border",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {o.titulo}
                    {atual && <span className="ml-2 rounded-full bg-[#2a7ca8] px-2 py-0.5 text-[11px] font-semibold text-white">Em uso</span>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{o.indisponivel ?? o.texto}</p>
                </div>
                {podeAgir && (
                  <Button
                    size="sm"
                    variant={o.id === "nenhum" ? "outline" : "default"}
                    disabled={isPending}
                    onClick={o.onClick}
                  >
                    {o.acao}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {passo.tipo === "app" && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Abra o aplicativo autenticador no celular e escaneie o QR code.</li>
            <li>Digite o código de 6 números que aparecer.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={passo.qr} alt="QR code para o aplicativo autenticador" className="h-48 w-48 rounded-lg border" />
          <p className="text-xs text-muted-foreground">
            Sem câmera? Digite a chave: <code className="select-all break-all">{passo.segredo}</code>
          </p>
          <TOTPInput
            value={codigo}
            onChange={setCodigo}
            onComplete={(c) => confirmarApp(c, passo.fator)}
            disabled={isPending}
            autoFocus
            hasError={!!erro}
          />
          {metodo === "app" && (
            <p className="text-xs text-muted-foreground">O aplicativo antigo continua valendo até você confirmar o novo.</p>
          )}
        </div>
      )}

      {passo.tipo === "app-codigos" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pronto. Guarde estes códigos: eles servem se você perder o celular.</p>
          <RecoveryCodesPanel codes={passo.codigos} onAcknowledge={() => window.location.reload()} />
        </div>
      )}

      {passo.tipo === "numero" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            pedirCodigo("whatsapp");
          }}
        >
          <label className="text-sm font-medium" htmlFor="sf-whatsapp">
            Seu WhatsApp com DDD
          </label>
          <Input
            id="sf-whatsapp"
            inputMode="tel"
            placeholder="12 99999-9999"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={isPending || numero.replace(/\D/g, "").length < 10}>
            {isPending ? "Enviando…" : "Mandar código"}
          </Button>
        </form>
      )}

      {passo.tipo === "codigo" && (
        <div className="space-y-3">
          <p className="text-sm">
            Mandamos um código {passo.canal === "whatsapp" ? "no WhatsApp" : "no e-mail"} {passo.destino}. Digite aqui
            para ligar.
          </p>
          <TOTPInput
            value={codigo}
            onChange={setCodigo}
            onComplete={(c) => confirmarCanal(c)}
            disabled={isPending}
            autoFocus
            hasError={!!erro}
          />
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      {passo.tipo !== "lista" && passo.tipo !== "app-codigos" && (
        <Button variant="ghost" size="sm" onClick={voltar} disabled={isPending}>
          Cancelar
        </Button>
      )}
    </Card>
  );
}
