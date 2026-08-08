"use client";
import { Button } from "@/components/ui/button";
import { Sparkle } from "@/lib/ui/icons";
import { useDraftReply } from "@/hooks/inbox/useDraftReply";

interface Props {
  conversationId: string;
  onDraft: (text: string) => void;
  disabled?: boolean;
}

/** Onda 5.1: botão "Sugerir resposta" — gera rascunho via agente publicado, sem enviar. */
export function DraftReplyButton({ conversationId, onDraft, disabled }: Props) {
  const mutation = useDraftReply();

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-9 w-9 shrink-0 max-md:h-11 max-md:w-11"
      aria-label="Sugerir resposta"
      aria-busy={mutation.isPending}
      disabled={disabled || mutation.isPending}
      onClick={() => {
        mutation.mutate(conversationId, {
          onSuccess: (res) => onDraft(res.data.draft),
        });
      }}
    >
      <Sparkle
        className="size-[18px] max-md:size-6"
        weight={mutation.isPending ? "duotone" : "regular"}
        aria-hidden
      />
    </Button>
  );
}
