/**
 * Configuração da conta da imobiliária: o que o protótipo do CRM da OPA
 * (Kallyl, 29/10/2026) põe em Configurações, Lembretes e Integrações.
 *
 * Fica em organizations.settings.opa. Aqui moram os PADRÕES (os do protótipo);
 * o que a empresa salvar sobrescreve campo a campo. Quem lê usa
 * `carregarConfig`; quem grava usa `salvarConfig`, que só aceita gerente ou
 * administrador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- bairros

/** Os 52 bairros de Ilhabela por região (filtro "Onde" do site da OPA em 29/10/2026, mais costa leste). */
export const BAIRROS: Record<string, string[]> = {
  Norte: ["Armação", "Arrozal", "Barreiros", "Costa Bela", "Jabaquara", "Pacuíba", "Pinto", "Ponta das Canas", "Siriúba", "Viana"],
  "Centro e Vila": [
    "Água Branca", "Barra Velha", "Centro (Vila)", "Engenho d'Água", "Itaguaçu", "Itaquanduba", "Morro dos Mineiros",
    "Perequê", "Reino", "Saco da Capela", "Santa Tereza", "Zabumba",
  ],
  Sul: [
    "Bexiga", "Bonete", "Borrifos", "Cocaia", "Curral", "Feiticeira", "Ilhote", "Itapecerica", "Julião", "Piúva",
    "Ponta Azeda", "Ponta da Sela", "Portinho", "Praia Grande", "Reserva das Flechas", "Ribeirão", "São Pedro",
    "Sepituba", "Taubaté", "Veloso",
  ],
  "Costa leste e ilhas": [
    "Castelhanos", "Figueira", "Fome", "Guanxumas", "Praia Mansa", "Praia Vermelha", "Saco do Sombrio", "Serraria",
    "Ilha de Búzios", "Ilha da Vitória",
  ],
};

// ---------------------------------------------------------------- tipos

export interface GrupoEtiqueta {
  /** Prefixo da etiqueta no lead: `grupo:valor`, ex. `finalidade:Moradia`. */
  chave: string;
  nome: string;
  opcoes: string[];
  /** Opções agrupadas (bairro por região). */
  subgrupos?: Record<string, string[]>;
  nota?: string;
  destaque?: boolean;
}

export interface CampoLead {
  chave: string;
  rotulo: string;
  tipo: "lista" | "texto" | "area";
  opcoes?: string[];
  dica?: string;
}

export interface CampoVisita {
  chave: string;
  rotulo: string;
  obrigatorio?: boolean;
  opcoes?: string[];
}

export interface MotivoPerda {
  motivo: string;
  /** true = o lead comprou ou desistiu de vez (sai da base de relacionamento). */
  definitivo: boolean;
}

export type Trilha = "pago" | "organico" | "cadencia" | "captacao";

export interface RegraLembrete {
  id: string;
  trilha: Trilha;
  etapa: string;
  quando: string;
  oQue: string;
  para: string;
  ativa: boolean;
}

export interface DiaAtendimento {
  dias: string;
  abre: string;
  fecha: string;
  aberto: boolean;
}

export interface EventoMeta {
  /** slug da etapa do funil de Compradores. */
  etapa: string;
  evento: string;
}

export interface ConfigOpa {
  /** Ordem da roleta de leads (ids de usuário). */
  roleta: string[];
  roleta_ultimo: string | null;
  /** Corretores fora da roleta por agora (WhatsApp caiu, férias). */
  roleta_pausados: string[];
  prazos: { pago_min: number; organico_min: number; avisos_pago: number[]; avisos_organico: number[] };
  horario: DiaAtendimento[];
  captacao: {
    por_semana: number;
    devolutiva_dias: number;
    cadastro_dias: number;
    mais_tempo_dias: number;
    tentativas: number;
    /** Ordem da roleta de captação (ids de usuário). */
    ordem: string[];
  };
  etiquetas: GrupoEtiqueta[];
  campos_lead: CampoLead[];
  campos_proprietario: CampoLead[];
  ficha_visita: CampoVisita[];
  motivos_perda: MotivoPerda[];
  lembretes: RegraLembrete[];
  meta_eventos: EventoMeta[];
  cruzamento: { pesos: { bairro: number; preco: number; suites: number; atributos: number; demanda: number }; minimo: number };
  /** Volta ao mesmo corretor se ganho ou perdido há menos disso. */
  volta_dias: number;
  gerente_ve_receita: boolean;
}

// ---------------------------------------------------------------- padrões do protótipo

export const PADRAO: ConfigOpa = {
  roleta: [],
  roleta_ultimo: null,
  roleta_pausados: [],
  prazos: { pago_min: 60, organico_min: 180, avisos_pago: [20, 40], avisos_organico: [20, 60, 120] },
  horario: [
    { dias: "Segunda a sexta", abre: "08:00", fecha: "19:00", aberto: true },
    { dias: "Sábado", abre: "09:00", fecha: "14:00", aberto: true },
    { dias: "Domingo e feriado", abre: "", fecha: "", aberto: false },
  ],
  captacao: { por_semana: 2, devolutiva_dias: 7, cadastro_dias: 15, mais_tempo_dias: 7, tentativas: 3, ordem: [] },
  etiquetas: [
    {
      chave: "offmarket",
      nome: "Off market",
      opcoes: ["Comprador off market", "Proprietário off market"],
      destaque: true,
      nota: "Atendimento com sigilo: só link reservado, sem foto solta, sem portal e sem post.",
    },
    { chave: "finalidade", nome: "Finalidade", opcoes: ["Moradia", "Temporada", "Locação", "Investimento"] },
    { chave: "regiao", nome: "Região de interesse", opcoes: Object.keys(BAIRROS) },
    {
      chave: "bairro",
      nome: "Bairro de interesse",
      opcoes: Object.values(BAIRROS).flat(),
      subgrupos: BAIRROS,
      nota: "Todos os bairros de Ilhabela, por região.",
    },
    {
      chave: "faixa",
      nome: "Faixa de investimento",
      opcoes: ["Até R$ 1 mi", "R$ 1 a 2 mi", "R$ 2 a 4 mi", "R$ 4 a 7 mi", "Acima de R$ 7 mi"],
      nota: "Sai do imóvel que a pessoa olha. Nunca pergunte quanto ela pode pagar.",
    },
    {
      chave: "int",
      nome: "Estilo de vida e interesses",
      opcoes: [
        "Praia", "Vela", "Barco", "Pesca", "Mergulho", "Trilha e natureza", "Gastronomia", "Home office",
        "Envelhecer na ilha", "Filhos pequenos", "Pet", "Receber a família",
      ],
      nota: "Escolhe o gancho do relacionamento mensal: Vela recebe a Semana de Vela, Pesca o Festival da Tainha.",
    },
    {
      chave: "tipo",
      nome: "Tipo de imóvel",
      opcoes: ["Casa", "Apartamento", "Terreno", "Pé na areia", "Vista para o mar", "Condomínio fechado"],
    },
    {
      chave: "momento",
      nome: "Momento",
      opcoes: ["Comprar em até 3 meses", "Em até 1 ano", "Sem pressa", "Precisa vender outro imóvel"],
    },
  ],
  campos_lead: [
    { chave: "prazo", rotulo: "Quando pretende comprar", tipo: "lista", opcoes: ["Em até 3 meses", "Em até 1 ano", "Sem pressa"] },
    { chave: "conhece", rotulo: "Já conhece Ilhabela?", tipo: "lista", opcoes: ["Vem sempre", "Já veio algumas vezes", "Nunca veio"] },
    { chave: "quem", rotulo: "Com quem vem", tipo: "texto", dica: "Casal, filhos, pais, cachorro" },
    { chave: "decide", rotulo: "Quem decide junto", tipo: "texto", dica: "Esposa, sócio, advogado" },
    { chave: "pagamento", rotulo: "Forma de pagamento", tipo: "lista", opcoes: ["À vista", "Financiamento", "Permuta", "Ainda não sabe"] },
    { chave: "vende", rotulo: "Precisa vender outro imóvel?", tipo: "lista", opcoes: ["Não", "Sim, fora da ilha", "Sim, na ilha"] },
    { chave: "barco", rotulo: "Tem barco ou pensa em ter?", tipo: "lista", opcoes: ["Não", "Tem", "Pensa em ter"] },
    { chave: "obs", rotulo: "O que não é imóvel e vale lembrar", tipo: "area", dica: "Barco, pesca, filhos, a sogra que vem no Natal" },
  ],
  campos_proprietario: [
    { chave: "quem", rotulo: "Quem é", tipo: "lista", opcoes: ["Dono", "Herdeiro ou família", "Procurador", "Administrador do imóvel"] },
    { chave: "tipo", rotulo: "Tipo de imóvel", tipo: "lista", opcoes: ["Casa", "Casa em condomínio", "Apartamento", "Terreno", "Pousada ou comercial"] },
    { chave: "endereco", rotulo: "Endereço do imóvel", tipo: "texto", dica: "Rua, número e referência" },
    { chave: "bairro", rotulo: "Bairro", tipo: "texto", dica: "Ex.: Curral" },
    { chave: "motivo", rotulo: "Por que quer vender", tipo: "texto", dica: "Mudança, inventário, liquidez" },
    { chave: "exclusividade", rotulo: "Exclusividade com a OPA", tipo: "lista", opcoes: ["Sim", "Não", "A negociar"] },
    {
      chave: "documentacao",
      rotulo: "Documentação",
      tipo: "lista",
      opcoes: ["Escritura e matrícula", "Em posse, com cadeia documentada", "Em inventário", "A conferir com a June"],
    },
  ],
  ficha_visita: [
    { chave: "quando", rotulo: "Data e hora", obrigatorio: true },
    { chave: "imovel", rotulo: "Imóvel visitado", obrigatorio: true },
    { chave: "quem", rotulo: "Quem foi" },
    { chave: "chegada", rotulo: "Como chegou", opcoes: ["Balsa, de carro", "Balsa, a pé", "Barco", "Já estava na ilha"] },
    { chave: "interesse", rotulo: "Interesse depois da visita (1 a 5)", obrigatorio: true },
    { chave: "gostou", rotulo: "O que gostou", obrigatorio: true },
    { chave: "naogostou", rotulo: "O que não gostou", obrigatorio: true },
    { chave: "objecao", rotulo: "Objeção principal" },
    {
      chave: "proximo",
      rotulo: "Próximo passo",
      obrigatorio: true,
      opcoes: ["Mandar mais opções", "Segunda visita", "Fazer proposta", "Pausar, sem momento"],
    },
    { chave: "obs", rotulo: "Observações" },
  ],
  motivos_perda: [
    { motivo: "Comprou com outra imobiliária", definitivo: true },
    { motivo: "Comprou direto com o proprietário", definitivo: true },
    { motivo: "Desistiu de comprar na ilha", definitivo: true },
    { motivo: "Fora do orçamento do acervo", definitivo: false },
    { motivo: "Não respondeu depois da cadência", definitivo: false },
    { motivo: "Contato inválido", definitivo: false },
    { motivo: "Lead duplicado", definitivo: false },
    { motivo: "Era corretor ou fornecedor", definitivo: false },
  ],
  lembretes: [
    ...(
      [
        ["Lead que já está no CRM preenche outro formulário", "Na hora", "Vai direto ao corretor responsável, sem roleta. Boas-vindas do número dele, aviso com o imóvel novo e o card sobe na fila como \"voltou\"", "Corretor"],
        ["Lead recebido", "20 min sem resposta", "Primeiro aviso: nome do lead, imóvel e o link da conversa", "Corretor"],
        ["Lead recebido", "40 min sem resposta", "Segundo aviso, com o tempo que falta", "Corretor"],
        ["Lead recebido", "1 h sem resposta", "Lead passa para o próximo da fila. Quem perdeu é avisado", "Corretor e gerente"],
        ["Lead recebido", "Fila inteira passou", "Escala para a gestão", "June e Marco"],
      ] as const
    ).map(([etapa, quando, oQue, para], i) => ({ id: `pago-${i + 1}`, trilha: "pago" as const, etapa, quando, oQue, para, ativa: true })),
    ...(
      [
        ["Conversa nova no WhatsApp", "Na hora", "Pergunta se é lead ou conversa particular, com as opções \"É lead\" e \"Particular\", sem repetir o texto da mensagem. Só o corretor vê", "Corretor"],
        ["Conversa nova no WhatsApp", "2 h sem classificar", "Vira lead sozinha e entra na fila", "Corretor"],
        ["Lead recebido", "20 min sem resposta", "Primeiro aviso", "Corretor"],
        ["Lead recebido", "1 h sem resposta", "Segundo aviso", "Corretor"],
        ["Lead recebido", "2 h sem resposta", "Terceiro aviso, com o tempo que falta", "Corretor"],
        ["Lead recebido", "3 h sem resposta", "Lead passa para o próximo da fila", "Corretor e gerente"],
      ] as const
    ).map(([etapa, quando, oQue, para], i) => ({ id: `org-${i + 1}`, trilha: "organico" as const, etapa, quando, oQue, para, ativa: true })),
    ...(
      [
        ["Primeiro contato", "D1, 9h", "Mandar uma pergunta fácil de responder (modelo D1 do kit)", "Corretor"],
        ["Primeiro contato", "D2, 9h", "Entregar valor sem pedir nada: vídeo do bairro fora da temporada", "Corretor"],
        ["Primeiro contato", "D3, 17h", "Segunda ligação, em outro horário", "Corretor"],
        ["Primeiro contato", "D5, 9h", "Pausa combinada. O card vai para Sem momento e continua seu", "Corretor"],
        ["Visita agendada", "Véspera, 18h", "Confirmar horário, endereço e a balsa", "Corretor"],
        ["Visita agendada", "2 h antes", "Lembrete da visita", "Corretor"],
        ["Visita realizada", "No mesmo dia, 20h", "Registrar o que gostou e o que não gostou", "Corretor"],
        ["Proposta feita", "Parado 7 dias", "Retomar a proposta", "Corretor e Marco"],
        ["Negociação", "Parado 14 dias", "Destravar a negociação", "Corretor e Marco"],
        ["Fechamento", "Parado 30 dias", "Ver o que falta para fechar", "Corretor e Marco"],
        ["Sem momento", "D7, D14, D21, D28", "Fase 2: outra opção, dado da região, pergunta que corrige o rumo, convite", "Corretor"],
        ["Sem momento", "Uma vez por mês", "Relacionamento pelo interesse do lead (vela, barco, pesca)", "Corretor"],
        ["Qualquer etapa", "Imóvel novo com afinidade acima de 75%", "Aviso com o imóvel e o lead, e a mensagem pronta para mandar", "Corretor"],
        ["No ar em observação", "A cada 15 dias", "Parecer ao proprietário com visitas e contatos do período", "Captador"],
      ] as const
    ).map(([etapa, quando, oQue, para], i) => ({ id: `cad-${i + 1}`, trilha: "cadencia" as const, etapa, quando, oQue, para, ativa: true })),
    ...(
      [
        ["Oportunidade do Radar", "Segunda, 9h", "Os 2 imóveis da semana: tipo, bairro, valor anunciado, onde foi visto e quantos compradores da OPA combinam. Opções: \"Vou atrás\", \"Já conheço o dono\", \"Não consigo\"", "Corretor"],
        ["Oportunidade do Radar", "3º dia sem retorno", "Lembrete do que foi mandado", "Corretor"],
        ["Oportunidade do Radar", "Dia do prazo (7º dia)", "Último aviso: \"achei o dono\", \"mais 7 dias\" (uma vez) ou \"não consigo\"", "Corretor"],
        ["Oportunidade do Radar", "Prazo vencido sem retorno", "Passa para o próximo corretor da roleta de captação. Quem perdeu é avisado", "Corretor e gerente"],
        ["Oportunidade do Radar", "3 corretores sem sucesso", "Volta para a gestão decidir", "Marco"],
        ["Contato / candidatura", "15 dias sem cadastro", "Cobrar o cadastro completo no Painel, com dados e fotos", "Corretor"],
      ] as const
    ).map(([etapa, quando, oQue, para], i) => ({ id: `capt-${i + 1}`, trilha: "captacao" as const, etapa, quando, oQue, para, ativa: true })),
  ],
  meta_eventos: [
    { etapa: "lead-recebido", evento: "Lead" },
    { etapa: "diagnostico", evento: "Lead qualificado" },
    { etapa: "visita-agendada", evento: "Visita agendada" },
    { etapa: "proposta", evento: "Proposta feita" },
    { etapa: "vendido", evento: "Venda realizada" },
  ],
  cruzamento: { pesos: { bairro: 30, preco: 25, suites: 20, atributos: 15, demanda: 10 }, minimo: 60 },
  volta_dias: 90,
  gerente_ve_receita: false,
};

// ---------------------------------------------------------------- leitura e gravação

/** Junta o salvo com o padrão, campo a campo (lista salva substitui a padrão inteira). */
export function mesclarConfig(salvo: Partial<ConfigOpa> | null | undefined): ConfigOpa {
  const s = salvo ?? {};
  return {
    ...PADRAO,
    ...s,
    prazos: { ...PADRAO.prazos, ...(s.prazos ?? {}) },
    captacao: { ...PADRAO.captacao, ...(s.captacao ?? {}) },
    cruzamento: {
      ...PADRAO.cruzamento,
      ...(s.cruzamento ?? {}),
      pesos: { ...PADRAO.cruzamento.pesos, ...(s.cruzamento?.pesos ?? {}) },
    },
  };
}

/** Lê a configuração da org. Aceita o cliente da sessão ou o admin. */
export async function carregarConfig(supabase: SupabaseClient, orgId: string): Promise<ConfigOpa> {
  const { data } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const settings = (data as { settings: { opa?: Partial<ConfigOpa> } | null } | null)?.settings;
  return mesclarConfig(settings?.opa);
}

/**
 * Grava parte da configuração (merge raso em settings.opa). Recebe o cliente
 * admin: quem chama já conferiu que a pessoa é gerente ou administrador da org.
 */
export async function salvarConfig(admin: SupabaseClient, orgId: string, parcial: Partial<ConfigOpa>): Promise<void> {
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const opa = (settings.opa ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("organizations")
    .update({ settings: { ...settings, opa: { ...opa, ...parcial } } })
    .eq("id", orgId);
  if (error) throw new Error(`salvarConfig: ${error.message}`);
}

/** Região de um bairro pela tabela BAIRROS. */
export function regiaoDoBairro(bairro: string | null | undefined): string | null {
  if (!bairro) return null;
  const alvo = bairro.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const [r, bs] of Object.entries(BAIRROS)) {
    if (bs.some((b) => b.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === alvo)) return r;
  }
  return null;
}

/** Faixa de investimento pelo valor do imóvel (regra: sai do imóvel, nunca de pergunta). */
export function faixaDoValor(cents: number | null | undefined): string | null {
  if (!cents) return null;
  const v = cents / 100;
  return v < 1e6 ? "Até R$ 1 mi" : v < 2e6 ? "R$ 1 a 2 mi" : v < 4e6 ? "R$ 2 a 4 mi" : v < 7e6 ? "R$ 4 a 7 mi" : "Acima de R$ 7 mi";
}
