import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { precoCheio } from "@/lib/opa/imoveis";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRight,
  Buildings,
  CheckCircle,
  Clock,
  Code,
  Globe,
  Infinito,
  Info,
  Key,
  Lock,
  Megaphone,
  Plug,
  Robot,
  Target,
  WebhooksLogo,
  XCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { Cartao, Chip, IconeRedondo, TituloBloco, Vazio } from "../_opa/ui";
import { FormCruzamento } from "./_cruzamento";
import { UrlMcp } from "./_mcp";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrações e API" };

const STATUS_EVENTO: Record<string, { texto: string; tom: "neutro" | "claro" | "ok" | "alerta"; icone: typeof Clock }> = {
  na_fila: { texto: "na fila", tom: "neutro", icone: Clock },
  enviado: { texto: "enviado", tom: "claro", icone: ArrowRight },
  aceito: { texto: "aceito", tom: "ok", icone: CheckCircle },
  recusado: { texto: "recusado", tom: "alerta", icone: XCircle },
};

function hora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

function data(iso: string | null): string {
  if (!iso) return "sem validade";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function IntegracoesPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (org.role !== "manager" && org.role !== "admin") redirect("/app/hoje");

  const supabase = await createClient();
  const admin = createAdminClient();

  const [config, { data: funil }, { data: eventosRaw }, { data: tokensRaw }, { data: fontesRaw }, { data: orgRaw }] = await Promise.all([
    carregarConfig(supabase, org.orgId),
    supabase.from("crm_pipelines").select("id").eq("organization_id", org.orgId).eq("slug", "compradores").maybeSingle(),
    supabase
      .from("eventos_meta")
      .select("id, evento, valor_cents, status, created_at, crm_leads(contacts(name))")
      .eq("organization_id", org.orgId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("api_tokens")
      .select("id, name, prefix, scopes, expires_at, last_used_at")
      .eq("organization_id", org.orgId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    admin.from("webhook_sources").select("id, name, is_active, last_received_at").eq("organization_id", org.orgId),
    admin.from("organizations").select("slug").eq("id", org.orgId).maybeSingle(),
  ]);

  // Etapa x evento: o que está gravado na etapa (crm_stages.evento_meta) manda;
  // sem nada gravado, vale o padrão da configuração.
  const { data: etapasRaw } = funil
    ? await supabase.from("crm_stages").select("slug, name, position, evento_meta").eq("pipeline_id", (funil as { id: string }).id).order("position")
    : { data: [] };
  const etapas = (etapasRaw ?? []) as Array<{ slug: string; name: string; evento_meta: string | null }>;
  const padraoPorEtapa = new Map(config.meta_eventos.map((m) => [m.etapa, m.evento]));
  const linhasMeta = etapas
    .map((e) => ({ etapa: e.slug === "vendido" ? "Ganho (com VGV)" : e.name, evento: e.evento_meta || padraoPorEtapa.get(e.slug) }))
    .filter((l): l is { etapa: string; evento: string } => Boolean(l.evento));
  const ligadoNoBanco = etapas.some((e) => e.evento_meta);

  const eventos = (eventosRaw ?? []) as unknown as Array<{
    id: string;
    evento: string;
    valor_cents: number | null;
    status: string;
    created_at: string;
    crm_leads: { contacts: { name: string | null } | null } | null;
  }>;
  const tokens = (tokensRaw ?? []) as Array<{ id: string; name: string; prefix: string | null; scopes: string[] | null; expires_at: string | null }>;
  const fontes = (fontesRaw ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const slug = (orgRaw as { slug: string } | null)?.slug ?? "<empresa>";
  const editavel = org.role === "manager" || org.role === "admin";

  const sistemas = [
    { I: Globe, nome: "Site opailhabela.com.br", texto: "Formulários, link da bio e UTM entram direto como lead, com o imóvel da página", estado: "porta pronta", ok: true },
    { I: Buildings, nome: "Painel OPA", texto: "A carteira vem dele; o link de captação respondido vira negócio em Captação", estado: "acervo importado", ok: true },
    { I: Target, nome: "OPA Radar", texto: "Imóveis do mercado que a OPA não tem, cruzados com quem já procura", estado: "a ligar", ok: false },
  ];

  const passos = [
    ["Lead entra", "com o imóvel que viu"],
    ["Perfil", "região, faixa, suítes"],
    ["Acervo", "afinidade acima do mínimo"],
    ["Radar", "o que a OPA não tem"],
    ["Ficha", "até 3 opções"],
    ["Corretor", "envia ou pede captação"],
  ];

  return (
    <>
      <CabecalhoOpa secao="Configuração" titulo="Integrações e API" subtitulo="Meta, sistemas da OPA, API, webhooks e MCP" icone={Plug} equipe={false} />
      <CorpoOpa>
        <div className="grid items-start gap-5 lg:grid-cols-12">
          <Cartao escuro bloco className="flex flex-col gap-5 lg:col-span-7">
            <TituloBloco
              icone={Megaphone}
              claro
              titulo="Meta Ads · API de Conversões"
              sub="Cada etapa vira um evento: o Meta aprende com quem visita e compra"
              acao={
                <Chip icone={ligadoNoBanco ? CheckCircle : Clock} tom={ligadoNoBanco ? "ok" : "aviso"}>
                  {ligadoNoBanco ? "eventos gravando" : "a ligar"}
                </Chip>
              }
            />
            <ul className="flex flex-col gap-2">
              {linhasMeta.map((l) => (
                <li key={l.etapa} className="flex items-center gap-3 rounded-[18px] bg-white/[0.06] px-4 py-3">
                  <span className="flex-1 text-[14px] text-white/85">{l.etapa}</span>
                  <ArrowRight className="size-4 text-white/40" />
                  <Chip icone={Infinito} tom="acao">
                    {l.evento === "Venda realizada" ? "Venda realizada, valor = comissão" : l.evento}
                  </Chip>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-[13px] text-white/65">
              <Lock className="mt-0.5 size-4 shrink-0" />
              Uma vez por negócio e evento. Telefone e e-mail vão criptografados, nunca o texto da conversa.
            </p>
          </Cartao>

          <Cartao bloco className="lg:col-span-5">
            <TituloBloco icone={Clock} titulo="Últimos eventos" sub="Com a resposta do Meta quando o envio ligar" />
            {eventos.length === 0 ? (
              <Vazio titulo="Nenhum evento ainda" texto="Eles nascem quando um negócio entra numa etapa com evento." />
            ) : (
              <ul className="mt-4 flex flex-col gap-1.5">
                {eventos.map((e) => {
                  const st = STATUS_EVENTO[e.status] ?? { texto: e.status, tom: "neutro" as const, icone: Clock };
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-[18px] px-2 py-2 hover:bg-[#f2f6f9]">
                      <IconeRedondo icone={Infinito} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#0a2d40]">
                          {e.evento}
                          {e.valor_cents ? <span className="font-normal text-[#5b7284]"> · {precoCheio(e.valor_cents)}</span> : null}
                        </p>
                        <p className="truncate text-[12px] text-[#5b7284]">
                          {e.crm_leads?.contacts?.name ?? "Lead"} · {hora(e.created_at)}
                        </p>
                      </div>
                      <Chip icone={st.icone} tom={st.tom}>
                        {st.texto}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
            {eventos.some((e) => e.status === "na_fila") && (
              <p className="mt-4 flex items-start gap-2 text-[12px] text-[#5b7284]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#2a7ca8]" />A API de Conversões ainda não está ligada: os eventos esperam na fila com o valor certo.
              </p>
            )}
          </Cartao>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {sistemas.map((s) => (
            <Cartao key={s.nome} className="flex flex-col gap-4">
              <IconeRedondo icone={s.I} tom={s.ok ? "acao" : "claro"} tamanho="lg" />
              <div>
                <p className="text-[16px] font-semibold text-[#0a2d40]">{s.nome}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">{s.texto}</p>
              </div>
              <div className="mt-auto">
                <Chip icone={s.ok ? CheckCircle : Clock} tom={s.ok ? "ok" : "aviso"}>
                  {s.estado}
                </Chip>
              </div>
            </Cartao>
          ))}
        </div>

        <Cartao bloco>
          <TituloBloco
            icone={Buildings}
            titulo="Cruzamento de imóveis"
            sub="Todo lead ganha opções parecidas com o interesse dele, sem o corretor pedir"
            acao={
              <Chip icone={CheckCircle} tom="ok">
                ligado
              </Chip>
            }
          />
          <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {passos.map(([t, d], i) => (
              <li key={t} className="flex flex-col gap-2 rounded-[22px] bg-[#f2f6f9] p-4">
                <span className="flex size-7 items-center justify-center rounded-full bg-[#0a2d40] text-[12px] font-semibold text-white">{i + 1}</span>
                <p className="text-[14px] font-semibold text-[#0a2d40]">{t}</p>
                <p className="text-[12px] text-[#5b7284]">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <FormCruzamento pesos={config.cruzamento.pesos} minimo={config.cruzamento.minimo} editavel={editavel} />
          </div>
        </Cartao>

        <div className="grid gap-5 lg:grid-cols-3">
          <Cartao className="flex flex-col gap-4">
            <TituloBloco
              icone={Key}
              titulo="Tokens de API"
              sub="Cada sistema com o próprio token"
              acao={
                <Link href="/app/settings/api-tokens" className="text-[13px] font-semibold text-[#2a7ca8]">
                  Gerenciar
                </Link>
              }
            />
            {tokens.length === 0 ? (
              <Vazio titulo="Nenhum token ainda" />
            ) : (
              <ul className="flex flex-col gap-2">
                {tokens.map((t) => (
                  <li key={t.id} className="rounded-[18px] bg-[#f2f6f9] px-4 py-3">
                    <p className="text-[14px] font-semibold text-[#0a2d40]">{t.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#5b7284]">
                      <span className="font-mono">{t.prefix ? `${t.prefix}••••` : "••••"}</span>
                      <span className={cn(!t.expires_at && "font-semibold text-[#a4410e]")}>vence {data(t.expires_at)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao className="flex flex-col gap-4">
            <TituloBloco
              icone={WebhooksLogo}
              titulo="Webhooks"
              sub="Recebe lead e avisa outros sistemas"
              acao={
                <Link href="/app/webhooks" className="text-[13px] font-semibold text-[#2a7ca8]">
                  Abrir
                </Link>
              }
            />
            <ul className="flex flex-col gap-2">
              <li className="rounded-[18px] bg-[#f2f6f9] px-4 py-3">
                <p className="text-[14px] font-semibold text-[#0a2d40]">Entrada de lead da OPA</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-[#5b7284]">/api/v1/webhooks/opa-entrada/{slug}</p>
                <p className="mt-1 text-[12px] text-[#5b7284]">Quem já tem dono volta para ele, sem roleta.</p>
              </li>
              <li>
                <Link
                  href="/app/webhooks?aba=automacoes"
                  className="flex items-center justify-between gap-2 rounded-[18px] bg-[#0a2d40] px-4 py-3 text-[14px] font-semibold text-white hover:bg-[#12455f]"
                >
                  Criar automação
                  <span className="text-[12px] font-normal text-white/75">lead novo, etapa, etiqueta, mensagem</span>
                </Link>
              </li>
              {fontes.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded-[18px] bg-[#f2f6f9] px-4 py-3">
                  <span className="text-[14px] text-[#0a2d40]">{f.name}</span>
                  <Chip tom={f.is_active ? "ok" : "neutro"}>{f.is_active ? "ativa" : "pausada"}</Chip>
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao className="flex flex-col gap-4">
            <TituloBloco icone={Robot} titulo="Servidor MCP" sub="O Claude opera o CRM com as mesmas regras" />
            <div className="rounded-[18px] bg-[#f2f6f9] px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-[#0a2d40]">
                <Code className="size-4 text-[#2a7ca8]" /> URL do servidor
              </p>
              <UrlMcp url={`${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/mcp`} />
              <p className="mt-2 text-[12px] text-[#5b7284]">
                No Claude, use esta URL e o token gerado abaixo (Bearer). Ação de IA aparece no histórico com o nome do token.
              </p>
            </div>
            <Link
              href="/app/settings/api-tokens"
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0a2d40] text-[14px] font-semibold text-white hover:bg-[#12455f]"
            >
              <Key className="size-4" /> Gerar token
            </Link>
          </Cartao>
        </div>
      </CorpoOpa>
    </>
  );
}
