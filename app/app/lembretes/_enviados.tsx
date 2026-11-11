import Link from "next/link";

import { carregarCanalDeAvisos, telefoneLegivel } from "@/lib/opa/aviso-whatsapp";
import { SESSAO_LEMBRETES } from "@/lib/opa/aviso-manual";
import type { ConfigOpa } from "@/lib/opa/config";
import type { Pessoa } from "@/lib/opa/dados";
import {
  SITUACOES_ENVIADO,
  TIPOS_ENVIADOS,
  agruparPorDia,
  chaveTelefone,
  motivoDoAviso,
  primeiraLinha,
  rotuloDoAviso,
  situacaoDaMensagem,
  textoVisivel,
  tipoDoTexto,
  type SituacaoEnviado,
  type TipoEnviado,
} from "@/lib/opa/enviados";
import { createAdminClient } from "@/lib/supabase/admin";
import { CaretDown, Info, Warning, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { AbasPilula, Avatar, Cartao, Chip, TituloBloco, Vazio, iniciaisDe } from "../_opa/ui";
import { MandarAviso } from "./_aviso";

/**
 * Agenda > Enviados (pedido do Allyson, 10/11/2026): tudo o que o número OPA Lembretes
 * mandou e para quem, do mais novo ao mais velho, e o botão de mandar um aviso escrito
 * na hora. Só gestor e administrador chegam aqui (a página confere antes de montar).
 *
 * Lê com o cliente admin: são as conversas do número da empresa com a própria equipe,
 * que a regra de visão das conversas não entrega ao gestor.
 */

const PERIODOS: Array<[number, string]> = [
  [1, "Hoje"],
  [7, "7 dias"],
  [30, "30 dias"],
];
/** Quantas linhas cada dia mostra antes do "Ver mais". */
const LINHAS_POR_DIA = 6;
const LIMITE = 600;

interface Linha {
  id: string;
  em: string;
  paraChave: string;
  paraNome: string;
  paraFoto: string | null;
  tipo: TipoEnviado;
  texto: string;
  situacao: SituacaoEnviado;
  erro: string | null;
  por: string | null;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** Começo do dia de hoje em São Paulo (UTC-3 o ano todo), menos os dias anteriores do período. */
function inicioDoPeriodo(dias: number, agora: number): string {
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Date(Date.parse(`${hoje}T00:00:00-03:00`) - (dias - 1) * 86_400_000).toISOString();
}

/** Texto com os links clicáveis (ficha do lead, wa.me). */
function ComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all font-medium text-[#2a7ca8] underline-offset-2 hover:underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function LinhaEnviada({ m }: { m: Linha }) {
  const tipo = TIPOS_ENVIADOS[m.tipo];
  const sit = SITUACOES_ENVIADO[m.situacao];
  return (
    <li>
      <details className="group rounded-[18px] bg-[#f6f9fb] transition-colors open:bg-[#eef3f6] hover:bg-[#eef3f6]">
        <summary className="flex min-h-[60px] cursor-pointer list-none items-start gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
          <Avatar texto={iniciaisDe(m.paraNome)} foto={m.paraFoto} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-[15px] font-semibold text-[#0a2d40]">{m.paraNome}</b>
              <Chip tom={tipo.tom}>{tipo.rotulo}</Chip>
              {m.por && <span className="text-[12px] text-[#5b7284]">por {m.por}</span>}
              {m.situacao === "falhou" && (
                <Chip tom="alerta" icone={Warning}>
                  Não saiu
                </Chip>
              )}
            </span>
            <span className="mt-1 block truncate text-[14px] text-[#34566b] group-open:hidden">{primeiraLinha(m.texto)}</span>
          </span>
          <time dateTime={m.em} className="shrink-0 pt-0.5 text-[13px] tabular-nums text-[#5b7284]">
            {hora(m.em)}
          </time>
          <CaretDown className="mt-1 size-4 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="pb-4 pl-[60px] pr-4">
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#0a2d40]">
            <ComLinks texto={m.texto} />
          </p>
          <p className="mt-3 text-[12px] text-[#5b7284]">
            {sit.rotulo}
            {m.por ? ` · escrita por ${m.por}` : " · automática"}
            {m.erro ? ` · ${m.erro}` : ""}
          </p>
        </div>
      </details>
    </li>
  );
}

export async function Enviados({
  orgId,
  equipe,
  config,
  dias: diasPedido,
  para,
}: {
  orgId: string;
  equipe: Map<string, Pessoa>;
  config: ConfigOpa;
  dias?: string;
  para?: string;
}) {
  const admin = createAdminClient();
  const agora = new Date().getTime();
  const dias = PERIODOS.some(([d]) => String(d) === diasPedido) ? Number(diasPedido) : 7;
  const desde = inicioDoPeriodo(dias, agora);

  const [{ data: sessaoRaw }, canal] = await Promise.all([
    admin.from("channel_sessions").select("id, status").eq("organization_id", orgId).eq("waha_session_name", SESSAO_LEMBRETES).is("archived_at", null).maybeSingle(),
    carregarCanalDeAvisos(admin as never, orgId),
  ]);
  const sessao = sessaoRaw as { id: string; status: string | null } | null;

  const [{ data: mensagensRaw }, { data: avisosRaw }] = await Promise.all([
    sessao
      ? admin
          .from("messages")
          .select("id, body, status, sent_at, sent_by_user_id, error_message, delivered_at, read_at, contact_id")
          .eq("organization_id", orgId)
          .eq("channel_session_id", sessao.id)
          .eq("direction", "outbound")
          .gte("sent_at", desde)
          .order("sent_at", { ascending: false })
          .limit(LIMITE)
      : Promise.resolve({ data: [] }),
    admin
      .from("opa_avisos")
      .select("id, user_id, tipo, status, created_at, crm_leads(title)")
      .eq("organization_id", orgId)
      .in("status", ["falhou", "sem_numero"])
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const mensagens = (mensagensRaw ?? []) as Array<{
    id: string;
    body: string | null;
    status: string;
    sent_at: string;
    sent_by_user_id: string | null;
    error_message: string | null;
    delivered_at: string | null;
    read_at: string | null;
    contact_id: string;
  }>;

  const contatoIds = [...new Set(mensagens.map((m) => m.contact_id))];
  const { data: contatosRaw } = contatoIds.length
    ? await admin.from("contacts").select("id, name, phone_number").eq("organization_id", orgId).in("id", contatoIds)
    : { data: [] };
  const contatos = new Map(((contatosRaw ?? []) as Array<{ id: string; name: string | null; phone_number: string | null }>).map((c) => [c.id, c]));

  // De quem é cada número: o WhatsApp que a pessoa conectou no CRM.
  const pessoaPorChave = new Map<string, Pessoa>();
  for (const [userId, telefone] of canal.telefonePorPessoa) {
    const chave = chaveTelefone(telefone);
    const pessoa = equipe.get(userId);
    if (chave && pessoa) pessoaPorChave.set(chave, pessoa);
  }

  const todas: Linha[] = mensagens.map((m) => {
    const contato = contatos.get(m.contact_id);
    const chave = chaveTelefone(contato?.phone_number) ?? `contato:${m.contact_id}`;
    const pessoa = pessoaPorChave.get(chave);
    const tipo = tipoDoTexto(m.body, Boolean(m.sent_by_user_id));
    return {
      id: m.id,
      em: m.sent_at,
      paraChave: pessoa?.id ?? chave,
      paraNome: pessoa ? primeiroNome(pessoa.nome) : (telefoneLegivel(contato?.phone_number) ?? contato?.name ?? "Número sem nome"),
      paraFoto: pessoa?.foto ?? null,
      tipo,
      texto: textoVisivel(tipo, m.body),
      situacao: situacaoDaMensagem(m),
      erro: m.status === "failed" ? m.error_message : null,
      por: m.sent_by_user_id ? primeiroNome(equipe.get(m.sent_by_user_id)?.nome ?? "alguém que saiu da equipe") : null,
    };
  });

  // Quem recebeu no período, do que mais recebeu ao que menos recebeu.
  const destinatarios = [...todas.reduce((mapa, m) => mapa.set(m.paraChave, { nome: m.paraNome, foto: m.paraFoto, n: (mapa.get(m.paraChave)?.n ?? 0) + 1 }), new Map<string, { nome: string; foto: string | null; n: number }>())]
    .map(([chave, d]) => ({ chave, ...d }))
    .sort((a, b) => b.n - a.n);
  const filtro = para && destinatarios.some((d) => d.chave === para) ? para : null;
  const linhas = filtro ? todas.filter((m) => m.paraChave === filtro) : todas;
  const grupos = agruparPorDia(linhas, agora);

  const naoSairam = ((avisosRaw ?? []) as unknown as Array<{ id: string; user_id: string | null; tipo: string; status: string; created_at: string; crm_leads: { title: string } | null }>).filter(
    (a) => !filtro || a.user_id === filtro,
  );

  const link = (p: { dias?: number; para?: string | null }) => {
    const q = new URLSearchParams({ aba: "enviados" });
    const d = p.dias ?? dias;
    if (d !== 7) q.set("dias", String(d));
    const quem = p.para === undefined ? filtro : p.para;
    if (quem) q.set("para", quem);
    return `/app/lembretes?${q.toString()}`;
  };

  const conectado = String(sessao?.status ?? "").toUpperCase() === "WORKING";
  const emTeste = config.avisos.teste.length > 0;
  const paraAviso = [...equipe.values()]
    .map((p) => ({ id: p.id, nome: p.nome, foto: p.foto, iniciais: p.iniciais, temNumero: canal.telefonePorPessoa.has(p.id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <Cartao bloco>
        <TituloBloco
          icone={WhatsappLogo}
          tom="ok"
          titulo="O que o OPA Lembretes mandou"
          sub={
            linhas.length === 0
              ? "Nenhuma mensagem no período"
              : `${linhas.length} ${linhas.length === 1 ? "mensagem" : "mensagens"}${filtro ? "" : ` para ${destinatarios.length} ${destinatarios.length === 1 ? "pessoa" : "pessoas"}`}`
          }
          acao={<MandarAviso pessoas={paraAviso} conectado={conectado} emTeste={emTeste} />}
        />

        {(!conectado || emTeste) && (
          <p className="mt-4 flex items-start gap-2 rounded-[16px] bg-[#fdf1dc] px-4 py-3 text-[13px] leading-snug text-[#9a5b00]">
            <Warning className="mt-0.5 size-4 shrink-0" />
            {!conectado
              ? "O OPA Lembretes está desconectado: nenhum aviso sai até religar em Conexões."
              : "O OPA Lembretes está em modo de teste: só os números de teste recebem."}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AbasPilula className="bg-[#f2f6f9] shadow-none" itens={PERIODOS.map(([d, r]) => ({ href: link({ dias: d }), rotulo: r, ativo: dias === d }))} />
        </div>

        {destinatarios.length > 1 && (
          <nav aria-label="Filtrar por pessoa" className="mt-3 flex flex-wrap gap-2">
            <Link
              href={link({ para: null })}
              aria-current={!filtro ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors",
                !filtro ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#0a2d40] hover:bg-[#e7f0f5]",
              )}
            >
              Todos <span className="tabular-nums opacity-70">{todas.length}</span>
            </Link>
            {destinatarios.map((d) => (
              <Link
                key={d.chave}
                href={link({ para: d.chave })}
                aria-current={filtro === d.chave ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-4 text-[13px] font-semibold transition-colors",
                  filtro === d.chave ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#0a2d40] hover:bg-[#e7f0f5]",
                )}
              >
                <Avatar texto={iniciaisDe(d.nome)} foto={d.foto} className="size-8" />
                {d.nome} <span className="tabular-nums opacity-70">{d.n}</span>
              </Link>
            ))}
          </nav>
        )}

        {linhas.length === 0 ? (
          <Vazio titulo="Nada foi enviado neste período" texto="Quando o OPA Lembretes mandar um aviso, ele aparece aqui com a hora e para quem foi." />
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            {grupos.map((g) => (
              <section key={g.dia}>
                <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5b7284]">
                  {g.titulo} <span className="font-medium normal-case tracking-normal tabular-nums">{g.itens.length}</span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {g.itens.slice(0, LINHAS_POR_DIA).map((m) => (
                    <LinhaEnviada key={m.id} m={m} />
                  ))}
                </ul>
                {g.itens.length > LINHAS_POR_DIA && (
                  <details className="group/mais mt-2">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-[#2a7ca8] [&::-webkit-details-marker]:hidden">
                      Ver mais {g.itens.length - LINHAS_POR_DIA}
                      <CaretDown className="size-4 transition-transform group-open/mais:rotate-180" aria-hidden />
                    </summary>
                    <ul className="mt-2 flex flex-col gap-2">
                      {g.itens.slice(LINHAS_POR_DIA).map((m) => (
                        <LinhaEnviada key={m.id} m={m} />
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            ))}
          </div>
        )}

        {mensagens.length >= LIMITE && (
          <p className="mt-5 flex items-start gap-2 text-[13px] text-[#5b7284]">
            <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" />
            Mostrando as {LIMITE} mais recentes. Escolha um período menor para ver tudo.
          </p>
        )}
      </Cartao>

      {naoSairam.length > 0 && (
        <Cartao>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <TituloBloco
                icone={Warning}
                tom="aviso"
                titulo={`${naoSairam.length} ${naoSairam.length === 1 ? "aviso não saiu" : "avisos não saíram"}`}
                sub="O CRM tentou mandar e não conseguiu. Nenhum é reenviado depois"
              />
              <CaretDown className="size-5 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="mt-4 flex flex-col gap-2">
              {naoSairam.map((a) => {
                const pessoa = a.user_id ? equipe.get(a.user_id) : undefined;
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-[18px] bg-[#fdf8ee] px-3 py-3">
                    <Avatar texto={pessoa ? iniciaisDe(pessoa.nome) : "?"} foto={pessoa?.foto} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[#0a2d40]">
                        {rotuloDoAviso(a.tipo)} para {pessoa ? primeiroNome(pessoa.nome) : "a gestão"}
                      </span>
                      <span className="block truncate text-[13px] text-[#5b7284]">
                        {a.crm_leads?.title ? `${a.crm_leads.title.split(" · ")[0]} · ` : ""}
                        {motivoDoAviso(a.status)}
                      </span>
                    </span>
                    <time dateTime={a.created_at} className="shrink-0 text-right text-[12px] leading-tight tabular-nums text-[#5b7284]">
                      {new Date(a.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}
                      <br />
                      {hora(a.created_at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </details>
        </Cartao>
      )}
    </div>
  );
}
