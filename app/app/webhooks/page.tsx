import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { WebhooksClient } from "./_components/WebhooksClient";
import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { WebhooksLogo } from "@/lib/ui/icons";

export const dynamic = "force-dynamic";

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");
  const { aba } = await searchParams;
  const abaInicial = aba === "automacoes" ? "rules" : aba === "atividade" ? "activity" : "sources";

  if (process.env.APP_PROFILE?.trim() === "imobiliaria") {
    return (
      <>
        <CabecalhoOpa
          secao="Configuração"
          titulo="Automações"
          subtitulo="Quando algo acontece no CRM, a regra age sozinha: move, etiqueta, atribui, manda mensagem ou avisa outro sistema"
          icone={WebhooksLogo}
          equipe={false}
        />
        <CorpoOpa>
          <WebhooksClient abaInicial={abaInicial} />
        </CorpoOpa>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Receba contatos de fora (landing pages, formulários) e crie automações que agem sozinhas.
        </p>
      </header>
      <WebhooksClient abaInicial={abaInicial} />
    </div>
  );
}
