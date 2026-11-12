import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarNumerosDaEquipe, type NumeroDaEquipe } from "@/lib/channels/numeros";
import { inicioDoPeriodo } from "@/lib/opa/dados";
import { contagemDeWhatsApp, precisaDeWhatsApp } from "@/lib/opa/whatsapp-da-equipe";
import { tokenDeEntrada, tokenDoRadar } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  Bell,
  Buildings,
  ChatCircle,
  CheckCircle,
  Clock,
  Gear,
  Globe,
  Info,
  Kanban,
  LinkSimple,
  Megaphone,
  Phone,
  PlugsConnected,
  Plus,
  QrCode,
  Signpost,
  Target,
  Users,
  WhatsappLogo,
  WifiHigh,
  WifiSlash,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { Avatar, Cartao, CartaoNumero, Chip, IconeRedondo, TituloBloco, iniciaisDe, type Icone } from "../_opa/ui";
import { ChaveDoRadar, CopiarPorta } from "./_copiar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conexões" };

const LIMITE_CONEXOES = 30;

type Sessao = NumeroDaEquipe;

/** (12) 9••••-1170: o número aparece só pelo DDD e pelo final. */
function mascarar(tel: string | null): string {
  const d = (tel ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return "sem número";
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)}••••-${d.slice(-4)}`;
}

export default async function ConexoesPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (org.role !== "manager" && org.role !== "admin") redirect("/app/hoje");

  const supabase = await createClient();
  const admin = createAdminClient();
  const desde = inicioDoPeriodo(7);

  const [sessoes, { data: convRaw }, { data: orgRaw }, { data: leadsRaw }, { data: papeisRaw }] = await Promise.all([
    listarNumerosDaEquipe(supabase, org.orgId),
    supabase
      .from("conversations")
      .select("channel_session_id")
      .eq("organization_id", org.orgId)
      .in("status", ["open", "pending", "claimed"]),
    admin.from("organizations").select("slug").eq("id", org.orgId).maybeSingle(),
    supabase.from("crm_leads").select("source, created_at").eq("organization_id", org.orgId).gte("created_at", desde),
    admin.from("user_organizations").select("user_id, role").eq("organization_id", org.orgId).is("revoked_at", null),
  ]);

  const abertasPorSessao = new Map<string, number>();
  for (const c of (convRaw ?? []) as Array<{ channel_session_id: string }>) {
    abertasPorSessao.set(c.channel_session_id, (abertasPorSessao.get(c.channel_session_id) ?? 0) + 1);
  }
  const lembretes = sessoes.find((s) => s.waha_session_name === "opa-lembretes");
  const corretores = sessoes.filter((s) => s !== lembretes);
  // Gestor e administrador não precisam de número: só contam se conectaram (12/11/2026).
  const papelDoDono = new Map(((papeisRaw ?? []) as Array<{ user_id: string; role: string }>).map((p) => [p.user_id, p.role]));
  const papelDe = (s: NumeroDaEquipe) => (s.owner_user_id ? (papelDoDono.get(s.owner_user_id) ?? null) : null);
  const { conectados, total: precisam } = contagemDeWhatsApp(corretores, papelDe, (s) => s.status === "WORKING");
  const conversasAbertas = [...abertasPorSessao.values()].reduce((a, b) => a + b, 0);

  const o = orgRaw as { slug: string } | null;
  const token = (await tokenDeEntrada(admin, org.orgId)) ?? "";
  const chaveRadar = (await tokenDoRadar(admin, org.orgId)) ?? "";
  const porta = `/api/v1/webhooks/opa-entrada/${o?.slug ?? "<empresa>"}`;
  const portaRadar = `/api/v1/webhooks/opa-radar/${o?.slug ?? "<empresa>"}`;

  const leads7 = (leadsRaw ?? []) as Array<{ source: string | null }>;
  const contar = (fonte: string) => leads7.filter((l) => l.source === fonte).length;
  const plural = (n: number) => `${n} ${n === 1 ? "lead" : "leads"} em 7 dias`;

  const entradas: Array<{ icone: Icone; nome: string; descricao: string; ligado: boolean; estado: string; volume: string; site?: boolean; radar?: boolean }> = [
    {
      icone: Globe,
      nome: "Site opailhabela.com.br",
      descricao: "Formulários e link da bio dos corretores, com UTM",
      ligado: Boolean(token),
      estado: token ? "Porta pronta" : "A ligar",
      volume: plural(contar("site") + contar("linkbio")),
      site: true,
    },
    {
      icone: Megaphone,
      nome: "Formulário do Meta",
      descricao: "Hoje entra pelo n8n. Direto no CRM quando o app da Meta tiver leads_retrieval",
      ligado: false,
      estado: "Pelo n8n, direto a ligar",
      volume: plural(contar("meta")),
    },
    {
      icone: WhatsappLogo,
      nome: "WhatsApp dos corretores",
      descricao: "Conversa nova chega para o dono classificar: lead ou particular",
      ligado: conectados > 0,
      estado: `${conectados} de ${precisam} números conectados`,
      volume: plural(contar("whatsapp")),
    },
    {
      icone: Buildings,
      nome: "Painel OPA",
      descricao: "Link de captação respondido pelo proprietário. O acervo já vem do Painel",
      ligado: false,
      estado: "A ligar",
      volume: "acervo importado do site",
    },
    {
      icone: Target,
      nome: "OPA Radar",
      descricao: "Imóveis que a OPA não tem, 2 por semana para cada corretor captar. O Radar manda sozinho, com a chave, ao marcar a rodada como enviada",
      ligado: Boolean(chaveRadar),
      estado: chaveRadar ? "Ligado pela chave" : "A ligar",
      volume: "entra em Captações do Radar",
      radar: true,
    },
  ];

  return (
    <>
      <CabecalhoOpa secao="Configuração" titulo="Conexões" subtitulo="Números de WhatsApp e entradas de lead" icone={ChatCircle} equipe={false} />
      <CorpoOpa>
        <p className="flex items-center gap-2 text-[14px] text-[#5b7284]">
          <Info className="size-4 shrink-0 text-[#2a7ca8]" aria-hidden />
          Cada corretor conecta o próprio WhatsApp e só vê as conversas dele. O lead do site cai no WhatsApp do corretor da vez.
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
          {lembretes && (
            <Cartao escuro bloco className="flex flex-col gap-6 lg:col-span-5">
              <TituloBloco icone={Bell} claro titulo={lembretes.display_name ?? "OPA Lembretes"} sub="Avisa a equipe e manda as oportunidades do Radar" />
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[13px] text-white/60">Número da OPA</p>
                  <p className="text-[30px] font-light tracking-[-0.03em]">{mascarar(lembretes.phone_number)}</p>
                </div>
                {lembretes.status === "WORKING" ? (
                  <Chip icone={WifiHigh} tom="ok">
                    Conectado
                  </Chip>
                ) : (
                  <Chip icone={WifiSlash} tom="alerta">
                    Falta ler o QR
                  </Chip>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Chip icone={Users} tom="acao">
                  Fala só com a equipe
                </Chip>
                <Link
                  href="/app/connections"
                  className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
                >
                  <QrCode className="size-4" /> Gerenciar
                </Link>
              </div>
            </Cartao>
          )}
          <div className={cn("grid gap-5 sm:grid-cols-3", lembretes ? "lg:col-span-7" : "lg:col-span-12")}>
            <CartaoNumero icone={PlugsConnected} rotulo="Conexões em uso" valor={sessoes.length} contexto={`de ${LIMITE_CONEXOES} do plano`} />
            <CartaoNumero
              icone={WhatsappLogo}
              rotulo="Corretores conectados"
              valor={`${conectados}/${precisam}`}
              alerta={conectados < precisam}
              contexto={conectados < precisam ? "tem número sem QR" : "todos no ar"}
            />
            <CartaoNumero icone={ChatCircle} rotulo="Conversas abertas" valor={conversasAbertas} contexto="em todos os números" />
          </div>
        </div>

        <Cartao bloco>
          <TituloBloco icone={WhatsappLogo} titulo="WhatsApp dos corretores" sub="Um número por corretor, pelo WAHA" />
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {corretores.map((s) => {
              const nome = s.display_name ?? "Corretor";
              const ok = s.status === "WORKING";
              // Número da gestão desconectado: opcional, sem alarme.
              const opcional = !precisaDeWhatsApp(papelDe(s), ok);
              return (
                <li key={s.id} className="flex flex-col gap-4 rounded-[24px] bg-[#f2f6f9] p-5">
                  <div className="flex items-center gap-3">
                    <Avatar texto={iniciaisDe(nome)} tom={ok ? "claro" : "escuro"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{nome}</p>
                      <p className="flex items-center gap-1.5 text-[13px] text-[#5b7284]">
                        <Phone className="size-3.5" /> {mascarar(s.phone_number)}
                      </p>
                    </div>
                    <span title={ok ? "Conectado" : "Desconectado"} className={cn("size-2.5 shrink-0 rounded-full", ok ? "bg-[#2ba160]" : opcional ? "bg-[#b9cfdb]" : "bg-[#e07b2e]")} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[34px] font-light leading-none tracking-[-0.04em] text-[#0a2d40]">{abertasPorSessao.get(s.id) ?? 0}</p>
                      <p className="mt-1 text-[12px] text-[#5b7284]">conversas abertas</p>
                    </div>
                    <Link
                      href="/app/connections"
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold",
                        ok || opcional ? "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]" : "bg-[#0a2d40] text-white hover:bg-[#12455f]",
                      )}
                    >
                      {ok ? <Gear className="size-4" /> : <QrCode className="size-4" />}
                      {ok ? "Gerenciar" : "Ler QR de novo"}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip icone={ok ? WifiHigh : WifiSlash} tom={ok ? "ok" : opcional ? "neutro" : "alerta"}>
                      {ok ? "Conectado" : opcional ? "Opcional para a gestão" : "Falta ler o QR"}
                    </Chip>
                    <Chip icone={Kanban} tom="neutro">
                      Compradores e Captação
                    </Chip>
                  </div>
                </li>
              );
            })}
            {org.role === "admin" && (
              <li>
                <Link
                  href="/app/connections"
                  className="flex h-full min-h-[190px] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-[#d5e2ea] text-[14px] font-semibold text-[#2a7ca8] hover:bg-[#f2f6f9]"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-[#e7f0f5]">
                    <Plus className="size-5" aria-hidden />
                  </span>
                  Nova conexão
                </Link>
              </li>
            )}
          </ul>
        </Cartao>

        <Cartao bloco>
          <TituloBloco icone={Signpost} titulo="Por onde os leads entram" sub="Volume dos últimos 7 dias" />
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entradas.map((e) => (
              <li key={e.nome} className="flex flex-col gap-3 rounded-[24px] bg-[#f2f6f9] p-5">
                <div className="flex items-center gap-3">
                  <IconeRedondo icone={e.icone} tom={e.ligado ? "acao" : "claro"} tamanho="lg" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#0a2d40]">{e.nome}</p>
                    <p className="text-[13px] text-[#5b7284]">{e.volume}</p>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-[#34566b]">{e.descricao}</p>
                <div>
                  <Chip icone={e.ligado ? CheckCircle : Clock} tom={e.ligado ? "ok" : "aviso"}>
                    {e.estado}
                  </Chip>
                </div>
                {e.site && (
                  <div className="rounded-[18px] bg-[#e7f0f5] p-3.5">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#12455f]">
                      <LinkSimple className="size-3.5" /> Porta de entrada (POST com token)
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] text-[#34566b]">{porta}</p>
                    <CopiarPorta porta={porta} finalToken={token ? token.slice(-4) : null} />
                  </div>
                )}
                {e.radar && (org.role === "admin" || org.role === "manager" || user.is_platform_admin) && (
                  <div className="rounded-[18px] bg-[#e7f0f5] p-3.5">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#12455f]">
                      <LinkSimple className="size-3.5" /> Endereço do Radar (POST com a chave)
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] text-[#34566b]">{portaRadar}</p>
                    <ChaveDoRadar porta={portaRadar} finalChave={chaveRadar ? chaveRadar.slice(-4) : null} podeGerar={org.role === "admin" || Boolean(user.is_platform_admin)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      </CorpoOpa>
    </>
  );
}
