import { Suspense } from "react";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { carregarEquipe, carregarImoveis } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";

import { BuscaGlobal, FiltroEquipe, NovoLead } from "./cabecalho-cliente";
import { FichaVisitaRapida } from "./ficha-visita";
import { IconeRedondo, type Icone } from "./ui";

/**
 * Topo das telas do perfil imobiliária (reformulação de 30/10/2026): título
 * grande com o ícone da tela sobre o fundo cinza-azulado, como na Planta e na
 * Lastro, e à direita o filtro "Equipe toda" (gestor), a busca e o "Novo lead".
 * Nada de faixa colorida: o respiro é o destaque.
 */
export async function CabecalhoOpa({
  secao = "Operação",
  titulo,
  subtitulo,
  icone,
  equipe = true,
  ferramentas,
  children,
}: {
  /** "Operação", "Configuração", "Seu espaço" ou o nome do funil. */
  secao?: string;
  titulo: string;
  subtitulo?: string;
  /** Ícone da tela, num círculo escuro ao lado do título. */
  icone?: Icone;
  /** Mostra o filtro "Equipe toda / corretor" (só para gestor). */
  equipe?: boolean;
  /** Busca e "Novo lead". Desligar onde viram ruído (ficha do lead, Kit). */
  ferramentas?: boolean;
  /** Ações extras, à esquerda da busca. */
  children?: React.ReactNode;
}) {
  // Nas telas de Configuração, busca e "Novo lead" são ruído: saem por padrão.
  const mostrarFerramentas = ferramentas ?? secao !== "Configuração";
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  const gestor = org?.role === "manager" || org?.role === "admin";
  const [pessoas, imoveis, config] = org
    ? await Promise.all([carregarEquipe(org.orgId), carregarImoveis(org.orgId), carregarConfig(await createClient(), org.orgId)])
    : [new Map(), [], null];
  // Leitura não registra visita nem cria lead.
  const atende = org?.role !== undefined && org.role !== "viewer";
  const lista = [...pessoas.values()]
    .filter((p) => p.papel !== "viewer")
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => ({ id: p.id, nome: p.nome }));
  const ativos = imoveis.filter((i) => i.status !== "vendido");
  const acervo = ativos.map((i) => ({ codigo: i.codigo, titulo: i.titulo }));
  const paraVisita = ativos.map((i) => ({ codigo: i.codigo, titulo: i.titulo, bairro: i.bairro }));

  return (
    <header className="px-5 pb-2 pt-6 md:px-10 md:pt-9">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {icone && <IconeRedondo icone={icone} tom="escuro" tamanho="lg" className="hidden size-14 sm:inline-flex [&_svg]:size-7" />}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#5b7284]">{secao}</p>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] text-[#0a2d40] md:text-[40px]">{titulo}</h1>
            {subtitulo && <p className="mt-0.5 text-[15px] text-[#5b7284]">{subtitulo}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {equipe && gestor && (
            // useSearchParams pede Suspense; sem ele a página inteira cai para render no cliente.
            <Suspense fallback={null}>
              <FiltroEquipe pessoas={lista} />
            </Suspense>
          )}
          {mostrarFerramentas && (
            <>
              <BuscaGlobal />
              {atende && config && <FichaVisitaRapida imoveis={paraVisita} campos={config.ficha_visita} />}
              <NovoLead gestor={gestor} pessoas={lista} imoveis={acervo} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Corpo da tela, logo abaixo do topo. */
export function CorpoOpa({ children, largura = "max-w-[1400px]" }: { children: React.ReactNode; largura?: string }) {
  return <div className={`mx-auto flex w-full ${largura} flex-col gap-6 px-5 pb-16 pt-5 md:px-10`}>{children}</div>;
}
