"use client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Robot } from "@/lib/ui/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { corDoAvatar, metaDaConversa } from "@/lib/inbox/temperatura";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

interface Props {
  conversation: ConversationWithContact;
  isSelected: boolean;
  onSelect: (id: string) => void;
  /** Posição 1-based na fila (G5-03). Presente só na visão Fila. */
  queuePosition?: number;
}

const STATUS_DOT: Record<string, string> = {
  open: "bg-muted-foreground/60",
  claimed: "bg-blue-500",
  ai_handling: "bg-purple-500",
  closed: "bg-muted-foreground/30",
  archived: "bg-muted-foreground/20",
};

function initials(name: string | null | undefined, fallback: string): string {
  const v = (name ?? "").trim();
  if (!v) return fallback.slice(0, 2).toUpperCase();
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return format(d, "HH:mm");
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return formatDistanceToNowStrict(d, { addSuffix: false, locale: ptBR });
  return format(d, "dd/MM");
}

/** "Aguardando há 5 min" — desde a última mensagem do cliente (fallback: criação). */
function waitingLabel(conversation: ConversationWithContact): string {
  const since = conversation.last_inbound_at ?? conversation.created_at;
  if (!since) return "Aguardando";
  return `Aguardando ${formatDistanceToNowStrict(new Date(since), { addSuffix: true, locale: ptBR })}`;
}

export function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
  queuePosition,
}: Props) {
  const c = conversation.contacts ?? null;
  const displayName =
    c?.display_name?.trim() ||
    c?.name?.trim() ||
    c?.phone_number ||
    "Sem nome";
  const phoneFallback = c?.phone_number ?? "??";
  const tags = c?.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const overflow = tags.length - visibleTags.length;
  const preview = conversation.last_message_preview?.trim() || "Sem mensagens";
  const truncated = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
  const time = relativeTime(conversation.last_message_at);
  const unread = conversation.unread_count_for_assignee ?? 0;
  const dot = STATUS_DOT[conversation.status] ?? STATUS_DOT.open;
  const isAi = conversation.status === "ai_handling";
  // Temperatura calculada (lib/inbox/temperatura.ts) — a mesma que o cabeçalho
  // da conversa e a ficha do lead mostram. A cor nunca vai sozinha: o rótulo
  // viaja no aria-label da bolinha.
  const temp = metaDaConversa(conversation);

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "group flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40",
        "md:rounded-none rounded-2xl md:border-b border-b-0 md:px-3 px-2.5",
        "max-md:border-transparent max-md:active:bg-[var(--m-hover)]",
        isSelected && "bg-accent/60 max-md:bg-[var(--m-hover)]",
      )}
      aria-current={isSelected ? "true" : undefined}
    >
      <div className="relative shrink-0">
        <Avatar
          className="h-10 w-10 max-md:h-[46px] max-md:w-[46px]"
          style={{ backgroundColor: corDoAvatar(c?.id ?? displayName) }}
        >
          {/* Só monta a <img> quando existe arquivo: sem isso o browser pediria
              a rota para TODO contato da lista e levaria 404 em cada um sem
              foto — que é a maioria. O AvatarFallback do Radix já cobre o caso
              de a imagem não carregar, então as iniciais nunca somem. */}
          {c?.avatar_storage_path && !c?.is_anonymized ? (
            <AvatarImage
              src={`/api/v1/contacts/${c.id}/avatar`}
              alt=""
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="bg-transparent text-xs text-white max-md:text-[15px] max-md:font-semibold">
            {initials(displayName, phoneFallback)}
          </AvatarFallback>
        </Avatar>
        {/* Desktop: estado do atendimento (aberta/IA/fechada). */}
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background max-md:hidden",
            dot,
          )}
          aria-hidden
        />
        {/* Celular: TEMPERATURA, embaixo. É a pergunta que se faz de relance na
            rua ("quem está esperando?"), não o estado interno do atendimento. */}
        <span
          className="absolute -bottom-px -right-px hidden h-2.5 w-2.5 rounded-full border-[2.5px] border-[var(--m-bg)] max-md:block"
          style={{ backgroundColor: temp.color }}
          role="img"
          aria-label={temp.descricao}
        />
      </div>

      <div className="min-w-0 flex-1">
        {queuePosition !== undefined && (
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-medium tabular-nums text-primary max-md:bg-transparent max-md:px-0 max-md:text-[11px] max-md:font-bold max-md:text-[var(--m-quente)]"
              aria-label={`Posição ${queuePosition} na fila`}
            >
              {queuePosition}º
            </span>
            <span className="text-[10px] text-muted-foreground max-md:text-[11px] max-md:text-[var(--m-text-3)]">
              {waitingLabel(conversation)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium max-md:text-[14.5px] max-md:font-semibold max-md:text-[var(--m-text-1)]",
              c?.is_anonymized && "italic text-muted-foreground",
            )}
          >
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground max-md:text-[11px] max-md:normal-case max-md:tabular-nums max-md:text-[var(--m-text-3)]">
            {time}
          </span>
        </div>

        {/* No celular a prévia divide a linha com o contador de não lidos —
            é o par "o que ele disse / quantas faltam" que o polegar procura. */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground max-md:text-[12.5px] max-md:text-[var(--m-text-2)]">
            {isAi ? <Robot size={10} weight="duotone" className="mr-1 inline" aria-hidden /> : null}
            {truncated}
          </p>
          {unread > 0 && (
            <span
              className="hidden h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-[var(--m-violet)] px-1.5 text-[10.5px] font-bold text-white max-md:flex"
              aria-label={`${unread} não lidas`}
            >
              {unread}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1 max-md:mt-[7px] max-md:gap-1.5">
          {visibleTags.map((t) => (
            <Badge
              key={t}
              variant="secondary"
              className="h-4 px-1.5 text-[10px] max-md:h-auto max-md:rounded-md max-md:border max-md:border-[var(--m-border-soft)] max-md:bg-[var(--m-elevated)] max-md:px-2 max-md:py-[2.5px] max-md:font-semibold max-md:text-[var(--m-text-2)]"
            >
              {t}
            </Badge>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] text-muted-foreground max-md:text-[10.5px] max-md:text-[var(--m-text-3)]">
              +{overflow}
            </span>
          )}
          {c?.is_blocked && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
              Bloqueado
            </Badge>
          )}
          {c?.is_anonymized && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              Anonimizado
            </Badge>
          )}
          {unread > 0 && (
            <Badge className="ml-auto h-4 min-w-4 px-1.5 text-[10px] max-md:hidden">{unread}</Badge>
          )}
        </div>
      </div>
    </button>
  );
}
