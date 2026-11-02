"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CaretDown, CaretUp, ChatCircle, Check, CircleNotch, Lock, UserPlus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { decidirContato, verConversa, type ContatoNovo, type MensagemDoContatoNovo } from "./contatos-novos-actions";
import { Cartao, TituloBloco } from "./ui";

/**
 * "Contatos novos: é lead?" no Hoje do corretor e no Meu WhatsApp. Desde
 * 02/11/2026 a conversa desses contatos fica guardada, cifrada e só para o dono
 * do número, até ele decidir: a lista mostra quem é e a última mensagem; "Ver
 * conversa" abre as últimas 5. Lead passa a ser lido pela IA; pessoal apaga tudo
 * (por isso pede um segundo toque); sem decisão, some em 7 dias.
 */

const FUSO = "America/Sao_Paulo";

function diaSP(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO }).format(d);
}

/** "14:32" se for hoje (São Paulo), "31/10 14:32" se não. */
function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO }).format(d);
  if (diaSP(d) === diaSP(new Date())) return hora;
  const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO }).format(d);
  return `${dia} ${hora}`;
}

function telefoneLegivel(tel: string | null): string {
  if (!tel) return "Número oculto pelo WhatsApp";
  const d = tel.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

const BOTAO = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-60";

type Conversa = MensagemDoContatoNovo[] | "carregando" | "erro";

function Baloes({ conversa }: { conversa: Conversa }) {
  if (conversa === "carregando") {
    return (
      <p className="flex items-center gap-2 py-2 text-[13px] text-[#5b7284]">
        <CircleNotch className="size-4 animate-spin" aria-hidden />
        Abrindo a conversa
      </p>
    );
  }
  if (conversa === "erro") return <p className="py-2 text-[13px] text-[#5b7284]">Não deu para abrir agora. Tente de novo.</p>;
  if (!conversa.length) return <p className="py-2 text-[13px] text-[#5b7284]">Nada guardado desta conversa ainda.</p>;
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] bg-[#efe9e1] p-3">
      {conversa.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[85%] rounded-[16px] px-3 py-1.5 text-[14px] text-[#0a2d40] shadow-[0_1px_1px_rgba(0,0,0,0.06)]",
            m.direcao === "entrada" ? "self-start rounded-tl-md bg-white" : "self-end rounded-tr-md bg-[#dcf8c6]",
          )}
        >
          <p className="whitespace-pre-line break-words">{m.texto}</p>
          <p className="mt-0.5 text-right text-[10px] text-[#5b7284]">{quando(m.em)}</p>
        </div>
      ))}
    </div>
  );
}

export function ContatosNovos({ inicial, compacto }: { inicial: ContatoNovo[]; compacto?: boolean }) {
  const [lista, setLista] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Record<string, Conversa>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (!lista.length) return null;

  const decidir = (c: ContatoNovo, d: "lead" | "pessoal") =>
    iniciar(async () => {
      setOcupado(c.id);
      try {
        const r = await decidirContato(c.id, d);
        if (!r.ok) {
          toast.error(r.erro ?? "Não deu certo agora.");
          return;
        }
        setLista((l) => l.filter((x) => x.id !== c.id));
        toast.success(
          d === "lead" ? "Virou lead. A conversa foi para a ficha e a IA já está lendo." : "Marcado como pessoal. Apagamos o que estava guardado.",
        );
      } catch {
        toast.error("Não deu certo agora. Tente de novo em instantes.");
      } finally {
        setOcupado(null);
        setConfirmar(null);
      }
    });

  const alternarConversa = (c: ContatoNovo) => {
    if (aberto === c.id) {
      setAberto(null);
      return;
    }
    setAberto(c.id);
    const atual = conversas[c.id];
    if (atual && atual !== "erro") return;
    setConversas((v) => ({ ...v, [c.id]: "carregando" }));
    iniciar(async () => {
      try {
        const r = await verConversa(c.id);
        setConversas((v) => ({ ...v, [c.id]: r.ok ? r.mensagens : "erro" }));
      } catch {
        setConversas((v) => ({ ...v, [c.id]: "erro" }));
      }
    });
  };

  return (
    <Cartao bloco tour="contatos-novos" className={cn(compacto ? "" : "mb-6")}>
      <TituloBloco icone={UserPlus} titulo="Contatos novos: é lead?" />
      <p className="mt-3 text-[13px] leading-relaxed text-[#5b7284]">Só você vê. Se for pessoal, apagamos tudo; sem decisão, some em 7 dias.</p>
      <ul className="mt-5 flex flex-col gap-2">
        {lista.map((c) => {
          const ocupadoAqui = ocupado === c.id;
          const confirmando = confirmar === c.id;
          const conversaAberta = aberto === c.id;
          const ultima = c.ultimaMensagem;
          return (
            <li key={c.id} className="rounded-[22px] bg-[#f2f6f9] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[15px] font-semibold text-[#0a2d40]">{c.nome ?? "Sem nome no WhatsApp"}</p>
                <span className="shrink-0 text-[12px] tabular-nums text-[#5b7284]">{quando(ultima?.em ?? c.ultimoContatoEm)}</span>
              </div>
              <p className="truncate text-[13px] text-[#5b7284]">{telefoneLegivel(c.telefone)}</p>
              {ultima?.texto && (
                <p className="mt-1 truncate text-[14px] text-[#34566b]">
                  {ultima.direcao === "saida" && <span className="text-[#5b7284]">Você: </span>}
                  {ultima.texto}
                </p>
              )}

              {conversaAberta && (
                <div className="mt-3">
                  <Baloes conversa={conversas[c.id] ?? "carregando"} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => decidir(c, "lead")}
                  disabled={ocupadoAqui}
                  className={cn(BOTAO, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}
                >
                  {ocupadoAqui ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  É lead
                </button>
                {confirmando ? (
                  <>
                    <button
                      type="button"
                      onClick={() => decidir(c, "pessoal")}
                      disabled={ocupadoAqui}
                      className={cn(BOTAO, "bg-[#a4410e] text-white hover:bg-[#8a360b]")}
                    >
                      <Lock className="size-4" aria-hidden />
                      Confirmar: é pessoal
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmar(null)}
                      disabled={ocupadoAqui}
                      className={cn(BOTAO, "px-3 text-[#5b7284] hover:bg-[#e7f0f5]")}
                    >
                      Voltar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmar(c.id)}
                      disabled={ocupadoAqui}
                      className={cn(BOTAO, "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]")}
                    >
                      <Lock className="size-4" aria-hidden />
                      Pessoal
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarConversa(c)}
                      aria-expanded={conversaAberta}
                      className={cn(BOTAO, "ml-auto px-3 text-[#2a7ca8] hover:bg-[#e7f0f5]")}
                    >
                      <ChatCircle className="size-4" aria-hidden />
                      {conversaAberta ? "Fechar" : "Ver conversa"}
                      {conversaAberta ? <CaretUp className="size-3.5" aria-hidden /> : <CaretDown className="size-3.5" aria-hidden />}
                    </button>
                  </>
                )}
              </div>
              {confirmando && (
                <p className="mt-2 text-[13px] text-[#a4410e]" aria-live="polite">
                  Apaga o que estava guardado desta conversa, e o contato sai desta lista.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-[#5b7284]">
        No WhatsApp Business você também pode marcar a conversa com a etiqueta <strong>Lead OPA</strong> ou <strong>Pessoal</strong>.
      </p>
    </Cartao>
  );
}
