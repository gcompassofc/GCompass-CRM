/**
 * Início por papel, mescla do protótipo "Telas por permissão" (artifact de
 * 30/10/2026, revisado pelo Allyson em 31/10):
 *  - corretor: só o dia dele (atalhos, quem responder primeiro, fila, visitas, o que a IA anotou);
 *  - gerente: quem precisa de ajuda agora e como cada corretor está;
 *  - administrador: o mesmo do gerente mais a saúde do sistema.
 * Cores de situação do protótipo: laranja atrasado, verde em dia, azul novo.
 */
import Link from "next/link";

import { listarNumerosDaEquipe } from "@/lib/channels/numeros";
import { carregarConfig } from "@/lib/opa/config";
import { CAMPOS, type CampoCopiloto } from "@/lib/opa/copiloto";
import {
  COMISSAO_OPA,
  diagnosticoCompleto,
  prazoDoLead,
  primeiroNome,
  ROTULO_ORIGEM,
  tempoCurto,
  type LeadOpa,
  type Pessoa,
  type Venda,
} from "@/lib/opa/dados";
import { precoCompacto, precoPrincipal, type Imovel } from "@/lib/opa/imoveis";
import { carregarNumerosDoInicio } from "@/lib/opa/inicio";
import { diaSP, inicioDoDia, somarDias, type Periodo } from "@/lib/opa/periodo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowSquareOut,
  Bell,
  Buildings,
  CalendarBlank,
  ChatCircle,
  Check,
  CheckCircle,
  Clock,
  Coins,
  FileText,
  Fire,
  Funnel,
  MapPin,
  Phone,
  Sparkle,
  Target,
  UserPlus,
  UsersThree,
  Warning,
  WhatsappLogo,
  WifiSlash,
  X,
} from "@/lib/ui/icons";

import { BotaoEnvio, FormComRetorno } from "../_opa/form-com-retorno";
import { confirmarSugestao, descartarSugestao } from "../leads/actions";
import { FotoImovel } from "../_opa/componentes";
import { IlustraAgenda, IlustraCalma } from "../_opa/ilustracoes";
import { Avatar, BarraHachurada, Cartao, CartaoNumero, Chip, TituloBloco, Vazio, iniciaisDe, type Icone } from "../_opa/ui";

const META_RESPOSTA = 90;

/** Próximo passo útil: o "Responder agora" das regras repete a pílula de atraso. */
function passoUtil(l: LeadOpa): string | null {
  const p = l.copiloto.proximoPasso;
  return p && !/^Responder agora/i.test(p) ? p : null;
}
const DIA_MS = 86_400_000;

export const foraDoPrazo = (l: LeadOpa) => (l.conversa?.esperandoMin ?? 0) > prazoDoLead(l);

function esperando(leads: LeadOpa[]): LeadOpa[] {
  return leads
    .filter((l) => l.conversa?.esperandoMin != null)
    .sort((a, b) => (b.conversa!.esperandoMin ?? 0) - (a.conversa!.esperandoMin ?? 0));
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Pílula de situação: atrasado (laranja), em dia (verde), novo (azul), neutro. */
function Situacao({ tom, icone: I, children }: { tom: "urgente" | "ok" | "novo" | "neutro"; icone: Icone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold",
        tom === "urgente" && "bg-[#fdeee3] text-[#a4410e]",
        tom === "ok" && "bg-[#e5f3ea] text-[#1d6b43]",
        tom === "novo" && "bg-[#e3eff6] text-[#12455f]",
        tom === "neutro" && "bg-[#f2f8fb] text-[#5b7284]",
      )}
    >
      <I className="size-3.5" weight="bold" /> {children}
    </span>
  );
}

/** Atalho do topo: número grande, rótulo e uma linha de contexto. */
function Atalho({
  href,
  icone: I,
  valor,
  rotulo,
  contexto,
  urgente,
}: {
  href: string;
  icone: Icone;
  valor: string | number;
  rotulo: string;
  contexto: string;
  urgente?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-2 rounded-[24px] p-4 transition-colors",
        urgente ? "bg-[#fdeee3] text-[#a4410e] hover:bg-[#fbe3d2]" : "bg-white text-[#12455f] hover:bg-[#f2f8fb]",
      )}
    >
      <span className="flex items-center justify-between">
        <span className={cn("flex size-9 items-center justify-center rounded-full", urgente ? "bg-[#f8d6bd]" : "bg-[#e3eff6]")}>
          <I className="size-[18px]" />
        </span>
        <span className="text-[28px] font-semibold leading-none tracking-[-0.03em]">{valor}</span>
      </span>
      <span>
        <span className="block text-[14px] font-semibold">{rotulo}</span>
        <span className={cn("block text-[12px]", urgente ? "text-[#a4410e]/80" : "text-[#5b7284]")}>{contexto}</span>
      </span>
    </Link>
  );
}

/** O que o cliente procura, em chips curtos, a partir dos campos confirmados. */
function chipsDoPerfil(l: LeadOpa): string[] {
  const c = l.campos;
  return [c.finalidade, c.regiao?.replace(/\s*\(.*\)$/, ""), c.faixa, c.inegociavel, c.estilo_vida, c.quem_decide]
    .filter((v): v is string => Boolean(v))
    .slice(0, 5);
}

// ---------------------------------------------------------------- corretor

export async function VisaoCorretor({
  leads,
  porCodigo,
  orgId,
  userId,
  filtro,
}: {
  leads: LeadOpa[];
  porCodigo: Map<string, Imovel>;
  orgId: string;
  userId: string;
  filtro: "todos" | "atrasados" | "novos";
}) {
  const fila = esperando(leads);
  const atrasados = fila.filter(foraDoPrazo);
  const primeiro = fila[0];
  const supabase = await createClient();

  const agora = new Date().getTime();
  const hoje = diaSP(agora);
  const inicio = new Date(inicioDoDia(hoje)).toISOString();
  const fim = new Date(inicioDoDia(somarDias(hoje, 1))).toISOString();
  // "No prazo na semana": os sete dias até hoje, contando o prazo e o horário de atendimento de Configurações.
  const deSemana = inicioDoDia(somarDias(hoje, -6));
  const ateSemana = inicioDoDia(somarDias(hoje, 1));

  const [{ data: visitasRaw }, { count: lembretes }, { data: sugRaw }, config] = await Promise.all([
    supabase
      .from("visitas")
      .select("id, quando, imovel_codigo, lead_id")
      .eq("organization_id", orgId)
      .eq("status", "agendada")
      .gte("quando", inicio)
      .lt("quando", fim)
      .order("quando")
      .limit(8),
    supabase
      .from("lembretes_agendados")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("para_user_id", userId)
      .eq("status", "pendente"),
    supabase
      .from("copiloto_sugestoes")
      .select("id, lead_id, campo, valor")
      .eq("organization_id", orgId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(4),
    carregarConfig(supabase, orgId),
  ]);
  const { avaliados, noPrazo } = await carregarNumerosDoInicio(
    orgId,
    { de: deSemana, ate: ateSemana, anterior: { de: deSemana - (ateSemana - deSemana), ate: deSemana } },
    config,
    { corretor: userId },
  );
  const visitas = (visitasRaw ?? []) as Array<{ id: string; quando: string; imovel_codigo: string | null; lead_id: string }>;
  const porId = new Map(leads.map((l) => [l.id, l]));
  const sugestoes = ((sugRaw ?? []) as Array<{ id: string; lead_id: string; campo: string; valor: string }>).filter((s) => porId.has(s.lead_id));

  // Fila de hoje: quem espera (menos o do destaque) e os novos ainda sem conversa.
  const novo = (l: LeadOpa) => l.etapa.slug === "lead-recebido" || agora - Date.parse(l.criadoEm) < DIA_MS;
  const base = [
    ...fila.filter((l) => l.id !== primeiro?.id),
    ...leads.filter((l) => l.conversa?.esperandoMin == null && l.etapa.slug === "lead-recebido"),
  ];
  const lista = base.filter((l) => (filtro === "atrasados" ? foraDoPrazo(l) : filtro === "novos" ? novo(l) : true)).slice(0, 6);
  const contagem = { todos: base.length, atrasados: base.filter(foraDoPrazo).length, novos: base.filter(novo).length };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Atalho
          href="/app/fila"
          icone={ChatCircle}
          valor={fila.length}
          rotulo="Responder agora"
          contexto={atrasados.length ? `${atrasados.length} passou do prazo` : "todos no prazo"}
          urgente={atrasados.length > 0}
        />
        <Atalho
          href="/app/lembretes"
          icone={CalendarBlank}
          valor={visitas.length}
          rotulo="Visitas hoje"
          contexto={visitas[0] ? `a próxima às ${hora(visitas[0].quando)}` : "nenhuma marcada"}
        />
        <Atalho href="/app/lembretes" icone={Bell} valor={lembretes ?? 0} rotulo="Lembretes" contexto="para conferir" />
        <Atalho
          href="/app/fila"
          icone={Target}
          valor={avaliados ? `${noPrazo} de ${avaliados}` : "0"}
          rotulo="No prazo na semana"
          contexto={`meta: ${META_RESPOSTA}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="flex flex-col gap-5 lg:col-span-8">
          {primeiro ? (
            <ResponderPrimeiro lead={primeiro} imovel={porCodigo.get(primeiro.imovelCodigo ?? "")} />
          ) : (
            <Cartao bloco>
              <Vazio ilustracao={<IlustraCalma />} titulo="Ninguém esperando resposta" texto="Quando um lead escrever, ele aparece aqui primeiro." />
            </Cartao>
          )}

          <Cartao bloco tour="hoje-fila">
            <TituloBloco
              icone={UsersThree}
              titulo="Sua fila de hoje"
              acao={
                <Link href="/app/fila" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2a7ca8]">
                  Ver a fila toda <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todos", contagem.todos],
                  ["atrasados", "Atrasados", contagem.atrasados],
                  ["novos", "Novos", contagem.novos],
                ] as const
              ).map(([k, r, n]) => (
                <Link
                  key={k}
                  href={k === "todos" ? "/app/hoje" : `/app/hoje?fila=${k}`}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold",
                    filtro === k ? "bg-[#12455f] text-white" : "bg-[#f2f8fb] text-[#12455f] hover:bg-[#e3eff6]",
                  )}
                >
                  {r} · {n}
                </Link>
              ))}
            </div>
            <ul className="mt-3 flex flex-col">
              {lista.map((l) => {
                const atrasado = foraDoPrazo(l);
                const im = porCodigo.get(l.imovelCodigo ?? "");
                return (
                  <li key={l.id}>
                    <Link href={`/app/leads/${l.id}`} className="flex items-center gap-3 rounded-[20px] px-2 py-3 hover:bg-[#f2f8fb]">
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                          atrasado ? "bg-[#fdeee3] text-[#a4410e]" : "bg-[#e3eff6] text-[#12455f]",
                        )}
                      >
                        {iniciaisDe(l.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-[#0a2d40]">{l.nome}</span>
                        <span className="block truncate text-[13px] text-[#5b7284]">
                          {passoUtil(l) ?? (l.conversa?.previa ? `“${l.conversa.previa}”` : im ? `${im.codigo} · ${im.titulo}` : "Responder e entender o momento")}
                        </span>
                      </span>
                      {atrasado ? (
                        <Situacao tom="urgente" icone={Warning}>
                          Atrasado
                        </Situacao>
                      ) : novo(l) ? (
                        <Situacao tom="novo" icone={Sparkle}>
                          Novo
                        </Situacao>
                      ) : (
                        <Situacao tom="neutro" icone={Clock}>
                          {l.conversa?.esperandoMin != null ? tempoCurto(l.conversa.esperandoMin) : "sem resposta"}
                        </Situacao>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {lista.length === 0 && <Vazio titulo="Nada aqui" texto="Troque o filtro ou abra a fila toda." />}
          </Cartao>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <VisitasDeHoje visitas={visitas} porId={porId} porCodigo={porCodigo} />

          <Cartao bloco tour="hoje-ia">
            <TituloBloco icone={Sparkle} titulo="A IA anotou" sub="Confirme para salvar na ficha" />
            {sugestoes.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {sugestoes.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-[18px] bg-[#f2f8fb] p-3">
                    <Link href={`/app/leads/${s.lead_id}`} className="min-w-0 flex-1 text-[14px] text-[#0a2d40]">
                      <b className="font-semibold">{primeiroNome(porId.get(s.lead_id)?.nome)}</b>
                      <span className="text-[#5b7284]"> · {CAMPOS[s.campo as CampoCopiloto]?.rotulo ?? s.campo}: </span>
                      {s.valor}
                    </Link>
                    <FormComRetorno action={confirmarSugestao} sucesso="Anotado no lead.">
                      <input type="hidden" name="id" value={s.id} />
                      <BotaoEnvio
                        aria-label={`Confirmar: ${s.valor}`}
                        tamanhoIcone="size-4"
                        className="flex size-11 items-center justify-center rounded-full bg-[#12455f] text-white hover:bg-[#0a2d40]"
                      >
                        <Check className="size-4" weight="bold" />
                      </BotaoEnvio>
                    </FormComRetorno>
                    <FormComRetorno action={descartarSugestao} sucesso="Anotação descartada.">
                      <input type="hidden" name="id" value={s.id} />
                      <BotaoEnvio
                        aria-label={`Descartar: ${s.valor}`}
                        className="flex size-11 items-center justify-center rounded-full bg-white text-[#5b7284] hover:bg-[#e3eff6]"
                      >
                        <X className="size-4" weight="bold" />
                      </BotaoEnvio>
                    </FormComRetorno>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio titulo="Nada para confirmar" texto="Quando a IA ler uma conversa, o que ela anotar aparece aqui." />
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}

/** O cartão escuro: quem responder primeiro, com prazo, perfil, dica da IA e o imóvel que viu. */
function ResponderPrimeiro({ lead, imovel }: { lead: LeadOpa; imovel?: Imovel }) {
  const espera = lead.conversa!.esperandoMin!;
  const prazo = prazoDoLead(lead);
  const atrasado = espera > prazo;
  const pct = Math.min(100, Math.round((espera / prazo) * 100));
  const fone = (lead.telefone ?? "").replace(/\D/g, "");
  const chips = chipsDoPerfil(lead);
  const origem = ROTULO_ORIGEM[lead.origem.canal ?? ""] ?? lead.origem.canal;

  return (
    <Cartao escuro bloco className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#8fc4dd]">
          <Fire className="size-4" weight="fill" /> Responda primeiro
        </p>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#f0a35e] px-3 text-[12px] font-semibold text-[#0a2d40]">
          <Clock className="size-3.5" weight="bold" /> esperando há {tempoCurto(espera)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_220px] [&>*]:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#12455f] text-[16px] font-semibold">
              {iniciaisDe(lead.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[26px] font-semibold leading-tight tracking-[-0.03em]">{lead.nome}</p>
              <p className="truncate text-[13px] text-[#8fc4dd]">{origem ? `Veio por ${origem}` : "Origem não informada"}</p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex justify-between gap-2 text-[12px] text-[#8fc4dd]">
              <span>Prazo de resposta: {tempoCurto(prazo)}</span>
              <span className="font-semibold text-[#f0a35e]">{atrasado ? `passou ${tempoCurto(espera - prazo)}` : `faltam ${tempoCurto(prazo - espera)}`}</span>
            </div>
            <div className="h-2 rounded-full bg-[#12455f]">
              <div className="h-2 rounded-full bg-[#f0a35e]" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
          </div>

          {lead.conversa?.previa && <p className="line-clamp-3 text-[16px] font-light leading-relaxed text-white/90">“{lead.conversa.previa}”</p>}

          {chips.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] text-[#8fc4dd]">O que procura</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span key={c} className="rounded-full bg-[#12455f] px-3 py-1 text-[13px]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {passoUtil(lead) && (
            <div className="rounded-[18px] bg-[#12455f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#8fc4dd]">
                <Sparkle className="size-3.5" weight="fill" /> Dica do copiloto
              </p>
              <p className="mt-1 text-[14px] leading-relaxed">{passoUtil(lead)}</p>
            </div>
          )}
        </div>

        {imovel && (
          <div className="flex flex-col gap-2 rounded-[20px] bg-[#12455f] p-3">
            <FotoImovel imovel={imovel} className="aspect-[16/10] h-auto max-h-48 w-full rounded-[14px]" />
            <p className="text-[12px] text-[#8fc4dd]">Imóvel que viu</p>
            <p className="line-clamp-2 text-[14px] font-semibold">{imovel.titulo}</p>
            <p className="text-[13px] text-white/75">
              {imovel.codigo} · {precoPrincipal(imovel)}
            </p>
            {imovel.url_site && (
              <a href={imovel.url_site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#8fc4dd]">
                Ver o anúncio <ArrowSquareOut className="size-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Responde ali mesmo, no Multi-atendimento: sem conversa ainda, a rota abre uma. */}
        <Link
          href={`/app/leads/${lead.id}/conversa`}
          prefetch={false}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#12455f] hover:bg-[#e3eff6]"
        >
          <WhatsappLogo weight="fill" className="size-5" /> {lead.conversa?.id ? "Abrir conversa" : "Começar conversa"}
        </Link>
        {fone ? (
          <a
            href={`tel:+${fone}`}
            aria-label={`Ligar para ${lead.nome}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#8fc4dd] px-5 text-[15px] font-medium text-white hover:bg-white/10"
          >
            <Phone className="size-5" /> Ligar
          </a>
        ) : null}
        <Link
          href={`/app/leads/${lead.id}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#8fc4dd] px-5 text-[15px] font-medium text-white hover:bg-white/10"
        >
          <FileText className="size-5" /> Abrir ficha
        </Link>
      </div>
    </Cartao>
  );
}

function VisitasDeHoje({
  visitas,
  porId,
  porCodigo,
}: {
  visitas: Array<{ id: string; quando: string; imovel_codigo: string | null; lead_id: string }>;
  porId: Map<string, LeadOpa>;
  porCodigo: Map<string, Imovel>;
}) {
  // Rota do dia pelos bairros (o cadastro dos imóveis ainda não tem endereço).
  const paradas = visitas
    .map((v) => porCodigo.get(v.imovel_codigo ?? "")?.bairro)
    .filter((b): b is string => Boolean(b))
    .map((b) => `${b}, Ilhabela, SP`);
  const rota =
    paradas.length > 0
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(paradas.at(-1)!)}${
          paradas.length > 1 ? `&waypoints=${encodeURIComponent(paradas.slice(0, -1).join("|"))}` : ""
        }`
      : null;

  return (
    <Cartao bloco tour="hoje-visitas">
      <TituloBloco icone={CalendarBlank} titulo="Visitas de hoje" />
      {visitas.length > 0 ? (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {visitas.map((v) => {
              const im = porCodigo.get(v.imovel_codigo ?? "");
              return (
                <li key={v.id}>
                  <Link href={`/app/leads/${v.lead_id}?aba=visitas`} className="flex items-center gap-3 rounded-[18px] p-1 hover:bg-[#f2f8fb]">
                    <span className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-[16px] bg-[#12455f] text-white">
                      <span className="text-[16px] font-semibold">{hora(v.quando)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[#0a2d40]">{porId.get(v.lead_id)?.nome ?? "Cliente"}</span>
                      <span className="flex items-center gap-1 truncate text-[13px] text-[#5b7284]">
                        <MapPin className="size-3.5 shrink-0" />
                        {[im?.bairro, v.imovel_codigo].filter(Boolean).join(" · ") || "Imóvel a definir"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 rounded-[14px] bg-[#f2f8fb] px-3 py-2.5 text-[13px] text-[#12455f]">
            Cliente vindo do continente: conte com a fila da balsa no horário.
          </p>
          {rota && (
            <a
              href={rota}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#12455f] text-[14px] font-semibold text-white hover:bg-[#0a2d40]"
            >
              <MapPin className="size-4" /> Abrir a rota do dia
            </a>
          )}
        </>
      ) : (
        <Vazio ilustracao={<IlustraAgenda />} titulo="Nenhuma visita hoje" texto="Agende pela ficha do lead ou pelo botão Visita." />
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------- gestor

export async function VisaoGestor({
  leads,
  equipe,
  vendas,
  periodo,
  veReceita,
  admin,
  orgId,
  corretor,
}: {
  leads: LeadOpa[];
  equipe: Map<string, Pessoa>;
  vendas: Venda[];
  periodo: Periodo;
  veReceita: boolean;
  admin: boolean;
  orgId: string;
  /** "?corretor=": gestor vendo a operação de uma pessoa. */
  corretor?: string | null;
}) {
  const supabase = await createClient();
  const fila = esperando(leads);
  const atrasados = fila.filter(foraDoPrazo);
  const semDono = leads.filter((l) => !l.donoId);

  const hoje = diaSP(new Date().getTime());
  const inicioHoje = new Date(inicioDoDia(hoje)).toISOString();
  const fimHoje = new Date(inicioDoDia(somarDias(hoje, 1))).toISOString();

  const config = await carregarConfig(supabase, orgId);
  const [numeros, sessoes, { count: visitasAgendadas }, { count: visitasHoje }] = await Promise.all([
    // Leads novos de todos os status e a primeira resposta por lead (lib/opa/inicio.ts).
    carregarNumerosDoInicio(orgId, periodo, config, { corretor }),
    listarNumerosDaEquipe(supabase, orgId),
    supabase.from("visitas").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "agendada").gte("quando", inicioHoje),
    supabase
      .from("visitas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "agendada")
      .gte("quando", inicioHoje)
      .lt("quando", fimHoje),
  ]);

  const { novos, novosAntes, avaliados, noPrazo } = numeros;
  const pctPrazo = avaliados ? Math.round((noPrazo / avaliados) * 100) : 0;
  const variacao = novos - novosAntes;
  const comissao = vendas.reduce((s, v) => s + v.comissaoCents, 0);
  const vgvVendido = vendas.reduce((s, v) => s + v.vgvCents, 0);
  const carteira = leads.filter((l) => l.imovelCodigo).reduce((s, l) => s + (l.valorCents ?? 0), 0);
  const emProposta = leads.filter((l) => ["proposta", "negociacao", "fechamento"].includes(l.etapa.slug));
  const pctDiagnostico = leads.length ? Math.round((leads.filter((l) => diagnosticoCompleto(l.campos) === 4).length / leads.length) * 100) : 0;

  const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // O número é de quem é dono dele (owner_user_id); o nome só vale para número antigo sem dono.
  const whatsCaiu = (p: Pessoa) =>
    sessoes.some(
      (s) =>
        s.status !== "WORKING" &&
        (s.owner_user_id ? s.owner_user_id === p.id : Boolean(s.display_name) && semAcento(s.display_name!) === semAcento(p.nome)),
    );
  // Avisos de prazo, repasse e escalada saem todos pelo OPA Lembretes: se ele cai, nada chega.
  const lembretes = sessoes.find((s) => s.waha_session_name === "opa-lembretes");
  const lembretesFora = !lembretes || lembretes.status !== "WORKING";

  const ativosRoleta = config.roleta.filter((id) => !config.roleta_pausados.includes(id));
  const roletaParada = ativosRoleta.length === 0;

  const porCorretor = [...equipe.values()]
    .map((p) => {
      const meus = leads.filter((l) => l.donoId === p.id);
      return {
        pessoa: p,
        total: meus.length,
        esperando: meus.filter((l) => l.conversa?.esperandoMin != null).length,
        atrasados: meus.filter(foraDoPrazo).length,
        diagnostico: meus.length ? Math.round((meus.filter((l) => diagnosticoCompleto(l.campos) === 4).length / meus.length) * 100) : 0,
        caiu: whatsCaiu(p),
      };
    })
    .filter((c) => c.total > 0 || c.caiu)
    .sort((a, b) => b.atrasados - a.atrasados || Number(b.caiu) - Number(a.caiu) || b.esperando - a.esperando);

  const etapas = [...new Map(leads.map((l) => [l.etapa.id, l.etapa])).values()].sort((a, b) => a.posicao - b.posicao);
  const maxEtapa = Math.max(1, ...etapas.map((e) => leads.filter((l) => l.etapa.id === e.id).length));
  const precisa = atrasados.length + semDono.length;

  return (
    <>
      {lembretesFora && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[24px] bg-[#fdf0e6] p-5 text-[#7a3209] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2.5 text-[14px] leading-relaxed">
            <WifiSlash className="mt-0.5 size-5 shrink-0 text-[#c4561a]" />
            <span>
              <strong className="font-semibold">O número OPA Lembretes {lembretes ? "está desconectado" : "ainda não foi ligado"}.</strong> Os avisos de
              prazo, os repasses e as escaladas não estão chegando no WhatsApp da equipe. Acompanhe a Fila por aqui até ele voltar.
            </span>
          </p>
          {admin ? (
            <Link
              href="/app/conexoes"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#7a3209] px-5 text-[14px] font-semibold text-white hover:bg-[#5e2607]"
            >
              Reconectar
            </Link>
          ) : (
            <span className="shrink-0 text-[13px] font-medium">Peça ao administrador para reconectar.</span>
          )}
        </div>
      )}

      {admin && <SaudeDoSistema orgId={orgId} sessoes={sessoes} />}

      {precisa > 0 && (
        <Cartao escuro bloco className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#8fc4dd]">Precisa de você</p>
              <p className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.03em]">
                {atrasados.length > 0 && `${atrasados.length} ${atrasados.length === 1 ? "lead passou" : "leads passaram"} do prazo`}
                {atrasados.length > 0 && semDono.length > 0 && " e "}
                {semDono.length > 0 && `${semDono.length} sem dono`}
              </p>
            </div>
            <Link
              href="/app/fila?aba=esperando"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#12455f] hover:bg-[#e3eff6]"
            >
              Abrir a fila <ArrowRight className="size-4" />
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...atrasados.slice(0, 3), ...semDono.slice(0, 1)].map((l) => {
              const dono = l.donoId ? primeiroNome(equipe.get(l.donoId)?.nome) : null;
              return (
                <li key={l.id}>
                  <Link href={`/app/leads/${l.id}`} className="flex items-center justify-between gap-3 rounded-[18px] bg-[#12455f] px-4 py-3 hover:bg-[#165373]">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{l.nome}</span>
                      <span className="block truncate text-[13px] text-[#8fc4dd]">{dono ? `com ${dono}` : roletaParada ? "sem dono: roleta pausada" : "sem dono"}</span>
                    </span>
                    {l.conversa?.esperandoMin != null && (
                      <span className="shrink-0 rounded-full bg-[#f0a35e] px-2.5 py-1 text-[12px] font-semibold text-[#0a2d40]">
                        {tempoCurto(l.conversa.esperandoMin)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <div data-tour="hoje-numeros" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoNumero
          icone={UserPlus}
          rotulo={`Leads novos · ${["7d", "30d", "90d"].includes(periodo.chave) ? `${periodo.dias} dias` : periodo.rotulo.toLowerCase()}`}
          valor={novos}
          contexto={`${variacao >= 0 ? "+" : ""}${variacao} contra o período anterior`}
          href="/app/leads"
        />
        <CartaoNumero
          icone={Target}
          rotulo="Respondidos no prazo"
          valor={`${pctPrazo}%`}
          alerta={avaliados > 0 && pctPrazo < META_RESPOSTA}
          contexto={`meta ${META_RESPOSTA}% · ${noPrazo} de ${avaliados}`}
        />
        {admin ? (
          <CartaoNumero
            icone={Buildings}
            rotulo="VGV em carteira"
            valor={precoCompacto(carteira)}
            contexto={`${emProposta.length} em proposta${veReceita ? ` · ${precoCompacto(Math.round(carteira * COMISSAO_OPA))} de comissão potencial` : ""}`}
          />
        ) : (
          <CartaoNumero
            icone={CalendarBlank}
            rotulo="Visitas agendadas"
            valor={visitasAgendadas ?? 0}
            contexto={visitasHoje ? `${visitasHoje} hoje` : "nenhuma hoje"}
            href="/app/pipeline"
          />
        )}
        {veReceita ? (
          <CartaoNumero
            icone={Coins}
            rotulo="Comissão no período"
            valor={precoCompacto(comissao)}
            contexto={`${vendas.length} ${vendas.length === 1 ? "venda" : "vendas"} · VGV ${precoCompacto(vgvVendido)}`}
          />
        ) : (
          <CartaoNumero icone={Funnel} rotulo="Diagnóstico completo" valor={`${pctDiagnostico}%`} contexto="finalidade, região, momento e inegociável" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <Cartao bloco className="lg:col-span-7">
          <TituloBloco icone={UsersThree} titulo="Equipe agora" sub="Quem está segurando a fila" />
          <div className="mt-4 hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_70px_90px_70px] gap-3 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[#5b7284] md:grid">
            <span>Corretor</span>
            <span>Situação</span>
            <span className="text-right">Esperando</span>
            <span className="text-right">Diagnóstico</span>
            <span />
          </div>
          <ul className="mt-1 flex flex-col">
            {porCorretor.map((c) => (
              <li
                key={c.pessoa.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[#e2edf3] px-1 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_70px_90px_70px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar texto={c.pessoa.iniciais} foto={c.pessoa.foto} />
                  <span className="truncate text-[15px] font-semibold text-[#0a2d40]">{c.pessoa.nome}</span>
                </span>
                <span>
                  {c.atrasados > 0 ? (
                    <Situacao tom="urgente" icone={Warning}>
                      {c.atrasados} {c.atrasados === 1 ? "atrasado" : "atrasados"}
                    </Situacao>
                  ) : c.caiu ? (
                    <Situacao tom="urgente" icone={WifiSlash}>
                      WhatsApp caiu
                    </Situacao>
                  ) : (
                    <Situacao tom="ok" icone={CheckCircle}>
                      Em dia
                    </Situacao>
                  )}
                </span>
                <span className="hidden text-right text-[15px] tabular-nums text-[#0a2d40] md:block">{c.esperando}</span>
                <span className="hidden text-right text-[15px] tabular-nums text-[#0a2d40] md:block">{c.diagnostico}%</span>
                <Link href={`/app/fila?corretor=${c.pessoa.id}`} className="hidden text-right text-[13px] font-semibold text-[#2a7ca8] md:block">
                  Ver fila
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>

        <div className="flex flex-col gap-5 lg:col-span-5">
          {roletaParada && (
            <Cartao bloco className="flex items-start gap-3 bg-[#fdeee3]">
              <Warning className="mt-0.5 size-5 shrink-0 text-[#a4410e]" weight="fill" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[#a4410e]">{config.roleta.length ? "Roleta pausada" : "Roleta vazia"}</p>
                <p className="text-[13px] text-[#a4410e]/85">Lead novo do site e do anúncio fica sem dono até alguém entrar na roleta.</p>
              </div>
              <Link href="/app/configuracoes" className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#a4410e] px-4 text-[13px] font-semibold text-white">
                Ajustar
              </Link>
            </Cartao>
          )}
          <Cartao bloco>
            <TituloBloco
              icone={Funnel}
              titulo="Funil de compradores"
              acao={
                <Link href="/app/pipeline" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2a7ca8]">
                  Abrir <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <ul className="mt-5 flex flex-col gap-3">
              {etapas.map((e) => {
                const n = leads.filter((l) => l.etapa.id === e.id).length;
                return (
                  <li key={e.id} className="grid grid-cols-[120px_1fr_28px] items-center gap-3 text-[13px]">
                    <span className="truncate text-[#34566b]">{e.nome}</span>
                    <BarraHachurada pct={(n / maxEtapa) * 100} />
                    <span className="text-right tabular-nums text-[#0a2d40]">{n}</span>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </div>
      </div>
    </>
  );
}

/** Só administrador: o que está funcionando, com problema ou por configurar. */
async function SaudeDoSistema({ orgId, sessoes }: { orgId: string; sessoes: Array<{ display_name: string | null; status: string }> }) {
  const supabase = await createClient();
  const [{ data: ultimo }, { count: metaFila }, { count: semCifra }] = await Promise.all([
    supabase.from("crm_leads").select("created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("eventos_meta").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "na_fila"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).is("cifrado_em", null),
  ]);
  const nomeadas = sessoes.filter((s) => s.display_name);
  const ligados = nomeadas.filter((s) => s.status === "WORKING");
  const caidos = nomeadas.filter((s) => s.status !== "WORKING").map((s) => primeiroNome(s.display_name));
  const minDesde = ultimo ? Math.round((new Date().getTime() - Date.parse((ultimo as { created_at: string }).created_at)) / 60_000) : null;

  type Linha = { nome: string; texto: string; estado: "ok" | "problema" | "configurar"; acao?: { href: string; rotulo: string } };
  const linhas: Linha[] = [
    {
      nome: "WhatsApp",
      texto: nomeadas.length
        ? `${ligados.length} de ${nomeadas.length} números ligados.${caidos.length ? ` Caiu: ${caidos.join(", ")}.` : ""}`
        : "Nenhum número conectado.",
      estado: !nomeadas.length ? "configurar" : caidos.length ? "problema" : "ok",
      acao: caidos.length || !nomeadas.length ? { href: "/app/conexoes", rotulo: "Reconectar" } : undefined,
    },
    {
      nome: "Leads chegando",
      texto: minDesde == null ? "Nenhum lead ainda." : `Último lead há ${tempoCurto(Math.max(0, minDesde))}.`,
      estado: minDesde == null ? "configurar" : "ok",
    },
    {
      nome: "Conversões para o Meta",
      texto: metaFila ? `${metaFila} na fila. O envio liga com o Pixel e o token da OPA.` : "Nada na fila.",
      estado: metaFila ? "configurar" : "ok",
    },
    {
      nome: "Dados pessoais cifrados",
      texto: semCifra ? `${semCifra} contatos esperando a cifra.` : "Em dia.",
      estado: semCifra && semCifra > 50 ? "problema" : "ok",
    },
  ];
  const conta = (e: Linha["estado"]) => linhas.filter((l) => l.estado === e).length;

  return (
    <Cartao bloco>
      <TituloBloco
        icone={CheckCircle}
        titulo="Saúde do sistema"
        acao={
          <span className="flex flex-wrap gap-1.5">
            <Chip tom="ok">{conta("ok")} ok</Chip>
            {conta("problema") > 0 && <Chip tom="alerta">{conta("problema")} com problema</Chip>}
            {conta("configurar") > 0 && <Chip tom="neutro">{conta("configurar")} a configurar</Chip>}
          </span>
        }
      />
      <ul className="mt-3 grid gap-x-6 md:grid-cols-2">
        {linhas.map((l) => (
          <li key={l.nome} className="flex items-center justify-between gap-3 border-t border-[#e2edf3] py-3">
            <span className="flex min-w-0 items-start gap-2.5">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full",
                  l.estado === "ok" ? "bg-[#1d6b43]" : l.estado === "problema" ? "bg-[#e07b2e]" : "bg-[#8fc4dd]",
                )}
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-[#0a2d40]">{l.nome}</span>
                <span className="block text-[13px] text-[#5b7284]">{l.texto}</span>
              </span>
            </span>
            {l.acao && (
              <Link href={l.acao.href} className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#f2f8fb] px-4 text-[13px] font-semibold text-[#12455f]">
                {l.acao.rotulo}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
