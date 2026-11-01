"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Chip, Cartao, TituloBloco } from "../_opa/ui";
import { ArrowsClockwise, CheckCircle, CircleNotch, QrCode, WhatsappLogo, WifiHigh, WifiSlash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { conectarMeuWhatsapp, estadoMeuWhatsapp, reconectarMeuWhatsapp, type MeuWhatsapp } from "./actions";

const PASSOS = [
  "Abra o WhatsApp no seu celular.",
  "Toque em Aparelhos conectados.",
  "Toque em Conectar um aparelho e aponte a câmera para o código.",
];

function Passos() {
  return (
    <ol className="flex flex-col gap-3">
      {PASSOS.map((p, i) => (
        <li key={p} className="flex items-start gap-3 text-[15px] text-[#0a2d40]">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-[13px] font-semibold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5">{p}</span>
        </li>
      ))}
    </ol>
  );
}

const BOTAO =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function MeuWhatsappCliente({ inicial }: { inicial: MeuWhatsapp }) {
  const [e, setE] = useState<MeuWhatsapp>(inicial);
  const [tick, setTick] = useState(0);
  const [pendente, iniciar] = useTransition();
  const anterior = useRef(inicial.estado);

  const atualizar = useCallback(async () => {
    try {
      setE(await estadoMeuWhatsapp());
    } catch {
      // erro de rede passageiro: a próxima rodada tenta de novo
    }
  }, []);

  // Pergunta o estado de 3 em 3 segundos enquanto falta algo (QR, preparo); de 15 em 15 quando está no ar.
  useEffect(() => {
    if (e.estado === "sem") return;
    const iv = setInterval(atualizar, e.estado === "conectado" ? 15_000 : 3_000);
    return () => clearInterval(iv);
  }, [e.estado, atualizar]);

  // O QR do WhatsApp vence em cerca de 20 s: troca a imagem a cada 15 s enquanto espera a leitura.
  useEffect(() => {
    if (e.estado !== "qr") return;
    const iv = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(iv);
  }, [e.estado]);

  // Avisa a mudança que importa: o número entrou no ar ou caiu.
  useEffect(() => {
    if (anterior.current !== "conectado" && e.estado === "conectado") toast.success("WhatsApp conectado. Suas conversas já chegam aqui.");
    if (anterior.current === "conectado" && e.estado === "caiu") toast.error("Seu WhatsApp desconectou. Toque em Reconectar.");
    anterior.current = e.estado;
  }, [e.estado]);

  const rodar = (fn: () => Promise<MeuWhatsapp>, ok?: string) =>
    iniciar(async () => {
      try {
        const r = await fn();
        setE(r);
        if (r.erro) toast.error(r.erro);
        else if (ok) toast.success(ok);
      } catch {
        toast.error("Não deu certo agora. Tente de novo em instantes.");
      }
    });

  const conectar = () => rodar(conectarMeuWhatsapp, "Pronto. Agora leia o código com o celular.");
  const reconectar = (novoQr: boolean) =>
    rodar(() => reconectarMeuWhatsapp(novoQr), novoQr ? "Código novo a caminho." : "Reconectando o seu número.");

  return (
    <Cartao bloco className="mx-auto w-full max-w-3xl">
      <TituloBloco icone={WhatsappLogo} titulo="O seu número de WhatsApp" sub="Só você vê e mexe nele" />

      <div className="mt-6 flex flex-wrap items-center gap-2" aria-live="polite">
        {e.estado === "conectado" && (
          <Chip icone={WifiHigh} tom="ok">
            Conectado{e.telefone ? `, ${e.telefone}` : ""}
          </Chip>
        )}
        {e.estado === "qr" && (
          <Chip icone={QrCode} tom="aviso">
            Aguardando a leitura do código
          </Chip>
        )}
        {e.estado === "preparando" && (
          <Chip icone={CircleNotch} tom="neutro">
            Preparando
          </Chip>
        )}
        {e.estado === "caiu" && (
          <Chip icone={WifiSlash} tom="alerta">
            Desconectado
          </Chip>
        )}
        {e.estado === "sem" && (
          <Chip icone={WifiSlash} tom="neutro">
            Ainda não conectado
          </Chip>
        )}
      </div>

      {e.estado === "sem" && (
        <div className="mt-6 flex flex-col gap-6">
          <p className="text-[15px] leading-relaxed text-[#34566b]">
            Conecte o seu WhatsApp para atender os leads por aqui. Leva menos de um minuto e você não precisa instalar nada.
          </p>
          <Passos />
          <div>
            <button type="button" onClick={conectar} disabled={pendente} className={cn(BOTAO, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
              {pendente ? <CircleNotch className="size-5 animate-spin" aria-hidden /> : <WhatsappLogo className="size-5" aria-hidden />}
              {pendente ? "Preparando o código" : "Conectar meu WhatsApp"}
            </button>
          </div>
        </div>
      )}

      {e.estado === "preparando" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8 text-[15px] text-[#5b7284]">
          <CircleNotch className="size-9 animate-spin" aria-hidden />
          Preparando o código. Já já ele aparece aqui.
        </div>
      )}

      {e.estado === "qr" && e.sessaoId && (
        <div className="mt-6 grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
          {/* O QR muda a cada ~20 s: trocar só o src evita o flash de remontar o elemento. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/channel-sessions/${e.sessaoId}/qr?t=${tick}`}
            alt="Código para conectar o WhatsApp"
            className="mx-auto size-64 rounded-[24px] border border-[#d5e2ea] bg-white p-3"
          />
          <div className="flex flex-col gap-6">
            <Passos />
            <p className="text-[13px] text-[#5b7284]">O código se renova sozinho. Se demorar, é só ler o que estiver na tela.</p>
            <div>
              <button type="button" onClick={() => reconectar(true)} disabled={pendente} className={cn(BOTAO, "bg-[#e7f0f5] text-[#0a2d40] hover:bg-[#d5e2ea]")}>
                {pendente ? <CircleNotch className="size-5 animate-spin" aria-hidden /> : <ArrowsClockwise className="size-5" aria-hidden />}
                Gerar código novo
              </button>
            </div>
          </div>
        </div>
      )}

      {e.estado === "conectado" && (
        <div className="mt-6 flex flex-col gap-5">
          <p className="flex items-start gap-3 text-[15px] leading-relaxed text-[#34566b]">
            <CheckCircle weight="fill" className="mt-0.5 size-6 shrink-0 text-[#1d6b43]" aria-hidden />
            Tudo certo. As conversas novas do seu WhatsApp chegam para você classificar como lead ou particular.
          </p>
          <div>
            <button type="button" onClick={() => reconectar(false)} disabled={pendente} className={cn(BOTAO, "bg-[#e7f0f5] text-[#0a2d40] hover:bg-[#d5e2ea]")}>
              {pendente ? <CircleNotch className="size-5 animate-spin" aria-hidden /> : <ArrowsClockwise className="size-5" aria-hidden />}
              Reiniciar a conexão
            </button>
          </div>
        </div>
      )}

      {e.estado === "caiu" && (
        <div className="mt-6 flex flex-col gap-5">
          <p className="text-[15px] leading-relaxed text-[#34566b]">
            O seu WhatsApp saiu do ar. Pode ter sido a internet do celular ou o aparelho ter sido desconectado nas configurações do WhatsApp.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => reconectar(false)} disabled={pendente} className={cn(BOTAO, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
              {pendente ? <CircleNotch className="size-5 animate-spin" aria-hidden /> : <ArrowsClockwise className="size-5" aria-hidden />}
              Reconectar
            </button>
            <button type="button" onClick={() => reconectar(true)} disabled={pendente} className={cn(BOTAO, "bg-[#e7f0f5] text-[#0a2d40] hover:bg-[#d5e2ea]")}>
              <QrCode className="size-5" aria-hidden />
              Ler o código de novo
            </button>
          </div>
        </div>
      )}

      {e.erro && e.estado !== "sem" && <p className="mt-4 text-[13px] text-[#a1431a]">{e.erro}</p>}
    </Cartao>
  );
}
