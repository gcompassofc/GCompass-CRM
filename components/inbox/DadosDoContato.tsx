"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, usePermission } from "@/hooks/auth/AuthProvider";
import { useExcluirConversas } from "@/hooks/inbox/useExcluirConversas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Phone, WhatsappLogo, CaretRight } from "@/lib/ui/icons";
import { corDoAvatar, iniciais } from "@/lib/inbox/temperatura";
import { activityLabel } from "@/lib/leads/activity-vocabulary";
import { leadPrincipal, useResumoDoContato } from "@/hooks/inbox/useResumoDoContato";
import { ConversationTagsEditor } from "./ConversationTagsEditor";
import { MudarNomeNaConversa } from "./MudarNomeNaConversa";
import { MarcarPessoal } from "@/app/app/leads/[id]/_pessoal";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const SITUACAO: Record<string, string> = {
  open: "Em andamento",
  won: "Ganho",
  lost: "Perdido",
};

/** Telefone como o WhatsApp mostra: +55 12 99999-9999. Fora do padrão, devolve como veio. */
export function telefoneLegivel(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, "");
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : bruto;
}

/**
 * "Dados do contato" do Multi-atendimento, no desenho do WhatsApp: foto grande,
 * nome, telefone e os atalhos logo abaixo. É a consulta rápida, sem sair da
 * conversa. Tudo o que muda o lead (etiqueta do lead, ligação, visita, etapa)
 * mora na ficha, e o primeiro botão leva para lá.
 */
export function DadosDoContato({ conversation }: { conversation: ConversationWithContact }) {
  const c = conversation.contacts ?? null;
  const nome = c?.display_name?.trim() || c?.name?.trim() || c?.phone_number || "Sem nome";
  const fone = telefoneLegivel(c?.phone_number);
  const digitos = c?.phone_number?.replace(/\D/g, "") ?? "";
  const resumo = useResumoDoContato(c?.id ?? null);
  const lead = leadPrincipal(resumo.data?.leads);
  const atividades = resumo.data?.activities.slice(0, 5) ?? [];
  const router = useRouter();
  const podeExcluir = usePermission("conversation.delete");
  const { activeOrg } = useAuth();
  const gestor = activeOrg?.role === "manager" || activeOrg?.role === "admin";
  const excluir = useExcluirConversas();
  const donos = conversation.donos ?? null;

  return (
    <div className="flex min-h-full flex-col gap-2 bg-[#f0f2f5] pb-8 dark:bg-[#111b21]">
      <section className="flex flex-col items-center gap-1 bg-white px-6 pb-6 pt-8 text-center dark:bg-[#202c33]">
        <Avatar className="h-28 w-28" style={{ backgroundColor: corDoAvatar(c?.id ?? nome) }}>
          {c?.avatar_storage_path && !c?.is_anonymized ? (
            <AvatarImage src={`/api/v1/contacts/${c.id}/avatar`} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-transparent text-3xl font-semibold text-white">
            {iniciais(nome, c?.phone_number ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="mt-3 flex items-center justify-center gap-1">
          <h2 className="min-w-0 break-words text-[22px] font-normal text-[#111b21] dark:text-[#e9edef]">{nome}</h2>
          <MudarNomeNaConversa contato={c} className="text-[#667781] dark:text-[#8696a0]" />
        </div>
        {fone && <p className="text-[15px] text-[#667781] dark:text-[#8696a0]">{fone}</p>}

        <div className="mt-4 flex gap-3">
          {lead && (
            <Atalho href={`/app/leads/${lead.id}`} icone={<FileText className="size-5" />} rotulo="Ficha" />
          )}
          {digitos && (
            <Atalho href={`tel:+${digitos}`} icone={<Phone className="size-5" />} rotulo="Ligar" externo />
          )}
          {digitos && (
            <Atalho
              href={`https://wa.me/${digitos}`}
              icone={<WhatsappLogo className="size-5" />}
              rotulo="WhatsApp"
              externo
            />
          )}
        </div>
      </section>

      {donos && donos.corretores.length > 0 && (
        <section className={`px-6 py-4 ${donos.corretores.length > 1 ? "bg-[#fdf1d6] dark:bg-[#202c33]" : "bg-white dark:bg-[#202c33]"}`}>
          <p className="text-[14px] text-[#667781] dark:text-[#8696a0]">{donos.corretores.length > 1 ? "Este número fala com mais de um corretor" : "Corretor"}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {donos.corretores.map((k) => (
              <li key={k.id} className="text-[15px] text-[#111b21] dark:text-[#e9edef]">
                {k.nome}
                {k.principal && <span className="ml-1.5 rounded-full bg-[#e5f3ea] px-2 py-0.5 text-[11px] font-semibold text-[#1d6b43]">Principal</span>}
                {donos.responsavel?.id === k.id && <span className="ml-1.5 rounded-full bg-[#e7f0f5] px-2 py-0.5 text-[11px] font-semibold text-[#12455f]">Responsável</span>}
                <span className="block text-[12px] text-[#667781] dark:text-[#8696a0]">Primeira conversa em {format(new Date(k.desde), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
              </li>
            ))}
          </ul>
          {donos.corretores.length > 1 && gestor && (
            <Link href="/app/duplicados" className="mt-2 inline-block text-[13px] font-semibold text-[#7d5300] underline">Ver em Duplicados</Link>
          )}
        </section>
      )}

      <section className="bg-white px-6 py-4 dark:bg-[#202c33]">
        <p className="text-[14px] text-[#667781] dark:text-[#8696a0]">Lead</p>
        {resumo.isPending ? (
          <Skeleton className="mt-2 h-10 w-full" />
        ) : resumo.isError ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-[13px] text-error-fg">Não consegui ler o lead.</p>
            <Button size="sm" variant="outline" onClick={() => resumo.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : lead ? (
          <Link
            href={`/app/leads/${lead.id}`}
            className="-mx-2 mt-1 flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#2a3942]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[16px] text-[#111b21] dark:text-[#e9edef]">{lead.title}</span>
              <span className="block text-[13px] text-[#667781] dark:text-[#8696a0]">
                {SITUACAO[lead.status] ?? lead.status} · ver ficha completa
              </span>
            </span>
            <CaretRight className="size-4 shrink-0 text-[#8696a0]" />
          </Link>
        ) : (
          <p className="mt-1 text-[14px] text-[#111b21] dark:text-[#e9edef]">Este contato ainda não virou lead.</p>
        )}
      </section>

      <section className="bg-white px-6 py-4 dark:bg-[#202c33]">
        <ConversationTagsEditor
          conversationId={conversation.id}
          orgId={conversation.organization_id}
          tags={conversation.tags ?? []}
        />
      </section>

      {lead?.status === "open" && lead.tags?.includes("proprio") && (
        <section className="bg-white px-6 py-4 dark:bg-[#202c33]">
          <MarcarPessoal
            leadId={lead.id}
            depois="/app/inbox"
            className="flex w-full items-center gap-3 text-left text-[15px] text-[#ea0038] hover:opacity-80 disabled:opacity-50"
          />
          <p className="mt-1 text-[12px] text-[#667781] dark:text-[#8696a0]">
            Entrou como lead mas é conversa pessoal? A conversa sai do CRM e o lead é encerrado.
          </p>
        </section>
      )}

      {atividades.length > 0 && (
        <section className="bg-white px-6 py-4 dark:bg-[#202c33]">
          <p className="text-[14px] text-[#667781] dark:text-[#8696a0]">Últimos registros</p>
          <ul className="mt-2 flex flex-col gap-2">
            {atividades.map((a) => (
              <li key={a.id} className="text-[14px] text-[#111b21] dark:text-[#e9edef]">
                {activityLabel(a.type)}
                <span className="block text-[12px] text-[#667781] dark:text-[#8696a0]">
                  {format(new Date(a.performed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  {a.reason ? ` · ${a.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {podeExcluir && (
        <section className="bg-white px-6 py-4 dark:bg-[#202c33]">
          <button
            type="button"
            disabled={excluir.isPending}
            className="flex w-full items-center gap-3 text-left text-[15px] text-[#ea0038] hover:opacity-80 disabled:opacity-50"
            onClick={() => {
              if (!confirm("Excluir esta conversa do CRM? Não dá para desfazer. No WhatsApp do corretor ela continua, e se a pessoa escrever de novo a conversa volta.")) return;
              excluir.mutate([conversation.id], { onSuccess: () => router.push("/app/inbox") });
            }}
          >
            {excluir.isPending ? "Excluindo…" : "Excluir conversa do CRM"}
          </button>
          <p className="mt-1 text-[12px] text-[#667781] dark:text-[#8696a0]">Só o administrador. Não apaga do WhatsApp. O lead e o contato ficam.</p>
        </section>
      )}
    </div>
  );
}

function Atalho({
  href,
  icone,
  rotulo,
  externo,
}: {
  href: string;
  icone: React.ReactNode;
  rotulo: string;
  externo?: boolean;
}) {
  const classe =
    "flex w-[84px] flex-col items-center gap-1.5 rounded-xl border border-[#e9edef] px-2 py-3 text-[13px] text-[#008069] hover:bg-[#f5f6f6] dark:border-[#2a3942] dark:text-[#00a884] dark:hover:bg-[#2a3942]";
  if (externo) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={classe}>
        {icone}
        <span className="text-[#111b21] dark:text-[#e9edef]">{rotulo}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={classe}>
      {icone}
      <span className="text-[#111b21] dark:text-[#e9edef]">{rotulo}</span>
    </Link>
  );
}
