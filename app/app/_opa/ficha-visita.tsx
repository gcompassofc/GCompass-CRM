"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CampoVisita } from "@/lib/opa/config";
import { HouseLine, MagnifyingGlass, MapPin, Plus, UserPlus, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { buscarLeadsVisita, registrarVisitaRapida, type LeadParaVisita } from "./actions";
import { IconeRedondo } from "./ui";

/**
 * Ficha de visita de qualquer tela (vinda do Painel/Studio). Três passos numa
 * janela só: quem visitou (puxa o lead ou indica um novo), qual imóvel e como
 * foi. Salvar registra a visita no lead e move o card para Visita realizada.
 */

const campoCls =
  "h-11 w-full rounded-[14px] border border-transparent bg-[#f2f6f9] px-4 text-[14px] font-normal text-[#0a2d40] outline-none transition-colors focus:border-[#8fc4dd] focus:bg-white";
const rotuloCls = "flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]";
const pilula = "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50";

export interface ImovelParaVisita {
  codigo: string;
  titulo: string;
  bairro: string | null;
}

function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#0a2d40]">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#0a2d40] text-[12px] text-white">{n}</span>
        {titulo}
      </p>
      {children}
    </section>
  );
}

export function FichaVisitaRapida({
  imoveis,
  campos,
  imovelFixo,
  variante = "branca",
  semBotao = false,
}: {
  imoveis: ImovelParaVisita[];
  campos: CampoVisita[];
  /** Na página do imóvel, o imóvel já vem escolhido. */
  imovelFixo?: string;
  variante?: "branca" | "escura";
  /** Só o formulário: quem abre é o menu Criar ou a busca, pelo evento "opa:nova-visita". */
  semBotao?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  // 1. quem visitou
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<LeadParaVisita[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [lead, setLead] = useState<LeadParaVisita | null>(null);
  const [novo, setNovo] = useState(false);
  // 2. imóvel
  const [buscaImovel, setBuscaImovel] = useState("");
  const [imovel, setImovel] = useState<string | null>(imovelFixo ?? null);
  // 3. como foi
  const [interesse, setInteresse] = useState(0);

  const obr = (k: string) => campos.find((c) => c.chave === k)?.obrigatorio ?? false;
  const op = (k: string) => campos.find((c) => c.chave === k)?.opcoes ?? [];
  const rot = (k: string, padrao: string) => campos.find((c) => c.chave === k)?.rotulo ?? padrao;

  // O menu Criar e a busca abrem por aqui; ?visita=1 chega de telas sem este formulário.
  useEffect(() => {
    if (imovelFixo) return;
    const abrir = () => setAberto(true);
    const janela = window as unknown as Record<string, boolean | undefined>;
    window.addEventListener("opa:nova-visita", abrir);
    janela["__opa:nova-visita"] = true;
    const p = new URLSearchParams(window.location.search);
    if (p.get("visita") === "1") {
      p.delete("visita");
      window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
      abrir();
    }
    return () => {
      window.removeEventListener("opa:nova-visita", abrir);
      janela["__opa:nova-visita"] = false;
    };
  }, [imovelFixo]);

  // Busca de lead com um respiro de 250 ms entre teclas.
  useEffect(() => {
    if (lead || novo || busca.trim().length < 2) return;
    let vale = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarLeadsVisita(busca).catch(() => []);
      if (vale) {
        setAchados(r);
        setBuscando(false);
      }
    }, 250);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [busca, lead, novo]);

  const sugestoesImovel = useMemo(() => {
    const t = semAcento(buscaImovel.trim());
    if (!t) return [];
    return imoveis
      .filter((i) => semAcento(`${i.codigo} ${i.titulo} ${i.bairro ?? ""}`).includes(t))
      .slice(0, 8);
  }, [buscaImovel, imoveis]);
  const imovelEscolhido = imoveis.find((i) => i.codigo === imovel) ?? null;

  function limpar() {
    setBusca("");
    setAchados([]);
    setLead(null);
    setNovo(false);
    setBuscaImovel("");
    setImovel(imovelFixo ?? null);
    setInteresse(0);
  }

  const listaAberta = !lead && !novo && busca.trim().length >= 2;

  return (
    <>
      {!semBotao && (
      <button
        type="button"
        onClick={() => {
          limpar();
          setAberto(true);
        }}
        className={cn(
          pilula,
          variante === "escura"
            ? "bg-[#0a2d40] text-white hover:bg-[#12455f]"
            : "bg-white text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]",
        )}
      >
        <MapPin className="size-4" weight="bold" /> Visita
      </button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] max-w-xl gap-6 overflow-y-auto rounded-[28px] border-0 bg-white p-7 [&>*]:min-w-0">
          <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
            <IconeRedondo icone={MapPin} />
            <div className="min-w-0">
              <DialogTitle className="text-[19px] tracking-[-0.02em] text-[#0a2d40]">Ficha de visita</DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">
                Quem foi, qual imóvel e como foi. Salvar move o card para Visita realizada.
              </DialogDescription>
            </div>
          </DialogHeader>

          <form
            className="flex flex-col gap-6"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!lead && !novo) return void toast.error("Escolha quem visitou ou indique um cliente novo.");
              if (!imovel) return void toast.error("Escolha o imóvel visitado.");
              if (obr("interesse") && !interesse) return void toast.error("Marque o interesse de 1 a 5.");
              const fd = new FormData(ev.currentTarget);
              if (lead) fd.set("leadId", lead.id);
              fd.set("imovel", imovel);
              if (interesse) fd.set("interesse", String(interesse));
              iniciar(async () => {
                const r = await registrarVisitaRapida(fd);
                if (!r.ok) return void toast.error(r.erro);
                if (r.aviso) toast.warning(`${r.criado ? "Cliente cadastrado. " : ""}${r.aviso}`);
                else toast.success(r.criado ? "Cliente cadastrado e visita registrada." : "Visita registrada.");
                setAberto(false);
                if (r.leadId) router.push(`/app/leads/${r.leadId}?aba=visitas`);
                else router.refresh();
              });
            }}
          >
            <Passo n={1} titulo="Quem visitou">
              {lead ? (
                <div className="flex items-center gap-3 rounded-[18px] bg-[#f2f6f9] p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-[13px] font-semibold text-white">
                    {lead.nome
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{lead.nome}</p>
                    <p className="truncate text-[12px] text-[#5b7284]">
                      {lead.final && `final ${lead.final} · `}
                      {lead.etapa}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Trocar o cliente"
                    onClick={() => setLead(null)}
                    className="flex size-11 items-center justify-center rounded-full text-[#5b7284] hover:bg-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : novo ? (
                <div className="flex flex-col gap-3 rounded-[18px] bg-[#f2f6f9] p-4">
                  <p className="flex items-center gap-2 text-[13px] text-[#5b7284]">
                    <UserPlus className="size-4 text-[#2a7ca8]" /> Cliente novo: vira lead seu ao salvar.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <label className={rotuloCls}>
                      Nome
                      <input name="nome" required minLength={2} defaultValue={busca.replace(/[\d()+-]/g, "").trim()} className={cn(campoCls, "bg-white")} />
                    </label>
                    <label className={rotuloCls}>
                      Celular com DDD
                      <input
                        name="telefone"
                        required
                        inputMode="tel"
                        placeholder="(12) 99999-9999"
                        defaultValue={/\d{4}/.test(busca) ? busca : ""}
                        className={cn(campoCls, "bg-white")}
                      />
                    </label>
                  </div>
                  <label className={rotuloCls}>
                    Como chegou até a OPA
                    <select name="origem" defaultValue="indicacao" className={cn(campoCls, "bg-white")}>
                      <option value="indicacao">Indicação ou contato direto</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="site">Site</option>
                      <option value="meta">Anúncio no Instagram ou Facebook</option>
                      <option value="linkbio">Link da bio</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => setNovo(false)} className="self-start text-[13px] font-semibold text-[#2a7ca8]">
                    Voltar e procurar no CRM
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <MagnifyingGlass className="pointer-events-none absolute left-4 top-3.5 size-4 text-[#5b7284]" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome, telefone ou código do imóvel"
                    className={cn(campoCls, "pl-10")}
                  />
                  {listaAberta && (
                    <ul className="mt-2 flex flex-col overflow-hidden rounded-[18px] border border-[#eef3f6]">
                      {achados.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => setLead(l)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f2f6f9]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-semibold text-[#0a2d40]">{l.nome}</span>
                              <span className="block truncate text-[12px] text-[#5b7284]">
                                {l.final && `final ${l.final} · `}
                                {l.imovel ? `${l.imovel} · ` : ""}
                                {l.etapa}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {!buscando && achados.length === 0 && (
                        <li className="px-4 py-3 text-[13px] text-[#5b7284]">Ninguém com esse nome ou telefone entre os seus leads.</li>
                      )}
                      <li className="border-t border-[#eef3f6]">
                        <button
                          type="button"
                          onClick={() => setNovo(true)}
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-[#2a7ca8] hover:bg-[#f2f6f9]"
                        >
                          <UserPlus className="size-4" /> Não está no CRM: indicar cliente novo
                        </button>
                      </li>
                    </ul>
                  )}
                  {!listaAberta && (
                    <button type="button" onClick={() => setNovo(true)} className="mt-2 text-[13px] font-semibold text-[#2a7ca8]">
                      Cliente ainda não está no CRM? Indicar
                    </button>
                  )}
                </div>
              )}
            </Passo>

            <Passo n={2} titulo={rot("imovel", "Imóvel visitado")}>
              {imovelEscolhido ? (
                <div className="flex items-center gap-3 rounded-[18px] bg-[#f2f6f9] p-3">
                  <IconeRedondo icone={HouseLine} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[#0a2d40]">{imovelEscolhido.titulo}</p>
                    <p className="truncate text-[12px] text-[#5b7284]">
                      {imovelEscolhido.codigo}
                      {imovelEscolhido.bairro ? ` · ${imovelEscolhido.bairro}` : ""}
                    </p>
                  </div>
                  {!imovelFixo && (
                    <button
                      type="button"
                      aria-label="Trocar o imóvel"
                      onClick={() => setImovel(null)}
                      className="flex size-11 items-center justify-center rounded-full text-[#5b7284] hover:bg-white"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <HouseLine className="pointer-events-none absolute left-4 top-3.5 size-4 text-[#5b7284]" />
                    <input
                      value={buscaImovel}
                      onChange={(e) => setBuscaImovel(e.target.value)}
                      placeholder="Código, nome ou bairro (ex.: Feiticeira)"
                      className={cn(campoCls, "pl-10")}
                    />
                  </div>
                  {sugestoesImovel.length > 0 && (
                    <ul className="mt-2 flex flex-col overflow-hidden rounded-[18px] border border-[#eef3f6]">
                      {sugestoesImovel.map((i) => (
                        <li key={i.codigo}>
                          <button
                            type="button"
                            onClick={() => setImovel(i.codigo)}
                            className="flex w-full flex-col px-4 py-3 text-left hover:bg-[#f2f6f9]"
                          >
                            <span className="truncate text-[14px] font-semibold text-[#0a2d40]">{i.titulo}</span>
                            <span className="truncate text-[12px] text-[#5b7284]">
                              {i.codigo}
                              {i.bairro ? ` · ${i.bairro}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Passo>

            <Passo n={3} titulo="Como foi">
              <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                <label className={rotuloCls}>
                  {rot("quando", "Data e hora")}
                  <input type="datetime-local" name="quando" required defaultValue={agoraLocal()} className={campoCls} />
                </label>
                <label className={rotuloCls}>
                  {rot("chegada", "Como chegou")}
                  <select name="chegada" className={campoCls} defaultValue="">
                    <option value="" />
                    {op("chegada").map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={rotuloCls}>
                <span>
                  {rot("interesse", "Interesse depois da visita (1 a 5)")}
                  {obr("interesse") && <span className="ml-1 text-[#a4410e]">*</span>}
                </span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={interesse === n}
                      onClick={() => setInteresse(n)}
                      className={cn(
                        "size-11 rounded-full text-[15px] font-semibold transition-colors",
                        interesse === n ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#34566b] hover:bg-[#e7f0f5]",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {(
                [
                  ["gostou", "gostou", "O que gostou"],
                  ["nao_gostou", "naogostou", "O que não gostou"],
                ] as const
              ).map(([nome, chave, padrao]) => (
                <label key={nome} className={rotuloCls}>
                  <span>
                    {rot(chave, padrao)}
                    {obr(chave) && <span className="ml-1 text-[#a4410e]">*</span>}
                  </span>
                  <input name={nome} required={obr(chave)} maxLength={500} className={campoCls} />
                </label>
              ))}
              <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                <label className={rotuloCls}>
                  {rot("quem", "Quem foi")}
                  <input name="quem" maxLength={120} placeholder="Ex.: casal e a filha" className={campoCls} />
                </label>
                <label className={rotuloCls}>
                  {rot("proximo", "Próximo passo")}
                  <select name="proximo" className={campoCls}>
                    {op("proximo").map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={rotuloCls}>
                {rot("obs", "Observações")}
                <textarea name="obs" rows={2} maxLength={2000} className={cn(campoCls, "h-auto py-3")} />
              </label>
              <p className="text-[12px] text-[#5b7284]">Sem telefone nos textos: o contato do cliente já fica no lead.</p>
            </Passo>

            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setAberto(false)} className={cn(pilula, "bg-[#eef3f6] font-medium text-[#34566b] hover:bg-[#e7f0f5]")}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente} className={cn(pilula, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
                <Plus className="size-4" weight="bold" /> Salvar visita
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
