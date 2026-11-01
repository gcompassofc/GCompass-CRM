import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarImoveis, carregarLeads, primeiroNome } from "@/lib/opa/dados";
import { PaperPlaneTilt } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { KitCliente, type ImovelKit, type LeadKit } from "./_kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kit de mensagens" };

/**
 * Kit de mensagens: o Kit de Atendimento OPA dentro do CRM (protótipo do
 * Kallyl, 29/10/2026). Escolher o lead ou o imóvel preenche as mensagens com o
 * nome do corretor logado, o nome da pessoa, o imóvel, o bairro, o link e os
 * valores do cadastro. Os leads são os que o papel pode ver (RLS).
 */
export default async function KitPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; imovel?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { lead, imovel } = await searchParams;

  const [doFunil, imoveis, avulso] = await Promise.all([
    carregarLeads(org.orgId),
    carregarImoveis(org.orgId),
    // F11: "Abrir no kit" de um lead de Captação ou Relacionamento. A lista é do
    // funil Compradores; o lead pedido entra pelo id (a RLS decide se ele pode ver).
    lead ? carregarLeads(org.orgId, { leadId: lead }) : Promise.resolve([]),
  ]);
  const leads = doFunil.some((l) => l.id === lead) ? doFunil : [...avulso, ...doFunil];

  const listaLeads: LeadKit[] = leads
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      imovelCodigo: l.imovelCodigo,
      offMarket: l.offMarket !== null,
      valorCents: l.valorCents,
      esperandoMin: l.conversa?.esperandoMin ?? null,
    }))
    .sort((a, b) => (b.esperandoMin ?? -1) - (a.esperandoMin ?? -1) || a.nome.localeCompare(b.nome));

  const listaImoveis: ImovelKit[] = imoveis
    .filter((i) => i.status !== "vendido")
    .map((i) => ({
      codigo: i.codigo,
      titulo: i.titulo,
      tipo: i.tipo,
      bairro: i.bairro,
      fotos: i.fotos,
      precoVendaCents: i.preco_venda_cents,
      precoLocacaoCents: i.preco_locacao_cents,
      condominioCents: i.condominio_cents,
      iptuCents: i.iptu_cents,
      urlSite: i.url_site,
      offMarket: i.off_market,
    }));

  return (
    <>
      <CabecalhoOpa
        secao="Seu espaço"
        titulo="Kit de mensagens"
        subtitulo="Mensagens prontas para cada momento, já com o nome do cliente e o imóvel"
        icone={PaperPlaneTilt}
        equipe={false}
        ferramentas={false}
      />
      <CorpoOpa>
        <KitCliente
          corretor={primeiroNome(user.full_name) || ""}
          leads={listaLeads}
          imoveis={listaImoveis}
          leadInicial={lead ?? null}
          imovelInicial={imovel ?? null}
        />
      </CorpoOpa>
    </>
  );
}
