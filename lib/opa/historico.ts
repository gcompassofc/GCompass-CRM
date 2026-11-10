/**
 * Histórico do lead em português, objetivo e com ícone (pedido do Allyson, 10/11/2026).
 *
 * O que a ficha precisa contar, nesta ordem de importância:
 *   - quando o lead entrou, por onde, e com qual corretor ficou (pelo nome);
 *   - quanto tempo levou a primeira resposta, e de quem foi;
 *   - se não houve resposta e o lead passou adiante: de quem para quem.
 *
 * Antes, a aba mostrava o nome cru do registro ("lead cooled", "reactivation expired")
 * e o repasse saía sem os nomes. Aqui cada registro vira uma frase curta; o que é
 * só medição interna do sistema (negócio "esfriou", sugestão de retomada) fica de fora.
 *
 * Só regra, sem banco e sem import com alias "@/": testável sem Next.
 */

export type TipoHistorico =
  | "entrada"
  | "boas_vindas"
  | "alerta"
  | "resposta"
  | "sem_resposta"
  | "repasse"
  | "escalada"
  | "dono"
  | "voltou"
  | "etapa"
  | "ligacao"
  | "selecao"
  | "venda"
  | "perda"
  | "pessoal"
  | "nome"
  | "conversa_apagada"
  | "atividade";

export interface ItemHistorico {
  em: string;
  tipo: TipoHistorico;
  texto: string;
  /** Segunda linha, mais clara, quando ajuda a entender. */
  detalhe?: string | null;
}

export interface AtividadeDoLead {
  type: string;
  payload: Record<string, unknown> | null;
  performed_at: string;
  reason: string | null;
}

export interface DadosDoHistorico {
  criadoEm: string;
  /** "Formulário do Meta", "Site", "WhatsApp"... (rotuloOrigem da ficha). */
  entrada: string;
  imovelCodigo?: string | null;
  donoAtualId: string | null;
  aberto: boolean;
  atividades: AtividadeDoLead[];
  /** Primeira mensagem do corretor que não é a boas-vindas, quando a conversa ainda existe no CRM. */
  primeiraSaidaEm?: string | null;
  /** Primeiro nome de quem tem este id; quem já saiu vira "alguém que saiu da equipe". */
  nomeDe: (id: string | null | undefined) => string;
  /** Padrão: agora. Os testes fixam para o tempo de espera não mudar. */
  agora?: number;
}

export interface ResumoDoAtendimento {
  entrouEm: string;
  entrada: string;
  /** Com quem o lead ficou ao entrar. */
  primeiroCorretor: string;
  corretorAtual: string;
  /** Primeira resposta: de quem, quando e em quantos minutos de relógio desde que o lead chegou a essa pessoa. */
  resposta: { em: string; quem: string; minutos: number; como: string } | null;
  /** Lead aberto ainda sem resposta: há quantos minutos espera o corretor atual. */
  semRespostaMin: number | null;
  repasses: Array<{ em: string; de: string; para: string }>;
}

/** "8 min", "1 h 5 min", "2 dias". */
export function tempoGasto(min: number): string {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Sem travessão e sem ponto final sobrando: a frase já vem pronta do registro. */
function limpar(frase: string | null | undefined): string {
  return (frase ?? "")
    .replace(/\s[–—]\s/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Medição interna do sistema: não é acontecimento do atendimento e só enchia a aba. */
const SO_MEDICAO = new Set(["lead_cooled", "lead_reactivated", "reactivation_expired", "ai_turn", "lead_do_whatsapp"]);

/** Registros da base do CRM que não têm frase própria aqui. */
const ROTULO_DA_BASE: Record<string, string> = {
  stage_changed: "Mudou de etapa",
  note: "Anotação",
  send_vetoed: "Envio bloqueado",
  handoff_triggered: "Passou para atendimento humano",
  handoff_resolved: "Voltou para o atendimento automático",
  next_action_approved: "Próxima ação aprovada",
  next_action_dismissed: "Próxima ação descartada",
  lead_edited: "Dados do negócio alterados",
  reactivation_accepted: "Retomada de contato aprovada",
  reactivation_dismissed: "Retomada de contato descartada",
  followup_scheduled: "Retorno agendado",
  followup_cancelled: "Retorno cancelado",
  demand_closed: "Negócio encerrado",
};

const COMO_RESPONDEU: Record<string, string> = {
  mensagem: "por mensagem no WhatsApp",
  ligacao: "por ligação",
  respondi: "marcou Respondi no CRM",
};

const texto = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

export function montarHistorico(d: DadosDoHistorico): { itens: ItemHistorico[]; resumo: ResumoDoAtendimento } {
  const atividades = [...d.atividades].sort((a, b) => ms(a.performed_at) - ms(b.performed_at));
  const criado = ms(d.criadoEm);
  const agora = d.agora ?? Date.now();

  // Trocas de corretor, em ordem: repasse da roleta e troca por saída de alguém da equipe.
  const trocas = atividades
    .filter((a) => (a.type === "lead_repassado" || a.type === "dono_trocado") && a.payload?.para)
    .map((a) => ({ em: a.performed_at, de: texto(a.payload?.de) || null, para: texto(a.payload?.para), repasse: a.type === "lead_repassado" }));
  const primeiroDonoId = trocas[0]?.de ?? (trocas.length ? null : d.donoAtualId);
  /** Com quem o lead estava num instante, e desde quando. */
  const donoEm = (t: number): { id: string | null; desde: number } => {
    let id = primeiroDonoId;
    let desde = criado;
    for (const tr of trocas) {
      if (ms(tr.em) > t) break;
      id = tr.para;
      desde = ms(tr.em);
    }
    return { id, desde };
  };

  // Primeira resposta: o sinal mais antigo entre mensagem, ligação com contato e "Respondi".
  const sinais: Array<{ em: number; como: string }> = [];
  if (d.primeiraSaidaEm && ms(d.primeiraSaidaEm) >= criado) sinais.push({ em: ms(d.primeiraSaidaEm), como: "mensagem" });
  for (const a of atividades) {
    const t = ms(a.performed_at);
    if (!(t >= criado)) continue;
    if (a.type === "respondido") sinais.push({ em: t, como: "respondi" });
    else if (a.type === "ligacao" && (a.payload?.resultado === "atendeu" || a.payload?.resultado === "retorno")) sinais.push({ em: t, como: "ligacao" });
    else if (a.type === "etapa_automatica" && a.payload?.motivo === "primeira_resposta") sinais.push({ em: t, como: texto(a.payload?.como) || "mensagem" });
  }
  sinais.sort((a, b) => a.em - b.em);
  const primeiro = sinais[0] ?? null;
  const resposta = primeiro
    ? (() => {
        const dono = donoEm(primeiro.em);
        return {
          em: new Date(primeiro.em).toISOString(),
          quem: d.nomeDe(dono.id),
          minutos: Math.max(1, Math.round((primeiro.em - dono.desde) / 60_000)),
          como: COMO_RESPONDEU[primeiro.como] ?? COMO_RESPONDEU.mensagem!,
        };
      })()
    : null;

  const itens: ItemHistorico[] = [
    {
      em: d.criadoEm,
      tipo: "entrada",
      texto: `Entrou por ${d.entrada}${d.imovelCodigo ? `, imóvel ${d.imovelCodigo}` : ""}`,
      detalhe: `Ficou com ${d.nomeDe(primeiroDonoId)}.`,
    },
  ];
  if (resposta) {
    itens.push({ em: resposta.em, tipo: "resposta", texto: `${resposta.quem} respondeu em ${tempoGasto(resposta.minutos)}`, detalhe: `Primeira resposta, ${resposta.como}.` });
  }

  for (const a of atividades) {
    const p = a.payload ?? {};
    const em = a.performed_at;
    const motivo = limpar(a.reason);
    if (SO_MEDICAO.has(a.type)) continue;
    switch (a.type) {
      case "boas_vindas_enviada":
        itens.push({ em, tipo: "boas_vindas", texto: `Boas-vindas enviada pelo WhatsApp de ${texto(p.corretor) || d.nomeDe(donoEm(ms(em)).id)}` });
        break;
      case "boas_vindas_nao_enviada":
        itens.push({ em, tipo: "alerta", texto: "Boas-vindas não saiu", detalhe: limpar(texto(p.motivo)) || motivo || null });
        break;
      case "etapa_automatica":
        // A resposta já tem linha própria; aqui fica só para onde o card foi.
        itens.push({
          em,
          tipo: "etapa",
          texto: `Foi para ${texto(p.para) || "a próxima etapa"}`,
          detalhe: p.motivo === "primeira_resposta" ? "Sozinho, porque o corretor respondeu." : (motivo.split(": ").slice(1).join(": ") || null),
        });
        break;
      case "respondido":
        itens.push({ em, tipo: "atividade", texto: `${d.nomeDe(donoEm(ms(em)).id)} marcou Respondi` });
        break;
      case "ligacao":
        itens.push({
          em,
          tipo: "ligacao",
          texto: `Ligação: ${p.resultado === "atendeu" ? "atendeu" : p.resultado === "retorno" ? "pediu retorno" : "não atendeu"}`,
        });
        break;
      case "lead_repassado":
        itens.push({
          em,
          tipo: "repasse",
          texto: `Passou de ${d.nomeDe(texto(p.de))} para ${d.nomeDe(texto(p.para))}`,
          detalhe: `Sem resposta em ${tempoGasto(Number(p.prazoMin) || Number(p.esperaMin) || 60)}: foi para o próximo da roleta.`,
        });
        break;
      case "dono_trocado":
        itens.push({ em, tipo: "dono", texto: `Passou de ${d.nomeDe(texto(p.de))} para ${d.nomeDe(texto(p.para))}`, detalhe: motivo || null });
        break;
      case "lead_escalado":
        itens.push({ em, tipo: "escalada", texto: "Passou do prazo sem resposta e foi para a gestão decidir", detalhe: motivo || null });
        break;
      case "lead_voltou":
        itens.push({
          em,
          tipo: "voltou",
          texto: `Voltou por outro formulário (${Number(p.vez) || 2}ª vez)`,
          detalhe: `Continuou com ${d.nomeDe(donoEm(ms(em)).id)}, sem roleta.`,
        });
        break;
      case "selecao_enviada":
        itens.push({
          em,
          tipo: "selecao",
          texto: "Seleção de imóveis enviada pelo WhatsApp",
          detalhe: Array.isArray(p.imoveis) && p.imoveis.length ? (p.imoveis as unknown[]).map(texto).join(", ") : null,
        });
        break;
      case "mudou_de_funil":
        itens.push({ em, tipo: "etapa", texto: `Passou para o funil ${texto(p.para)}`.trim() });
        break;
      case "nome_alterado":
        itens.push({ em, tipo: "nome", texto: "Nome do lead alterado" });
        break;
      case "reaberto":
        itens.push({ em, tipo: "atividade", texto: "Negócio reaberto", detalhe: p.motivo_da_perda ? `Tinha sido perdido por: ${texto(p.motivo_da_perda)}.` : null });
        break;
      case "contato_pessoal":
        itens.push({ em, tipo: "pessoal", texto: "Marcado como contato pessoal", detalhe: "A conversa saiu do CRM e a IA parou de ler." });
        break;
      case "pessoal_recusado":
        itens.push({ em, tipo: "alerta", texto: "Tentaram marcar como contato pessoal", detalhe: "O lead veio por ação da OPA e continua aberto." });
        break;
      case "conversa_apagada":
        itens.push({
          em,
          tipo: "conversa_apagada",
          texto: `Conversa apagada do CRM por ${texto(p.por) || "um administrador"}`,
          detalhe: `${Number(p.mensagens) || 0} ${Number(p.mensagens) === 1 ? "mensagem saiu" : "mensagens saíram"} do CRM. No celular do corretor nada muda.`,
        });
        break;
      case "venda_realizada":
        // A ficha monta esta linha com os valores (precisa do formato de moeda de lá).
        break;
      default:
        itens.push({ em, tipo: "atividade", texto: ROTULO_DA_BASE[a.type] ?? (motivo || "Atividade registrada"), detalhe: ROTULO_DA_BASE[a.type] && motivo ? motivo : null });
    }
  }

  // Lead aberto que ninguém respondeu: fica no topo, com o tempo de espera do corretor de agora.
  const atual = donoEm(agora);
  const semRespostaMin = !resposta && d.aberto ? Math.max(1, Math.round((agora - atual.desde) / 60_000)) : null;
  if (semRespostaMin !== null) {
    itens.push({
      em: new Date(agora).toISOString(),
      tipo: "sem_resposta",
      texto: `Ainda sem resposta de ${d.nomeDe(d.donoAtualId)}`,
      detalhe: `Espera há ${tempoGasto(semRespostaMin)}.`,
    });
  }

  return {
    itens,
    resumo: {
      entrouEm: d.criadoEm,
      entrada: d.entrada,
      primeiroCorretor: d.nomeDe(primeiroDonoId),
      corretorAtual: d.nomeDe(d.donoAtualId),
      resposta,
      semRespostaMin,
      repasses: trocas.filter((t) => t.repasse).map((t) => ({ em: t.em, de: d.nomeDe(t.de), para: d.nomeDe(t.para) })),
    },
  };
}
