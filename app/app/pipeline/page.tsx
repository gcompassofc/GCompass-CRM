import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { carregarEquipe, carregarImoveis, carregarLeads, filtrarCorretor, perguntarLeadOuPessoal, primeiroNome, ROTULO_ORIGEM, type LeadOpa } from "@/lib/opa/dados";
import { escopoDoFunil } from "@/lib/opa/envio-etapa";
import { afinidade, precoCurto } from "@/lib/opa/imoveis";
import { diaSP, inicioDoDia } from "@/lib/opa/periodo";
import { createClient } from "@/lib/supabase/server";
import { ArrowsClockwise, Bell, Buildings, CheckCircle, ListNumbers, UsersThree, XCircle, Kanban } from "@/lib/ui/icons";

import { AtualizaSozinho } from "../_opa/atualiza-sozinho";
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
  // Corretor vê só os leads dele (decisão de 02/11/2026), sem depender só da
  // visibilidade configurada no banco; o gestor vê a equipe, com filtro opcional.
  const dono = escopoDoFunil({ role: org.role, plataforma: user.is_platform_admin, userId: user.id, corretor });
  const soDele = dono === user.id && org.role === "agent";

  const { data: funisRaw } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, position")
    .eq("organization_id", org.orgId)
    .eq("is_archived", false)
    .order("position");
  const funis = (funisRaw ?? []) as Array<{ id: string; name: string; slug: string }>;
  const funil = funis.find((f) => f.slug === p) ?? funis[0];
  if (!funil) redirect("/app/hoje");

  // E8: o mês começa à meia-noite de São Paulo (o servidor roda em UTC).
  const inicioMes = new Date(inicioDoDia(`${diaSP(new Date().getTime()).slice(0, 7)}-01`));

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
    // Contagens pelo banco: buscar as linhas parava em 1.000 e errava o número.
    Promise.all(
      funis.map(async (f) => {
        let q = supabase
          .from("crm_leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.orgId)
          .eq("status", "open")
          .eq("pipeline_id", f.id);
        if (soDele) q = q.eq("owner_user_id", user.id);
        const { count } = await q;
        return { pipeline_id: f.id, n: count ?? 0 };
      }),
    ).then((data) => ({ data })),
    Promise.all(
      (["won", "lost"] as const).map(async (status) => {
        let q = supabase
          .from("crm_leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.orgId)
          .eq("pipeline_id", funil.id)
          .eq("status", status)
          .gte("closed_at", inicioMes.toISOString());
        if (soDele) q = q.eq("owner_user_id", user.id);
        const { count } = await q;
        return { status, n: count ?? 0 };
      }),
    ).then((data) => ({ data })),
  ]);

  const leads = filtrarCorretor(leadsRaw, dono).sort(ordem);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const acervo = imoveis.filter((i) => i.status !== "vendido");
  const porFunil = new Map<string, number>();
  for (const c of contagens) porFunil.set(c.pipeline_id, c.n);
  const ganhos = fechados.find((f) => f.status === "won")?.n ?? 0;
  const perdidos = fechados.find((f) => f.status === "lost")?.n ?? 0;

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

  // Até 25 cartões por etapa (os primeiros na ordem do funil); o número da etapa
  // e o valor somam todos. A afinidade só é calculada para o que aparece.
  const LIMITE_COLUNA = 25;
  const colunas: ColunaQuadro[] = etapas.map((e) => {
    const todosDaEtapa = leads.filter((l) => l.etapa.id === e.id);
    const daqui = todosDaEtapa.slice(0, LIMITE_COLUNA);
    return {
      id: e.id,
      nome: e.name,
      slug: e.slug,
      cor: e.color,
      evento: e.evento_meta,
      lembrete: lembretePorEtapa.get(e.name) ?? null,
      trava: (e.campos_obrigatorios ?? []).length > 0,
      total: todosDaEtapa.reduce((s, l) => s + (l.valorCents ?? 0), 0),
      ocultos: todosDaEtapa.length - daqui.length,
      cartoes: daqui.map((l): CartaoQuadro => {
        const im = porCodigo.get(l.imovelCodigo ?? "");
        const parecidos = acervo.filter(
          (i) => !l.imoveisInteresse.includes(i.codigo) && afinidade(i, { ...l.campos, imovelEntrada: im ?? null }, config.cruzamento.pesos).pontos >= config.cruzamento.minimo,
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
          perguntar: perguntarLeadOuPessoal(l),
          valorCents: l.valorCents ?? 0,
          dono: equipe.get(l.donoId ?? "")?.nome.split(" ")[0] ?? null,
        };
      }),
    };
  });

  const link = (slug: string) => `/app/pipeline?p=${slug}${corretor ? `&corretor=${corretor}` : ""}`;
  const iconeDoFunil = (slug: string) => (slug === "compradores" ? UsersThree : slug === "captacao" ? Buildings : ArrowsClockwise);

  return (
    <>
      <CabecalhoOpa icone={Kanban} titulo="Funis" subtitulo="Arraste o card para mudar de etapa. No celular, toque em Mover." />
      <CorpoOpa largura="max-w-none">
        <AtualizaSozinho />
        <div data-tour="funil-abas" className="flex flex-wrap items-center justify-between gap-3">
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

        {/* "Mandar para todos" abre um por um no WhatsApp de quem envia; leitura não envia. */}
        {/* O quadro guarda as colunas em estado: entrou ou saiu lead, remonta com a lista nova. Mover um card não muda a chave. */}
        <QuadroOpa key={colunas.flatMap((c) => c.cartoes.map((x) => x.id)).sort().join()} colunas={colunas} envio={org.role === "viewer" ? null : { corretor: primeiroNome(user.full_name), filtro: dono }} />

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
