"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarBlank, Check, Copy, MapPin, Plus, Prohibit, Trophy, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { IconeRedondo, type Icone } from "../../_opa/ui";
import { agendarMensagem, ganharNegocio, moverEtapa, perderNegocio, registrarVisita } from "../actions";

// ---------------------------------------------------------------- estilos comuns

/** Diálogo arejado, cantos 28 como os cartões. */
const DIALOGO = "max-w-lg gap-5 rounded-[28px] border-0 bg-white p-7 [&>*]:min-w-0";
const campoCls =
  "h-11 w-full rounded-[14px] border border-transparent bg-[#f2f6f9] px-4 text-[14px] font-normal text-[#0a2d40] outline-none transition-colors focus:border-[#8fc4dd] focus:bg-white";
const rotuloCls = "flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]";
const pilula = "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50";
const pilulaBranca = cn(pilula, "bg-white text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]");
const cancelarCls = cn(pilula, "bg-[#eef3f6] font-medium text-[#34566b] hover:bg-[#e7f0f5]");

function CabecaDialogo({
  icone,
  tom,
  titulo,
  texto,
}: {
  icone: Icone;
  tom?: "claro" | "acao" | "escuro" | "alerta" | "ok";
  titulo: string;
  texto: string;
}) {
  return (
    <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
      <IconeRedondo icone={icone} tom={tom} />
      <div className="min-w-0">
        <DialogTitle className="text-[19px] tracking-[-0.02em] text-[#0a2d40]">{titulo}</DialogTitle>
        <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">{texto}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

// ---------------------------------------------------------------- mensagem pronta

/** A próxima mensagem num balão de WhatsApp, com botões redondos Copiar e WhatsApp. */
export function MensagemPronta({ texto, telefone }: { texto: string; telefone: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const wa = telefone ? `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}` : null;

  return (
    <div className="flex items-end gap-3">
      <p className="min-w-0 flex-1 whitespace-pre-line rounded-[20px] rounded-br-md bg-[#dcf8c6] px-4 py-3 text-[14px] leading-relaxed text-[#0a2d40]">
        {texto}
      </p>
      <div className="flex shrink-0 flex-col gap-2">
        <button
          type="button"
          title={copiado ? "Copiada" : "Copiar"}
          aria-label={copiado ? "Mensagem copiada" : "Copiar mensagem"}
          onClick={async () => {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors",
            copiado ? "bg-[#e3f4ea] text-[#1e7a46]" : "bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e7f0f5]",
          )}
        >
          {copiado ? <Check className="size-5" weight="bold" /> : <Copy className="size-5" />}
        </button>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            title="Abrir no WhatsApp"
            aria-label="Abrir no WhatsApp"
            className="flex size-11 items-center justify-center rounded-full bg-[#25d366] text-white hover:brightness-105"
          >
            <WhatsappLogo weight="fill" className="size-5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ganhar

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export interface OpcaoImovel {
  codigo: string;
  titulo: string;
  precoCents: number | null;
  doNegocio: boolean;
}

/**
 * Ganhar o negócio. O imóvel do negócio já vem escolhido e o VGV sai do valor
 * pedido dele: se a venda foi desse imóvel, o corretor só confirma.
 */
export function GanharNegocio({ leadId, nome, opcoes }: { leadId: string; nome: string; opcoes: OpcaoImovel[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState(opcoes.find((o) => o.doNegocio)?.codigo ?? "");
  const [outro, setOutro] = useState(false);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
  const [pendente, iniciar] = useTransition();

  const escolhido = opcoes.find((o) => o.codigo === codigo);
  const vgvCents = useMemo(() => {
    if (outro) {
      const n = Number(valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
    }
    return escolhido?.precoCents ?? 0;
  }, [outro, valor, escolhido]);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={cn(pilula, "bg-[#0b7a4b] text-white hover:brightness-110")}>
        <Trophy weight="fill" className="size-4" /> Ganhar
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={DIALOGO}>
          <CabecaDialogo
            icone={Trophy}
            tom="ok"
            titulo={`Ganhar o negócio de ${nome}`}
            texto="O imóvel do negócio já está escolhido e o VGV vem do valor pedido dele. Se a venda foi desse imóvel, é só confirmar."
          />

          <div className="flex flex-col gap-4">
            <label className={rotuloCls}>
              Imóvel vendido
              <select value={codigo} onChange={(e) => setCodigo(e.target.value)} className={cn(campoCls, "min-w-0")}>
                {!codigo && <option value="">Escolha o imóvel</option>}
                {opcoes.map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.codigo} · {o.titulo.slice(0, 48)} · {o.precoCents ? reais(o.precoCents) : "sem valor"}
                    {o.doNegocio ? " (do negócio)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <div className="rounded-[20px] bg-[#f2f6f9] p-4">
                <p className="text-[12px] font-medium text-[#5b7284]">VGV (valor da venda)</p>
                {outro ? (
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                    autoFocus
                    className="mt-1 h-9 w-full rounded-[10px] border border-[#8fc4dd] bg-white px-3 text-[15px] outline-none"
                  />
                ) : (
                  <p className="mt-1 text-[22px] font-light tracking-[-0.03em] text-[#0a2d40]">{vgvCents ? reais(vgvCents) : "Escolha"}</p>
                )}
              </div>
              <div className="rounded-[20px] bg-[#e3f4ea] p-4">
                <p className="text-[12px] font-medium text-[#1e7a46]">Comissão OPA · 3%</p>
                <p className="mt-1 text-[22px] font-light tracking-[-0.03em] text-[#0b5c37]">
                  {vgvCents ? reais(Math.round(vgvCents * 0.03)) : "sem valor"}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2.5 rounded-[14px] bg-[#f2f6f9] px-4 py-3 text-[13px] text-[#34566b]">
              <input type="checkbox" checked={outro} onChange={(e) => setOutro(e.target.checked)} className="size-4 accent-[#0a2d40]" />
              Fechou por outro valor (abaixo ou acima do pedido)
            </label>
            {outro && escolhido?.precoCents ? (
              <p className="-mt-2 text-[12px] text-[#5b7284]">O valor pedido fica registrado ao lado: {reais(escolhido.precoCents)}.</p>
            ) : null}

            <label className={rotuloCls}>
              Data da venda
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campoCls} />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setAberto(false)} className={cancelarCls}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendente || !codigo || !vgvCents}
              onClick={() =>
                iniciar(async () => {
                  const fd = new FormData();
                  fd.set("leadId", leadId);
                  fd.set("imovelCodigo", codigo);
                  if (outro) {
                    fd.set("outroValor", "on");
                    fd.set("valor", valor);
                  }
                  fd.set("data", data);
                  const r = await ganharNegocio(fd);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success("Negócio ganho. Comissão lançada e venda na fila do Meta.");
                  setAberto(false);
                  router.refresh();
                })
              }
              className={cn(pilula, "bg-[#0b7a4b] text-white")}
            >
              <Check className="size-4" weight="bold" /> Confirmar ganho
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- etapas

/**
 * Trilha de etapas: as já passadas ficam marcadas com um visto, a atual em
 * pílula escura e as próximas em cinza. Clicar move o negócio (com as travas
 * do banco).
 */
export function EtapasClicaveis({
  leadId,
  atual,
  etapas,
}: {
  leadId: string;
  atual: string;
  etapas: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(atual);
  const [pendente, iniciar] = useTransition();
  const indiceAtual = etapas.findIndex((e) => e.id === valor);

  return (
    <nav aria-label="Etapa do negócio" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
      {etapas.map((e, i) => {
        const passou = i < indiceAtual;
        const atualAqui = e.id === valor;
        return (
          <button
            key={e.id}
            type="button"
            disabled={pendente}
            aria-current={atualAqui ? "step" : undefined}
            title={atualAqui ? "Etapa atual" : `Mover para ${e.nome}`}
            onClick={() => {
              if (atualAqui) return;
              const anterior = valor;
              setValor(e.id);
              iniciar(async () => {
                const fd = new FormData();
                fd.set("leadId", leadId);
                fd.set("etapaId", e.id);
                const r = await moverEtapa(fd);
                if (!r.ok) {
                  setValor(anterior);
                  toast.error(r.erro);
                } else {
                  toast.success(`Movido para ${e.nome}.`);
                  router.refresh();
                }
              });
            }}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              atualAqui && "bg-[#0a2d40] text-white",
              passou && "bg-[#e7f0f5] text-[#12455f] hover:bg-[#dce8ee]",
              !atualAqui && !passou && "bg-[#f2f6f9] text-[#5b7284] hover:bg-[#e7f0f5] hover:text-[#0a2d40]",
            )}
          >
            {passou && <Check className="size-3.5" weight="bold" />}
            {atualAqui && <span className="size-1.5 rounded-full bg-[#8fc4dd]" />}
            {e.nome}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- agendar mensagem

function agoraLocal(horas = 0): string {
  const d = new Date(Date.now() + horas * 3_600_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function AgendarMensagem({ leadId, sugestao }: { leadId: string; sugestao?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={pilulaBranca}>
        <CalendarBlank className="size-4" /> Agendar mensagem
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={cn(DIALOGO, "max-w-md")}>
          <CabecaDialogo
            icone={CalendarBlank}
            titulo="Agendar mensagem"
            texto="Na hora marcada o OPA Lembretes avisa o corretor no WhatsApp dele, com a mensagem pronta para mandar."
          />
          <form
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              fd.set("leadId", leadId);
              iniciar(async () => {
                const r = await agendarMensagem(fd);
                if (!r.ok) return void toast.error(r.erro);
                toast.success("Mensagem agendada.");
                setAberto(false);
                router.refresh();
              });
            }}
          >
            <label className={rotuloCls}>
              Quando
              <input type="datetime-local" name="quando" required defaultValue={agoraLocal(24)} className={campoCls} />
            </label>
            <label className={rotuloCls}>
              Mensagem
              <textarea name="mensagem" required rows={5} defaultValue={sugestao} className={cn(campoCls, "h-auto py-3 leading-relaxed")} />
            </label>
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setAberto(false)} className={cancelarCls}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente} className={cn(pilula, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
                <CalendarBlank className="size-4" weight="bold" /> Agendar
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- visita

export interface CampoVisitaCliente {
  chave: string;
  rotulo: string;
  obrigatorio?: boolean;
  opcoes?: string[];
}

export function RegistrarVisita({
  leadId,
  imoveis,
  padrao,
  campos,
  modo = "feita",
  variante = "botao",
}: {
  leadId: string;
  imoveis: Array<{ codigo: string; titulo: string }>;
  padrao: string | null;
  campos: CampoVisitaCliente[];
  modo?: "feita" | "agendada";
  variante?: "botao" | "primario";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [interesse, setInteresse] = useState(0);
  const [pendente, iniciar] = useTransition();
  const obr = (k: string) => campos.find((c) => c.chave === k)?.obrigatorio ?? false;
  const op = (k: string) => campos.find((c) => c.chave === k)?.opcoes;
  const rot = (k: string, padraoRot: string) => campos.find((c) => c.chave === k)?.rotulo ?? padraoRot;
  const feita = modo === "feita";

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={variante === "primario" ? cn(pilula, "bg-[#0a2d40] text-white hover:bg-[#12455f]") : pilulaBranca}
      >
        {feita ? <MapPin className="size-4" /> : <CalendarBlank className="size-4" />} {feita ? "Registrar visita" : "Agendar visita"}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={cn(DIALOGO, "max-h-[90vh] overflow-y-auto")}>
          <CabecaDialogo
            icone={feita ? MapPin : CalendarBlank}
            titulo={feita ? "Ficha de visita" : "Agendar visita"}
            texto={
              feita
                ? "Salvar move o card para Visita realizada."
                : "Na véspera às 18h o OPA Lembretes avisa o corretor. Depois da visita, ele pede esta ficha."
            }
          />
          <form
            className="flex flex-col gap-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              fd.set("leadId", leadId);
              fd.set("status", modo);
              if (interesse) fd.set("interesse", String(interesse));
              iniciar(async () => {
                const r = await registrarVisita(fd);
                if (!r.ok) return void toast.error(r.erro);
                if (r.aviso) toast.warning(r.aviso);
                else toast.success(feita ? "Visita registrada." : "Visita agendada.");
                setAberto(false);
                router.refresh();
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <label className={rotuloCls}>
                {rot("quando", "Data e hora")}
                <input type="datetime-local" name="quando" required defaultValue={agoraLocal(feita ? 0 : 48)} className={campoCls} />
              </label>
              <label className={rotuloCls}>
                {rot("imovel", "Imóvel visitado")}
                <select name="imovel" defaultValue={padrao ?? ""} className={campoCls}>
                  <option value="">Escolha</option>
                  {imoveis.map((i) => (
                    <option key={i.codigo} value={i.codigo}>
                      {i.codigo} · {i.titulo.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {feita && (
              <>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <label className={rotuloCls}>
                    {rot("quem", "Quem foi")}
                    <input name="quem" className={campoCls} />
                  </label>
                  <label className={rotuloCls}>
                    {rot("chegada", "Como chegou")}
                    <select name="chegada" className={campoCls}>
                      <option value="" />
                      {(op("chegada") ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={rotuloCls}>
                  {rot("interesse", "Interesse depois da visita (1 a 5)")}
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
                    ["gostou", "O que gostou"],
                    ["nao_gostou", "O que não gostou"],
                    ["objecao", "Objeção principal"],
                  ] as const
                ).map(([k, r]) => (
                  <label key={k} className={rotuloCls}>
                    <span>
                      {rot(k === "nao_gostou" ? "naogostou" : k, r)}
                      {obr(k === "nao_gostou" ? "naogostou" : k) && <span className="ml-1 text-[#b42318]">*</span>}
                    </span>
                    <input name={k} className={campoCls} />
                  </label>
                ))}
                <label className={rotuloCls}>
                  {rot("proximo", "Próximo passo")}
                  <select name="proximo" className={campoCls}>
                    {(op("proximo") ?? []).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className={rotuloCls}>
                  {rot("obs", "Observações")}
                  <textarea name="obs" rows={2} className={cn(campoCls, "h-auto py-3")} />
                </label>
              </>
            )}
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setAberto(false)} className={cancelarCls}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente} className={cn(pilula, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
                {feita ? <Plus className="size-4" weight="bold" /> : <CalendarBlank className="size-4" weight="bold" />}
                {feita ? "Salvar visita" : "Agendar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- perder

export function PerderNegocio({ leadId, motivos }: { leadId: string; motivos: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={cn(pilulaBranca, "text-[#b42318] hover:bg-[#fde8e6]")}>
        <Prohibit className="size-4" /> Perder
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={cn(DIALOGO, "max-w-md")}>
          <CabecaDialogo icone={Prohibit} tom="alerta" titulo="Perder o negócio" texto="O card sai do quadro. O motivo entra no relatório de perdas." />
          <form
            className="flex flex-col gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              fd.set("leadId", leadId);
              iniciar(async () => {
                const r = await perderNegocio(fd);
                if (!r.ok) return void toast.error(r.erro);
                toast.success("Negócio marcado como perdido.");
                setAberto(false);
                router.refresh();
              });
            }}
          >
            {motivos.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-3 rounded-[16px] bg-[#f2f6f9] px-4 py-3 text-[14px] text-[#0a2d40] transition-colors hover:bg-[#e7f0f5] has-[:checked]:bg-[#0a2d40] has-[:checked]:text-white"
              >
                <input type="radio" name="motivo" value={m} required className="size-4 accent-[#8fc4dd]" /> {m}
              </label>
            ))}
            <DialogFooter className="mt-3 gap-2">
              <button type="button" onClick={() => setAberto(false)} className={cancelarCls}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente} className={cn(pilula, "bg-[#b42318] text-white hover:brightness-110")}>
                <Prohibit className="size-4" weight="bold" /> Confirmar perda
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
