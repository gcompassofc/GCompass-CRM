import { notFound } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { perfilAtivo } from "@/lib/navigation/registry";
import { lerDeepLink, versaoDoPapel, versoesPermitidas } from "@/lib/opa/tutorial";
import { BookOpen } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { TutoriaisCliente } from "./_cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutoriais" };

/**
 * Tutoriais (01/11/2026): o passo a passo inteiro, cada passo como tópico
 * agrupado por tela, dúvidas frequentes e busca. `?passo=fila` abre direto
 * naquele passo; é o destino do "?" ao lado do título de cada tela.
 */
export default async function TutoriaisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (perfilAtivo() !== "imobiliaria") notFound();
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  const papel = org?.role ?? null;
  const versoes = versoesPermitidas(papel, user.is_platform_admin);
  const minha = versaoDoPapel(papel, user.is_platform_admin);
  const sp = await searchParams;
  const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const abrir = lerDeepLink({ passo: um(sp.passo), versao: um(sp.versao) }, versoes, minha);

  return (
    <>
      <CabecalhoOpa secao="Seu espaço" titulo="Tutoriais" subtitulo="O passo a passo e as dúvidas do dia a dia" icone={BookOpen} equipe={false} ferramentas={false} />
      <CorpoOpa largura="max-w-[960px]">
        <TutoriaisCliente versoes={versoes} minha={minha} abrir={abrir} />
      </CorpoOpa>
    </>
  );
}
