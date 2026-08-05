"use client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Checks, Robot, WarningOctagon } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Message } from "@/lib/types/messaging";
import { CitationButton } from "@/components/ai/CitationButton";
import { MediaRenderer } from "@/components/inbox/media/MediaRenderer";
import {
  extractCitations,
  isAiGeneratedMessage,
} from "@/lib/ai/citations/types";

interface Props {
  message: Message;
  debugCitations?: boolean;
}

function AckIndicator({ status }: { status: string }) {
  if (status === "read") {
    return <Checks size={12} weight="bold" className="text-blue-400" aria-label="Lida" />;
  }
  if (status === "delivered") {
    return <Checks size={12} weight="bold" className="text-current/70" aria-label="Entregue" />;
  }
  if (status === "sent") {
    return <Check size={12} weight="bold" className="text-current/70" aria-label="Enviada" />;
  }
  return null;
}

export function MessageBubble({ message, debugCitations }: Props) {
  const isOutbound = message.direction === "outbound";
  let sentAtDate = new Date(message.sent_at);
  if (isNaN(sentAtDate.getTime())) sentAtDate = new Date(); // Fallback para mock/dados inválidos
  const time = format(sentAtDate, "HH:mm", { locale: ptBR });
  const isFailed = message.status === "failed";
  const hasMedia = Boolean(message.media_url || message.media_storage_path);
  // Figurinha sem caption: sem moldura de bolha (padrão WhatsApp).
  const isBareSticker = hasMedia && message.type === "sticker" && !message.body;
  const aiGenerated = isAiGeneratedMessage(message.metadata);
  const citations = extractCitations(message.metadata);
  const showCitationButton =
    isOutbound && aiGenerated && (debugCitations ?? false);
  const senderLabel = (() => {
    if (!isOutbound) return null;
    if (message.sent_via === "ai") return "IA";
    return null;
  })();

  return (
    <div className={cn("flex w-full px-2 sm:px-4 py-1", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[75%] text-sm",
          "max-md:max-w-[80%] max-md:text-[13.5px]",
          isBareSticker
            ? "px-0 py-0"
            : cn(
                "rounded-2xl px-3 py-2 shadow-sm",
                // No celular a bolha é tingida + contornada, não um bloco
                // sólido de accent: sobre fundo quase preto, o violeta chapado
                // no tamanho de um parágrafo vibra e cansa a leitura.
                isOutbound
                  ? "rounded-br-sm bg-primary text-primary-foreground max-md:rounded-br-[4px] max-md:border max-md:border-[var(--m-violet-line)] max-md:bg-[var(--m-bubble-sent)] max-md:text-[var(--m-text-1)] max-md:shadow-none"
                  : "rounded-bl-sm bg-muted text-foreground max-md:rounded-bl-[4px] max-md:border max-md:border-[var(--m-border-soft)] max-md:bg-[var(--m-bubble-recv)] max-md:text-[var(--m-text-1)] max-md:shadow-none",
              ),
          isFailed && "border border-destructive",
        )}
      >
        {senderLabel && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {senderLabel === "IA" ? (
              <Robot size={10} weight="duotone" aria-hidden />
            ) : null}
            {senderLabel}
          </div>
        )}

        {hasMedia && (
          <div className={cn(message.body && "mb-1")}>
            <MediaRenderer message={message} />
          </div>
        )}

        {message.body && (
          <p className="whitespace-pre-wrap break-words leading-snug">{message.body}</p>
        )}

        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            // `primary-foreground/70` é branco translúcido: legível sobre o
            // accent sólido do desktop, quase invisível sobre a bolha tingida
            // do celular. Abaixo de `md` a hora usa o cinza dos tokens.
            isOutbound
              ? "text-primary-foreground/70 max-md:text-[var(--m-text-3)]"
              : "text-muted-foreground max-md:text-[var(--m-text-3)]",
          )}
        >
          <span>{time}</span>
          {showCitationButton && (
            <CitationButton citations={citations} messageId={message.id} />
          )}
          {isOutbound && !isFailed && <AckIndicator status={message.status} />}
          {isFailed && (
            // Provider local: o painel do inbox não tem TooltipProvider ancestral e
            // este Tooltip só monta em mensagem failed — sem o provider, abrir uma
            // conversa com falha de envio derrubava o painel inteiro (error boundary).
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 font-semibold text-destructive">
                    <WarningOctagon size={10} weight="fill" aria-hidden /> Falhou
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {message.error_message ?? message.error_code ?? "Erro desconhecido"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
