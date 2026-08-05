"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, ArrowRight, CaretLeft, Info } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import { useCloseConversation } from "@/hooks/inbox/useCloseConversation";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/ui/useIsMobile";
import { corDoAvatar, iniciais, metaDaConversa } from "@/lib/inbox/temperatura";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

interface Props {
  conversation: ConversationWithContact;
  onBack?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  claimed: "Em atendimento",
  ai_handling: "IA atendendo",
  closed: "Fechada",
  archived: "Arquivada",
};

/**
 * Aparência dos botões de ação NO CELULAR.
 *
 * Constante e não classe repetida: são cinco botões que precisam ser
 * indistinguíveis entre si — quando o estilo vivia colado em cada um, dois
 * ficavam com altura diferente e a fileira parecia desalinhada. No desktop
 * eles seguem sendo `<Button>` normais; tudo aqui é `max-md:`.
 */
const ACAO_MOBILE =
  "max-md:h-auto max-md:shrink-0 max-md:rounded-[9px] max-md:border max-md:border-[var(--m-border-soft)] max-md:bg-[var(--m-elevated)] max-md:px-3.5 max-md:py-[7px] max-md:text-[12px] max-md:font-semibold max-md:text-[var(--m-text-2)] max-md:shadow-none";

/** A ação principal da fila: assumir. É a única violeta. */
const ACAO_MOBILE_PRIMARIA =
  "max-md:border-[var(--m-violet-line)] max-md:bg-[var(--m-violet-dim)] max-md:text-[var(--m-text-1)]";

export function ConversationHeader({ conversation, onBack }: Props) {
  const { user } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [crmPanelOpen, setCrmPanelOpen] = useState(false);

  const c = conversation.contacts ?? null;
  const displayName = c?.display_name?.trim() || c?.name?.trim() || c?.phone_number || "Sem nome";
  const phone = c?.phone_number ?? null;
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;
  const temp = metaDaConversa(conversation);
  const isMobile = useIsMobile();

  return (
    <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-xl max-md:flex max-md:flex-col max-md:border-[var(--m-border-soft)] max-md:bg-[var(--m-bg)] md:flex md:items-center md:justify-between md:gap-2 px-3 py-2.5 md:px-4 md:py-3 max-md:p-0">
      <div className="flex items-center gap-2 min-w-0 max-md:gap-2.5 max-md:border-b max-md:border-[var(--m-border-soft)] max-md:px-3.5 max-md:py-2.5">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 shrink-0 -ml-1 text-muted-foreground hover:text-foreground max-md:h-9 max-md:w-9 max-md:text-[var(--m-text-1)]"
            onClick={onBack}
            aria-label="Voltar para conversas"
          >
            <CaretLeft size={20} weight="bold" />
          </Button>
        )}
        {/* Avatar só no celular: aqui não há lista ao lado mostrando de quem é
            a conversa, então a cor do avatar é a única continuidade visual
            entre a lista e a tela aberta. */}
        <div
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white max-md:flex"
          style={{ backgroundColor: corDoAvatar(c?.id ?? displayName) }}
          aria-hidden
        >
          {iniciais(displayName, phone ?? "?")}
        </div>
        <div className="min-w-0 max-md:flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold max-md:text-[15px] max-md:text-[var(--m-text-1)]">
              {displayName}
            </h2>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0 max-md:hidden">
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </div>
          {phone && (
            <p className="mt-0.5 hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground max-md:mt-px max-md:flex max-md:text-[11.5px] max-md:text-[var(--m-text-2)]">
              <Phone size={10} weight="regular" aria-hidden /> {phone}
            </p>
          )}
        </div>

        {/* Pílula de temperatura — abre a ficha do lead, como no cabeçalho da
            referência. Cor + rótulo escrito, nunca a cor sozinha. */}
        <button
          type="button"
          onClick={() => setCrmPanelOpen(true)}
          className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--m-border-soft)] bg-[var(--m-elevated)] px-2.5 py-1 text-[10.5px] font-bold max-md:flex"
          style={{ color: temp.color }}
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: temp.color }}
            aria-hidden
          />
          {temp.label}
        </button>
      </div>

      <div className="m-scroll-x flex shrink-0 items-center gap-1 md:gap-1.5 max-md:gap-[7px] max-md:border-b max-md:border-[var(--m-border-soft)] max-md:px-3.5 max-md:py-2.5">
        {isOpen && (
          <Button
            size="sm"
            variant="default"
            className={cn(ACAO_MOBILE, ACAO_MOBILE_PRIMARIA)}
            disabled={claim.isPending}
            onClick={() =>
              claim.mutate({
                conversation_id: conversation.id,
                expected_assignee: conversation.assigned_to_user_id,
              })
            }
          >
            Assumir
          </Button>
        )}
        {isMineAssigned && (
          <Button
            size="sm"
            variant="outline"
            className={ACAO_MOBILE}
            disabled={release.isPending}
            onClick={() => release.mutate({ conversation_id: conversation.id })}
          >
            Liberar
          </Button>
        )}
        {/* Antes escondida abaixo de `sm` — transferir é justamente o que se
            faz do celular quando não dá para atender agora. */}
        {status !== "closed" && status !== "archived" && (
          <Button
            size="sm"
            variant="outline"
            className={cn("hidden sm:inline-flex max-md:inline-flex", ACAO_MOBILE)}
            onClick={() => setReassignOpen(true)}
          >
            Transferir
          </Button>
        )}
        {status !== "closed" && status !== "archived" && (
          <SnoozeButton
            conversationId={conversation.id}
            snoozeUntil={conversation.snooze_until ?? null}
            className={ACAO_MOBILE}
          />
        )}
        {status !== "closed" && status !== "archived" && (
          <Button
            size="sm"
            variant="outline"
            className={cn("px-2 sm:px-3 text-xs", ACAO_MOBILE)}
            disabled={close.isPending}
            title="Fechar conversa"
            onClick={() => {
              if (confirm("Fechar esta conversa?")) {
                close.mutate({ conversation_id: conversation.id });
              }
            }}
          >
            {/* O "X" solto some no celular: numa fileira de rótulos escritos,
                uma letra sozinha não diz que fecha o atendimento. */}
            <span className="hidden sm:inline max-md:inline">Fechar</span>
            <span className="sm:hidden font-bold max-md:hidden">X</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground max-md:h-8 max-md:w-8 max-md:text-[var(--m-text-2)]"
          onClick={() => setCrmPanelOpen(true)}
          title="Detalhes do CRM"
          aria-label="Ver dados do contato"
        >
          <Info size={18} weight="bold" />
        </Button>

        {c?.id && (
          <Button asChild size="sm" variant="ghost" className="hidden md:inline-flex">
            <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-1">
              Contato
              <ArrowRight size={12} weight="regular" aria-hidden />
            </Link>
          </Button>
        )}
      </div>

      <ReassignDialog
        conversationId={conversation.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
      />

      {/* Gaveta lateral no desktop; folha de baixo no celular.
          Vinda da direita, ela cobre a conversa inteira e o polegar precisa
          esticar até o topo para fechar. Vindo de baixo, ela para na altura do
          polegar e a conversa continua visível atrás — é consulta, não troca
          de tela. */}
      <Sheet open={crmPanelOpen} onOpenChange={setCrmPanelOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "w-[320px] sm:max-w-md p-0 overflow-y-auto",
            // `!bg-...` porque o `bg-background` do próprio SheetContent vence
            // pela ordem em que o Tailwind emite as classes. Medido no portal:
            // o painel vinha `rgba(0, 0, 0, 0)` e a conversa aparecia por trás.
            "max-md:h-[80dvh] max-md:w-full max-md:max-w-none max-md:rounded-t-[26px] max-md:border-[var(--m-border)] max-md:!bg-[var(--m-surface)] max-md:p-0",
          )}
        >
          <SheetTitle className="sr-only">Detalhes do CRM</SheetTitle>
          {/* Alça — diz "isto arrasta/fecha" antes de a pessoa tentar. */}
          <div
            className="mx-auto mt-2.5 hidden h-1 w-9 rounded-full bg-[var(--m-border)] max-md:block"
            aria-hidden
          />
          <CRMSidePanel conversation={conversation} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
