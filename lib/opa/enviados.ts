/**
 * "Enviados" do OPA Lembretes (pedido do Allyson, 10/11/2026): uma visão única de tudo
 * o que o número de avisos mandou e para quem, e o aviso avulso escrito na hora.
 *
 * A fonte é a própria conversa do número (`messages` da sessão `opa-lembretes`): o texto
 * que saiu de verdade, e não o que a rotina pretendia mandar. O que NÃO saiu (número
 * pausado, modo de teste, pessoa sem WhatsApp) vem de `opa_avisos`.
 *
 * Só regra, sem banco e sem import com alias "@/": testável sem Next.
 */

export type TipoEnviado =
  | "manual"
  | "lead_novo"
  | "lembrete"
  | "outro_corretor"
  | "repasse"
  | "gestao"
  | "parado"
  | "radar"
  | "agenda"
  | "boas_vindas"
  | "codigo"
  | "outro";

export type TomEnviado = "neutro" | "claro" | "acao" | "escuro" | "alerta" | "ok" | "aviso";

/** Nome curto e cor de cada tipo: a cor diz o assunto antes de a pessoa ler. */
export const TIPOS_ENVIADOS: Record<TipoEnviado, { rotulo: string; tom: TomEnviado }> = {
  manual: { rotulo: "Aviso escrito", tom: "escuro" },
  lead_novo: { rotulo: "Lead novo", tom: "ok" },
  lembrete: { rotulo: "Lembrete", tom: "aviso" },
  outro_corretor: { rotulo: "Outro corretor", tom: "acao" },
  repasse: { rotulo: "Repasse", tom: "alerta" },
  gestao: { rotulo: "Para a gestão", tom: "alerta" },
  parado: { rotulo: "Negócio parado", tom: "aviso" },
  radar: { rotulo: "Radar", tom: "claro" },
  agenda: { rotulo: "Agenda", tom: "claro" },
  boas_vindas: { rotulo: "Boas-vindas", tom: "alerta" },
  codigo: { rotulo: "Código de entrada", tom: "neutro" },
  outro: { rotulo: "Resposta", tom: "neutro" },
};

/**
 * De que aviso é este texto. Os textos nascem em lib/opa/aviso-whatsapp.ts e vizinhos:
 * mudou a frase lá, confira aqui (o teste cobre um exemplo de cada).
 * `manual` = alguém escreveu e mandou pela tela.
 */
export function tipoDoTexto(texto: string | null | undefined, manual = false): TipoEnviado {
  if (manual) return "manual";
  const t = texto ?? "";
  if (/^Seu código para /.test(t)) return "codigo";
  if (/passou para a sua vez|^🔴|saiu de .+ e foi para .+ por falta de resposta/u.test(t)) return "repasse";
  if (/lead novo para você:|preencheu o formulário de novo/.test(t)) return "lead_novo";
  if (/espera sua resposta há|chegou e está sem resposta há/.test(t)) return "lembrete";
  if (/está com o corretor responsável/.test(t)) return "outro_corretor";
  if (/capta[çc]/i.test(t)) return "radar";
  if (/Decida quem atende|está com alguém que saiu da equipe|estava duplicado no CRM|o CRM não soube com quem fica/.test(t)) return "gestao";
  if (/está parado há \d+ dias/.test(t)) return "parado";
  if (/hora de mandar a mensagem que você agendou|, lembrete: /.test(t)) return "agenda";
  if (/boas-vindas/i.test(t)) return "boas_vindas";
  return "outro";
}

/** O que a tela mostra. O código de entrada nunca aparece: vale como senha por alguns minutos. */
export function textoVisivel(tipo: TipoEnviado, texto: string | null | undefined): string {
  if (tipo === "codigo") return "Código de entrada no CRM (o número não é mostrado aqui).";
  return (texto ?? "").trim() || "(mensagem sem texto)";
}

/** Primeira linha com conteúdo, para a lista fechada. */
export function primeiraLinha(texto: string): string {
  return (
    texto
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

export type SituacaoEnviado = "na_fila" | "enviada" | "entregue" | "lida" | "falhou";

export const SITUACOES_ENVIADO: Record<SituacaoEnviado, { rotulo: string; tom: TomEnviado }> = {
  na_fila: { rotulo: "Na fila", tom: "aviso" },
  enviada: { rotulo: "Enviada", tom: "neutro" },
  entregue: { rotulo: "Entregue", tom: "claro" },
  lida: { rotulo: "Lida", tom: "ok" },
  falhou: { rotulo: "Não saiu", tom: "alerta" },
};

export function situacaoDaMensagem(m: { status: string; delivered_at?: string | null; read_at?: string | null }): SituacaoEnviado {
  if (m.status === "failed") return "falhou";
  if (m.read_at || m.status === "read") return "lida";
  if (m.delivered_at || m.status === "delivered") return "entregue";
  if (m.status === "queued" || m.status === "sending") return "na_fila";
  return "enviada";
}

/** DDD + 8 últimos dígitos: o mesmo número com ou sem 55 e com ou sem o nono dígito (igual a chaveDoTelefone). */
export function chaveTelefone(telefone: string | null | undefined): string | null {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
}

const diaSP = (ms: number): string => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** "Hoje", "Ontem" ou "seg., 9 de nov.", no dia de São Paulo. */
export function tituloDoDia(iso: string, agora: number): string {
  const dia = diaSP(Date.parse(iso));
  if (dia === diaSP(agora)) return "Hoje";
  if (dia === diaSP(agora - 86_400_000)) return "Ontem";
  return new Date(Date.parse(iso)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short" });
}

/** Agrupa por dia de São Paulo, mantendo a ordem de chegada (mais novas primeiro). */
export function agruparPorDia<T extends { em: string }>(itens: T[], agora: number): Array<{ dia: string; titulo: string; itens: T[] }> {
  const grupos: Array<{ dia: string; titulo: string; itens: T[] }> = [];
  for (const item of itens) {
    const dia = diaSP(Date.parse(item.em));
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === dia) ultimo.itens.push(item);
    else grupos.push({ dia, titulo: tituloDoDia(item.em, agora), itens: [item] });
  }
  return grupos;
}

/** Nome do aviso que não saiu, a partir do `tipo` de opa_avisos. */
export function rotuloDoAviso(tipo: string): string {
  const min = /^aviso_(\d+)$/.exec(tipo);
  if (min) {
    const m = Number(min[1]);
    return `Lembrete de ${m % 60 === 0 ? `${m / 60} h` : `${m} min`}`;
  }
  const nomes: Record<string, string> = {
    lead_novo: "Lead novo",
    fora_do_horario: "Lembrete fora do horário",
    lead_de_outro_corretor: "Lead com outro corretor",
    repasse_novo_dono: "Repasse: lead novo para a pessoa",
    repasse_perdeu: "Repasse: aviso a quem perdeu",
    repasse_gestor: "Repasse: cópia para a gestão",
    escala: "Lead para a gestão decidir",
    parado: "Negócio parado",
    radar_chegada: "Radar: captação nova",
    radar_lembrete: "Radar: lembrete",
    radar_prazo: "Radar: prazo",
    boas_vindas_falhou: "Boas-vindas não saiu",
    duplicado: "Duplicado",
  };
  return nomes[tipo] ?? "Aviso";
}

/** Por que não saiu, em uma frase. `falhou` cobre número pausado, modo de teste e erro do WhatsApp. */
export function motivoDoAviso(status: string): string {
  return status === "sem_numero" ? "A pessoa não tem WhatsApp conectado no CRM." : "O OPA Lembretes estava pausado, em teste ou o WhatsApp não confirmou.";
}
