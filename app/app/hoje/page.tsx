import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, carregarImoveis, carregarLeads, carregarVendas, filtrarCorretor, gerenteVeReceita, primeiroNome, type Venda } from "@/lib/opa/dados";
import { resolverPeriodo } from "@/lib/opa/periodo";
import { Sun } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { ContatosNovos } from "../_opa/contatos-novos";
import { listarContatosNovos } from "../_opa/contatos-novos-actions";
import { FiltroPeriodo } from "../_opa/periodo";
import { VisaoCorretor, VisaoGestor } from "./_visoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início" };

function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; corretor?: string; fila?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const params = await searchParams;
  const { corretor } = params;
  const periodo = resolverPeriodo(params);
  const gestor = org.role === "manager" || org.role === "admin";
  const filtroFila = params.fila === "atrasados" || params.fila === "novos" ? params.fila : "todos";

  const [leadsTodos, imoveis, equipe, vendasTodas, liberado, contatosNovos] = await Promise.all([
    carregarLeads(org.orgId),
    carregarImoveis(org.orgId),
    carregarEquipe(org.orgId),
    gestor ? carregarVendas(org.orgId, new Date(periodo.de).toISOString(), new Date(periodo.ate).toISOString()) : Promise.resolve([] as Venda[]),
    gestor ? gerenteVeReceita(org.orgId) : Promise.resolve(false),
    // Do WhatsApp da própria pessoa (corretor ou gestor que atende): quem escreveu e ainda não foi classificado.
    listarContatosNovos(),
  ]);
  const leads = filtrarCorretor(leadsTodos, corretor);
  const vendas = filtrarCorretor(vendasTodas, corretor);
  const porCodigo = new Map(imoveis.map((i) => [i.codigo, i]));
  const veReceita = org.role === "admin" || (org.role === "manager" && liberado);
  const nome = primeiroNome(user.full_name) || "corretor";
  const fila = leads.filter((l) => l.conversa?.esperandoMin != null);

  return (
    <>
      <CabecalhoOpa
        titulo={`${saudacao()}, ${nome}`}
        secao={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date())}
        subtitulo={
          org.role === "admin"
            ? "Panorama da OPA, acessos e a saúde do sistema"
            : gestor
              ? "Quem precisa de ajuda agora e como cada corretor está"
              : fila.length
                ? `${fila.length} ${fila.length === 1 ? "pessoa espera" : "pessoas esperam"} sua resposta`
                : "Seu dia, do que pede resposta primeiro"
        }
        icone={Sun}
      >
        {gestor && <FiltroPeriodo chave={periodo.chave} rotulo={periodo.rotulo} deDia={periodo.deDia} ateDia={periodo.ateDia} hoje={periodo.hoje} />}
      </CabecalhoOpa>
      <CorpoOpa>
        <ContatosNovos inicial={contatosNovos} />
        {gestor ? (
          <VisaoGestor
            leads={leads}
            equipe={equipe}
            vendas={vendas}
            periodo={periodo}
            veReceita={veReceita}
            admin={org.role === "admin"}
            orgId={org.orgId}
            corretor={corretor}
          />
        ) : (
          <VisaoCorretor leads={leads} porCodigo={porCodigo} orgId={org.orgId} userId={user.id} filtro={filtroFila} />
        )}
      </CorpoOpa>
    </>
  );
}
