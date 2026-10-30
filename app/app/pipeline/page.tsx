import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { carregarEquipe, carregarImoveis, carregarLeads, filtrarCorretor, ROTULO_ORIGEM, type LeadOpa } from "@/lib/opa/dados";
import { afinidade, precoCurto } from "@/lib/opa/imoveis";
import { createClient } from "@/lib/supabase/server";
import { ArrowsClockwise, Bell, Buildings, CheckCircle, ListNumbers, UsersThree, XCircle, Kanban } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { AbasPilula, BotaoPilula, Chip } from "../_opa/ui";
import { QuadroOpa, type CartaoQuadro, type ColunaQuadro } from "./_quadro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipelines" };

/** Quem espera há mais tempo no topo de cada coluna (regra da fila). */
function ordem(a: LeadOpa, b: LeadOpa): number {
  const ea = a.conversa?.esperandoMin;
  const eb = b.conversa?.esperandoMin;
  if (ea != null && eb != null) return eb - ea;
  if (ea != null) return -1;
  if (eb != null) return 1;
  return Date.parse(b.conversa?.ultimaEm ?? b.criadoEm) - Date.parse(a.conversa?.ultimaEm ?? a.criadoEm);
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; corretor?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { p = "compradores", corretor } = await searchParams;
  const supabase = await createClient();

  const { data: funisRaw } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, position")
    .eq("organization_id", org.orgId)
    .eq("is_archived", false)
    .order("position");
  const funis = (funisRaw ?? []) as Array<{ id: string; name: string; slug: string }>;
  const funil = funis.find((f) => f.slug === p) ?? funis[0];
  if (!funil) redirect("/app/hoje");

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [leadsRaw, imoveis, equipe, config, { data: etapasRaw }, { data: contagens }, { data: fechados }] = await Promise.all([
    carregarLeads(org.orgId, { funil: funil.slug }),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    carregarConfig(supabase, org.orgId),
    supabase
      .from("crm_stages")
      .select("id, name, slug, color, position, is_won, is_lost, evento_meta, campos_obrigatorios")
      .eq("organization_id", org.orgId)
      .eq("pipeline_id", funil.id)
      .eq("is_archived", false)
      .order("position"),
    supabase.from("crm_leads").select("pipeline_id").eq("organization_id", org.orgId).eq("status", "open"),
    supabase
      .from("crm_leads")
      .select("status")
      .eq("organization_id", org.orgId)
      .eq("pipeline_id", funil.id)
      .neq("status", "open")
      .gte("closed_at", inicioMes.toISOString()),
  ]);

  const leads = filtrarCorretor(leadsRaw, corretor).sort(ordem);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const acervo = imoveis.filter((i) => i.status !== "vendido");
  const porFunil = new Map<string, number>();
  for (const c of (contagens ?? []) as Array<{ pipeline_id: string }>) porFunil.set(c.pipeline_id, (porFunil.get(c.pipeline_id) ?? 0) + 1);
  const ganhos = ((fechados ?? []) as Array<{ status: string }>).filter((f) => f.status === "won").length;
  const perdidos = ((fechados ?? []) as Array<{ status: string }>).filter((f) => f.status === "lost").length;

  // Ganho e perdido são resultado, não coluna (decisão 3 do protótipo).
  const etapas = ((etapasRaw ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    color: string | null;
    is_won: boolean;
    is_lost: boolean;
    evento_meta: string | null;
    campos_obrigatorios: string[] | null;
  }>).filter((e) => !e.is_won && !e.is_lost);

  const lembretePorEtapa = new Map<string, string>();
  for (const r of config.lembretes) {
    if (!r.ativa || r.trilha !== "cadencia" && r.trilha !== "captacao") continue;
    const atual = lembretePorEtapa.get(r.etapa);
    lembretePorEtapa.set(r.etapa, atual ? atual : r.quando);
  }

  const colunas: ColunaQuadro[] = etapas.map((e) => {
    const daqui = leads.filter((l) => l.etapa.id === e.id);
    return {
      id: e.id,
      nome: e.name,
      cor: e.color,
      evento: e.evento_meta,
      lembrete: lembretePorEtapa.get(e.name) ?? null,
      trava: (e.campos_obrigatorios ?? []).length > 0,
      total: daqui.reduce((s, l) => s + (l.valorCents ?? 0), 0),
      cartoes: daqui.map((l): CartaoQuadro => {
        const im = porCodigo.get(l.imovelCodigo ?? "");
        const parecidos = acervo.filter(
          (i) => !l.imoveisInteresse.includes(i.codigo) && afinidade(i, { ...l.campos, imovelEntrada: im ?? null }).pontos >= config.cruzamento.minimo,
        ).length;
        return {
          id: l.id,
          nome: l.nome,
          imovel: im
            ? { tipo: im.tipo ? im.tipo[0]!.toUpperCase() + im.tipo.slice(1) : "Imóvel", codigo: im.codigo, valor: precoCurto(im.preco_venda_cents), titulo: im.titulo }
            : null,
          proprietario:
            funil.slug === "compradores"
              ? null
              : {
                  tipo: l.camposCorretor.tipo ?? "Imóvel",
                  bairro: l.camposCorretor.bairro ?? "bairro a confirmar",
                  valor: l.valorCents ? precoCurto(l.valorCents) : "",
                },
          anuncio: l.origem.anuncio ?? null,
          origem: ROTULO_ORIGEM[l.origem.canal ?? ""] ?? l.origem.canal ?? "origem",
          pago: l.pago,
          temperatura: l.copiloto.temperatura ?? null,
          offMarket: l.offMarket,
          voltou: l.voltou?.vez ?? null,
          proprio: l.proprio,
          lembretesDesligados: l.lembretesDesligados,
          parecidos,
          esperandoMin: l.conversa?.esperandoMin ?? null,
          dono: equipe.get(l.donoId ?? "")?.nome.split(" ")[0] ?? null,
        };
      }),
    };
  });

  const link = (slug: string) => `/app/pipeline?p=${slug}${corretor ? `&corretor=${corretor}` : ""}`;
  const iconeDoFunil = (slug: string) => (slug === "compradores" ? UsersThree : slug === "captacao" ? Buildings : ArrowsClockwise);

  return (
    <>
      <CabecalhoOpa icone={Kanban} titulo="Pipelines" subtitulo="Arraste o card para mudar de etapa" />
      <CorpoOpa largura="max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AbasPilula
            itens={funis.map((f) => ({
              href: link(f.slug),
              rotulo: f.name,
              icone: iconeDoFunil(f.slug),
              contagem: porFunil.get(f.id) ?? 0,
              ativo: f.id === funil.id,
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] text-[#5b7284]">
              <ListNumbers className="size-4 text-[#2a7ca8]" /> Ordem da fila
            </span>
            <BotaoPilula href="/app/lembretes" icone={Bell}>
              Etapas e regras
            </BotaoPilula>
          </div>
        </div>

        <QuadroOpa colunas={colunas} />

        <div className="flex flex-wrap items-center gap-2 px-1 text-[13px] text-[#5b7284]">
          <span>Ganho e perdido saem do quadro. Neste mês:</span>
          <Chip icone={CheckCircle} tom="ok">
            {ganhos} {ganhos === 1 ? "ganho" : "ganhos"}
          </Chip>
          <Chip icone={XCircle} tom="alerta">
            {perdidos} {perdidos === 1 ? "perdido" : "perdidos"}
          </Chip>
        </div>
      </CorpoOpa>
    </>
  );
}
