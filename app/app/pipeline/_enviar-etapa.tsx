"use client";

import { useMemo, useState, useTransition } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  linkWhatsApp,
  MARCADOR_NOME,
  personalizar,
  podeReceber,
  sugestaoDaEtapa,
  type ItemEnvio,
} from "@/lib/opa/envio-etapa";
import { ArrowLeft, Check, PaperPlaneTilt, Warning, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { BarraHachurada, IconeRedondo } from "../_opa/ui";
import { leadsDaEtapaParaEnvio } from "./actions";

/**
 * "Mandar para todos" da etapa: dois passos, um foco por passo. Primeiro a
 * mensagem (com [nome]); depois a lista, e cada "Abrir WhatsApp" abre a conversa
 * do lead no WhatsApp do próprio corretor com o texto pronto. Ele toca em enviar
 * lá. O CRM não envia nada (regras em lib/opa/envio-etapa.ts).
 */

export interface EnvioDaEtapa {
  /** Primeiro nome de quem envia, para a sugestão de primeiro contato. */
  corretor: string;
  /** `?corretor=` do gestor; o corretor sempre recebe só os dele. */
  filtro: string | null;
}

const DIALOGO =
  "w-[calc(100%-24px)] max-w-lg max-h-[90dvh] gap-5 overflow-y-auto rounded-[28px] border-0 bg-white p-6 sm:p-7 [&>*]:min-w-0";
const pilula = "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50";

type Lista = { itens: ItemEnvio[]; total: number; teto: number };

export function EnviarEtapa({
  etapa,
  envio,
}: {
  etapa: { id: string; nome: string; slug: string; quantos: number };
  envio: EnvioDaEtapa;
}) {
  const sugestao = useMemo(() => sugestaoDaEtapa(etapa.slug, envio.corretor), [etapa.slug, envio.corretor]);
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [texto, setTexto] = useState(sugestao);
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Fica guardado enquanto a tela está aberta: fechar e voltar não perde quem já foi aberto.
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  const [carregando, iniciar] = useTransition();

  const abrir = () => {
    setAberto(true);
    setPasso(1);
    setErro(null);
    iniciar(async () => {
      const r = await leadsDaEtapaParaEnvio(etapa.id, envio.filtro);
      if (r.ok) setLista({ itens: r.itens, total: r.total, teto: r.teto });
      else setErro(r.erro);
    });
  };

  const itens = lista?.itens ?? [];
  const quantos = lista ? lista.total : etapa.quantos;
  const situacao = new Map(itens.map((i) => [i.id, podeReceber(i, texto)]));
  const elegiveis = itens.filter((i) => situacao.get(i.id) === "ok");
  const abertos = elegiveis.filter((i) => feitos.has(i.id)).length;
  const offBloqueados = itens.filter((i) => situacao.get(i.id) === "off-market").length;
  const exemplo = itens.find((i) => i.primeiroNome)?.primeiroNome ?? "";
  const semMarcador = !texto.toLowerCase().includes(MARCADOR_NOME);

  return (
    <>
      <button
        type="button"
        data-tour="funil-enviar"
        onClick={abrir}
        title="Mandar mensagem para todos desta etapa"
        aria-label={`Mandar mensagem para todos de ${etapa.nome}`}
        className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[#2a7ca8] transition-colors hover:bg-white"
      >
        <PaperPlaneTilt className="size-4" weight="bold" />
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={DIALOGO}>
          {passo === 1 ? (
            <>
              <DialogHeader className="flex-row items-start gap-3 space-y-0 pr-6 text-left">
                <IconeRedondo icone={PaperPlaneTilt} tom="acao" />
                <div className="min-w-0">
                  <DialogTitle className="text-[19px] tracking-[-0.02em] text-[#0a2d40]">Mensagem para {etapa.nome}</DialogTitle>
                  <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">
                    {carregando && !lista ? "Contando os leads da etapa." : `${quantos} ${quantos === 1 ? "lead" : "leads"} nesta etapa.`} Você abre um por um no seu
                    WhatsApp e toca em enviar.
                  </DialogDescription>
                </div>
              </DialogHeader>

              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                Mensagem
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-[18px] border border-transparent bg-[#f2f6f9] px-4 py-3 text-[15px] font-normal leading-relaxed text-[#0a2d40] outline-none transition-colors focus:border-[#8fc4dd] focus:bg-white"
                />
              </label>
              <div className="-mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#5b7284]">
                <span>
                  <b className="font-semibold text-[#34566b]">{MARCADOR_NOME}</b> vira o primeiro nome de cada lead.
                </span>
                {texto !== sugestao && (
                  <button type="button" onClick={() => setTexto(sugestao)} className="h-11 font-semibold text-[#2a7ca8]">
                    Usar a sugestão
                  </button>
                )}
              </div>

              {exemplo && !semMarcador && texto.trim() && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] text-[#5b7284]">Assim chega para {exemplo}:</p>
                  <p className="whitespace-pre-line rounded-[20px] rounded-br-md bg-[#dcf8c6] px-4 py-3 text-[14px] leading-relaxed text-[#0a2d40]">
                    {personalizar(texto, exemplo)}
                  </p>
                </div>
              )}

              {offBloqueados > 0 && (
                <p className="flex items-start gap-2 rounded-[18px] bg-[#fdf1dc] px-4 py-3 text-[13px] leading-relaxed text-[#9a5b00]">
                  <Warning className="mt-0.5 size-4 shrink-0" weight="fill" />
                  {offBloqueados === 1 ? "Um lead é off market" : `${offBloqueados} leads são off market`}: link e valor não vão por escrito. Enquanto a
                  mensagem tiver link ou valor, {offBloqueados === 1 ? "ele fica" : "eles ficam"} de fora.
                </p>
              )}
              {erro && <p className="text-[13px] text-[#a4410e]">{erro}</p>}

              <button
                type="button"
                onClick={() => setPasso(2)}
                disabled={!texto.trim() || carregando || !lista || itens.length === 0}
                className={cn(pilula, "w-full bg-[#0a2d40] text-white hover:bg-[#12455f]")}
              >
                {carregando && !lista ? "Buscando os leads" : lista && itens.length === 0 ? "Nenhum lead seu nesta etapa" : `Ver os ${itens.length} leads`}
              </button>
            </>
          ) : (
            <>
              <DialogHeader className="space-y-0 pr-6 text-left">
                <DialogTitle className="text-[19px] tracking-[-0.02em] text-[#0a2d40]">Abra um por um</DialogTitle>
                <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">
                  Cada toque abre o WhatsApp com a mensagem pronta. Você confere e envia.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <p className="text-[14px] font-semibold tabular-nums text-[#0a2d40]" aria-live="polite">
                  {abertos} de {elegiveis.length} {elegiveis.length === 1 ? "aberto" : "abertos"}
                </p>
                <BarraHachurada pct={elegiveis.length ? (abertos / elegiveis.length) * 100 : 0} />
              </div>

              {lista && lista.total > lista.teto && (
                <p className="rounded-[18px] bg-[#e7f0f5] px-4 py-3 text-[13px] leading-relaxed text-[#12455f]">
                  A etapa tem {lista.total} leads. Aqui estão os {lista.teto} mais recentes.
                </p>
              )}

              <ul className="-mx-2 flex flex-col">
                {itens.map((i) => {
                  const s = situacao.get(i.id);
                  const feito = feitos.has(i.id);
                  return (
                    <li key={i.id} className="flex min-h-[60px] items-center gap-3 rounded-[18px] px-2 py-1.5 odd:bg-[#f7fafc]">
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-[15px] font-semibold", s === "ok" ? "text-[#0a2d40]" : "text-[#8aa3b3]")}>{i.nome}</p>
                        {(feito || s !== "ok") && (
                          <p className="flex items-center gap-1 text-[12px] text-[#5b7284]">
                            {s === "sem-numero" ? (
                              "sem número"
                            ) : s === "off-market" ? (
                              "off market: tire link e valor"
                            ) : (
                              <>
                                <Check className="size-3.5 text-[#1d6b43]" weight="bold" /> aberto
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      {s === "ok" && i.telefone ? (
                        <a
                          href={linkWhatsApp(i.telefone, personalizar(texto, i.primeiroNome))}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setFeitos((f) => new Set(f).add(i.id))}
                          aria-label={`${feito ? "Abrir de novo" : "Abrir WhatsApp"} de ${i.nome}`}
                          className={cn(
                            pilula,
                            "px-4",
                            feito ? "bg-[#eef3f6] font-medium text-[#34566b] hover:bg-[#e7f0f5]" : "bg-[#1d6b43] text-white hover:bg-[#17583a]",
                          )}
                        >
                          <WhatsappLogo className="size-4" weight={feito ? "regular" : "fill"} />
                          {feito ? "De novo" : "Abrir WhatsApp"}
                        </a>
                      ) : (
                        <span aria-disabled className={cn(pilula, "px-4 bg-[#f2f6f9] font-medium text-[#8aa3b3]")}>
                          <WhatsappLogo className="size-4" />
                          {s === "sem-numero" ? "Sem número" : "Off market"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="flex gap-2">
                <button type="button" onClick={() => setPasso(1)} className={cn(pilula, "bg-[#eef3f6] font-medium text-[#34566b] hover:bg-[#e7f0f5]")}>
                  <ArrowLeft className="size-4" /> Mensagem
                </button>
                <button type="button" onClick={() => setAberto(false)} className={cn(pilula, "flex-1 bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
                  {abertos >= elegiveis.length && elegiveis.length > 0 ? "Pronto" : "Fechar"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
