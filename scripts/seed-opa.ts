/**
 * CRM da OPA em demonstração local: empresa, equipe, funis, os imóveis reais do
 * site e leads de exemplo com conversa de WhatsApp, já lidos pelo copiloto.
 *
 * Os imóveis vêm de `dados/imoveis.json` do site da OPA (D:\1. OPA\1. SITE).
 * Leads, telefones e conversas são fictícios.
 *
 * Refaz tudo da empresa "opa" a cada execução (apaga e cria de novo).
 *
 * Run: npx tsx scripts/seed-opa.ts [caminho/do/imoveis.json]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { randomBytes } from "node:crypto";

import { PADRAO } from "../lib/opa/config";
import { analisarPorRegras, type MensagemLida } from "../lib/opa/copiloto";
import { registrarEntrada } from "../lib/opa/entrada";
import { FUNIS, TRAVADAS, linhaDeImovel, type ImovelJson } from "../lib/opa/estrutura";

const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
}

// O seed APAGA a org opa inteira. Só roda contra o Supabase local.
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
if (!["localhost", "127.0.0.1", "host.docker.internal"].includes(host)) {
  console.error(`Seed recusado: ${host} não é o Supabase local. Ele apaga todos os dados da OPA.`);
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const IMOVEIS_JSON = process.argv[2] ?? "D:/1. OPA/1. SITE/dados/imoveis.json";
const SENHA = "OpaCrm2026!";
const MIN = 60_000;
const agora = Date.now();
const ha = (min: number) => new Date(agora - min * MIN).toISOString();

async function q<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, oQue: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${oQue}: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------- equipe

const EQUIPE = [
  { chave: "marco", nome: "Marco Henrique", email: "marco@opa.local", papel: "manager", tel: "+5512991001170" },
  { chave: "luana", nome: "Luana Machado", email: "luana@opa.local", papel: "agent", tel: "+5512991004410" },
  { chave: "paulo", nome: "Paulo Martin", email: "paulo@opa.local", papel: "agent", tel: "+5512991008302" },
  { chave: "rodrigo", nome: "Rodrigo Festuccia", email: "rodrigo@opa.local", papel: "agent", tel: "+5512991002217" },
  { chave: "cristian", nome: "Cristian Spengler", email: "cristian@opa.local", papel: "agent", tel: "+5512991005532" },
] as const;
type Chave = (typeof EQUIPE)[number]["chave"];

// ---------------------------------------------------------------- leads

type Origem = "meta" | "site" | "whatsapp" | "indicacao" | "linkbio";
type Fala = [quem: "L" | "C", texto: string, minutosAtras: number];

interface LeadDemo {
  nome: string;
  tel: string;
  corretor: Chave;
  etapa: string;
  origem: Origem;
  campanha?: string;
  imovel: { regiao?: string; bairro?: string; minSuites?: number; maxPreco?: number; minPreco?: number };
  conversa: Fala[];
  /** Campos que o corretor já confirmou (o resto fica como sugestão pendente). */
  confirmados?: string[];
  /** O que já tinha sido confirmado em conversas anteriores, fora do trecho mostrado. */
  jaPreenchido?: Record<string, string>;
  /** Entrou por imóvel off market do acervo: o imóvel vira off market e o lead ganha a etiqueta. */
  offMarket?: boolean;
}

const CAMP_COMPRA = "CP-C | Catálogo alto padrão | Sul e Norte";
const CAMP_LANC = "CP-C | Casas pé na areia | Público semelhante";

const LEADS: LeadDemo[] = [
  {
    nome: "Helena Prado", tel: "+5511998414410", corretor: "luana", etapa: "lead-recebido", origem: "meta", campanha: CAMP_COMPRA,
    imovel: { regiao: "Sul", minSuites: 4 },
    conversa: [
      ["L", "Oi, vi o anúncio dessa casa no sul da ilha. Ainda está disponível?", 52],
      ["L", "Somos eu e meu marido, queremos morar aqui de vez. Ele trabalha de home office e precisa de internet boa.", 50],
    ],
  },
  {
    nome: "Ricardo Tavares", tel: "+5511998308302", corretor: "paulo", etapa: "lead-recebido", origem: "site",
    imovel: { regiao: "Norte", minSuites: 3 },
    conversa: [["L", "Boa tarde, gostaria de mais informações sobre o imóvel do site.", 34]],
  },
  {
    nome: "Beatriz Lemos", tel: "+5511997122045", corretor: "rodrigo", etapa: "primeiro-contato", origem: "meta", campanha: CAMP_LANC,
    imovel: { regiao: "Centro e Vila", minSuites: 3 },
    conversa: [
      ["L", "Olá! Tenho interesse na casa do anúncio.", 300],
      ["C", "Oi Beatriz, tudo bem? Aqui é o Rodrigo, da OPA. A casa está disponível sim. Me conta: vocês pensam em morar na ilha ou usar nas temporadas?", 290],
      ["L", "A ideia é usar nos feriados e no verão, e quem sabe alugar por temporada quando não estivermos.", 240],
      ["L", "Gostamos muito da região do Perequê e do Engenho, perto da Vila.", 239],
    ],
  },
  {
    nome: "Fernando Aguiar", tel: "+5511996550731", corretor: "cristian", etapa: "diagnostico", origem: "indicacao",
    imovel: { regiao: "Norte", minSuites: 4, minPreco: 3_000_000 },
    conversa: [
      ["L", "Cristian, quem me passou teu contato foi o Júlio, do condomínio. Estou procurando casa na ilha.", 2880],
      ["C", "Oi Fernando! O Júlio é gente boa. Me conta o que vocês procuram?", 2870],
      ["L", "Tenho veleiro e quero casa com píer ou perto da marina. Lado norte, Siriúba ou Pacuíba.", 2860],
      ["L", "4 suítes, a família é grande. Orçamento até 6 milhões.", 2858],
      ["C", "Perfeito. E o momento de vocês?", 2850],
      ["L", "Já vendi o apartamento em SP, quero fechar até o fim do ano.", 2700],
    ],
    confirmados: ["finalidade", "regiao", "suites", "faixa", "momento"],
    jaPreenchido: { finalidade: "Moradia", inegociavel: "Píer ou marina perto" },
  },
  {
    nome: "Mariana Couto", tel: "+5511995014470", corretor: "luana", etapa: "primeiro-contato", origem: "meta", campanha: CAMP_COMPRA,
    imovel: { bairro: "Siriúba" },
    conversa: [
      ["L", "Oi Luana, vi a casa na Siriúba.", 1500],
      ["C", "Oi Mariana! Que bom. Vocês já conhecem a Siriúba?", 1490],
      ["L", "Conheço sim, passo as férias aí desde criança. Agora quero uma casa nossa.", 1440],
      ["L", "Não abro mão de quintal para os cachorros, temos dois labradores.", 1438],
    ],
  },
  {
    nome: "Gustavo Rangel", tel: "+5511994430990", corretor: "paulo", etapa: "selecao", origem: "site",
    imovel: { regiao: "Sul", minSuites: 3 },
    conversa: [
      ["L", "Paulo, recebi os imóveis que você mandou. O segundo me chamou atenção.", 4400],
      ["C", "Ótimo, Gustavo. Quer que eu veja um horário para visitar?", 4390],
      ["L", "Vou conversar com minha esposa e te falo. A gente decide junto.", 4300],
    ],
    confirmados: ["finalidade", "regiao"],
    jaPreenchido: { finalidade: "Moradia", regiao: "Sul (Feiticeira, Veloso)", momento: "Em 3 a 6 meses", inegociavel: "Vista para o mar" },
  },
  {
    nome: "Paula Siqueira", tel: "+5511993321188", corretor: "rodrigo", etapa: "visita-agendada", origem: "meta", campanha: CAMP_LANC,
    imovel: { regiao: "Centro e Vila" },
    conversa: [
      ["C", "Paula, confirmado sábado às 10h na casa do Saco da Capela. Te mando a localização na sexta.", 600],
      ["L", "Combinado! Vou com meu marido.", 590],
    ],
    confirmados: ["finalidade", "regiao", "momento", "inegociavel"],
    jaPreenchido: { finalidade: "Temporada", regiao: "Centro e Vila (Saco da Capela)", momento: "Agora (até 3 meses)", inegociavel: "Andar até a Vila" },
  },
  {
    nome: "Otávio Brandão", tel: "+5511992214433", corretor: "marco", etapa: "proposta", origem: "indicacao", offMarket: true,
    imovel: { regiao: "Sul", minPreco: 8_000_000 },
    conversa: [
      ["C", "Otávio, levei sua proposta ao proprietário. Ele pediu até quinta para responder.", 10_200],
      ["L", "Tranquilo. Se ele topar, quero assinar logo.", 10_100],
    ],
    confirmados: ["finalidade", "regiao", "momento", "inegociavel", "faixa"],
    jaPreenchido: { finalidade: "Investimento", regiao: "Sul (Veloso)", momento: "Agora (até 3 meses)", inegociavel: "Terreno grande com costeira" },
  },
  {
    nome: "Camila Ventura", tel: "+5511991133877", corretor: "cristian", etapa: "primeiro-contato", origem: "whatsapp",
    imovel: { regiao: "Norte" },
    conversa: [
      ["L", "Oi! Vocês têm casa para comprar perto da praia, lado norte?", 95],
      ["C", "Oi Camila! Temos sim. É para morar ou para as temporadas?", 90],
      ["L", "Para morar. Estamos mudando de São Paulo no começo do ano. O mais importante é estar perto da praia, dá para ir andando.", 15],
    ],
  },
  {
    nome: "Diego Matsuda", tel: "+5511990025512", corretor: "luana", etapa: "primeiro-contato", origem: "linkbio",
    imovel: { regiao: "Sul" },
    conversa: [
      ["L", "Luana, vi teu vídeo no Instagram da casa com vista para o mar. Qual o valor?", 200],
      ["C", "Oi Diego! Te mando os detalhes agora.", 195],
      ["L", "Quero investir, alugar por temporada. Por volta de 2,5 milhões.", 130],
    ],
  },
  {
    nome: "Sofia Albuquerque", tel: "+5511989941120", corretor: "paulo", etapa: "visita-realizada", origem: "site",
    imovel: { regiao: "Norte", minSuites: 3 },
    conversa: [
      ["C", "Sofia, foi um prazer mostrar a casa hoje. O que vocês acharam?", 1300],
      ["L", "Amamos a vista e a varanda. A cozinha é pequena para a gente, mas dá para reformar.", 1200],
    ],
    confirmados: ["finalidade", "regiao", "momento", "inegociavel"],
    jaPreenchido: { finalidade: "Moradia", regiao: "Norte (Siriúba)", momento: "Em 3 a 6 meses", inegociavel: "Varanda com vista", suites: "3 ou mais" },
  },
  {
    nome: "Henrique Dutra", tel: "+5511988871345", corretor: "rodrigo", etapa: "sem-momento", origem: "meta", campanha: CAMP_COMPRA,
    imovel: { regiao: "Sul" },
    conversa: [
      ["C", "Henrique, entrou uma casa no Veloso com o que vocês procuravam. Quer ver?", 20_000],
      ["L", "Obrigado, mas estamos sem pressa, só olhando por enquanto.", 19_000],
    ],
  },
  {
    nome: "Larissa Peixoto", tel: "+5511987762234", corretor: "marco", etapa: "negociacao", origem: "site",
    imovel: { regiao: "Sul", minPreco: 4_000_000 },
    conversa: [
      ["L", "Marco, o proprietário aceitaria 10% abaixo?", 3000],
      ["C", "Vou levar a ele hoje e te retorno amanhã cedo.", 2950],
    ],
    confirmados: ["finalidade", "regiao", "momento", "inegociavel"],
    jaPreenchido: { finalidade: "Moradia", regiao: "Sul (Feiticeira)", momento: "Agora (até 3 meses)", inegociavel: "Pôr do sol", faixa: "Até R$ 6 mi" },
  },
  {
    nome: "Thiago Rezende", tel: "+5511986653356", corretor: "cristian", etapa: "lead-recebido", origem: "meta", campanha: CAMP_COMPRA,
    imovel: { regiao: "Norte", minSuites: 3 },
    conversa: [["L", "Boa noite. Tem fotos internas da casa? Pesca é minha paixão, a casa fica perto de algum costão?", 140]],
  },
  {
    nome: "Renata Fontes", tel: "+5511985544478", corretor: "luana", etapa: "selecao", origem: "indicacao",
    imovel: { regiao: "Centro e Vila" },
    conversa: [
      ["C", "Renata, separei 3 casas no Engenho e no Itaguaçu. Te mando agora.", 2100],
      ["L", "Perfeito! Precisa ter 3 suítes e piscina.", 2000],
    ],
    confirmados: ["finalidade", "regiao"],
    jaPreenchido: { finalidade: "Moradia", regiao: "Centro e Vila (Engenho, Itaguaçu)" },
  },
];

// ---------------------------------------------------------------- execução


async function main() {
  // Empresa: refaz do zero.
  const antiga = await q(admin.from("organizations").select("id").eq("slug", "opa").maybeSingle(), "org");
  if (antiga) {
    const id = (antiga as { id: string }).id;
    for (const t of [
      "eventos_meta", "visitas", "lembretes_agendados", "copiloto_sugestoes", "messages", "conversations", "crm_lead_activities", "crm_leads",
      "crm_stages", "crm_pipelines", "contacts", "imoveis", "channel_sessions", "user_organizations",
    ]) {
      await q(admin.from(t).delete().eq("organization_id", id), `limpar ${t}`);
    }
    await q(admin.from("organizations").delete().eq("id", id), "apagar org");
  }

  const org = await q(
    admin
      .from("organizations")
      .insert({
        slug: "opa",
        legal_name: "M.H da Silva Filho Arquitetura e Imobiliária",
        display_name: "OPA Imóveis Ilhabela",
        onboarded_at: new Date().toISOString(),
        onboarding_state: { completed: true },
      })
      .select("id")
      .single(),
    "criar org",
  );
  const orgId = (org as { id: string }).id;
  console.info("org", orgId);

  // A base cria um funil padrão junto com a empresa; a OPA usa os dela.
  await q(admin.from("crm_stages").delete().eq("organization_id", orgId), "limpar etapas padrão");
  await q(admin.from("crm_pipelines").delete().eq("organization_id", orgId), "limpar funil padrão");

  // Equipe
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const usuarios: Record<string, string> = {};
  for (const p of EQUIPE) {
    let u = lista.users.find((x) => x.email === p.email);
    if (!u) {
      const r = await admin.auth.admin.createUser({
        email: p.email,
        password: SENHA,
        email_confirm: true,
        user_metadata: { full_name: p.nome },
      });
      if (r.error) throw r.error;
      u = r.data.user!;
    } else {
      await admin.auth.admin.updateUserById(u.id, { password: SENHA, user_metadata: { full_name: p.nome } });
    }
    usuarios[p.chave] = u.id;
    await q(
      admin.from("user_organizations").insert({
        user_id: u.id, organization_id: orgId, role: p.papel, accepted_at: new Date().toISOString(),
      }),
      `membro ${p.chave}`,
    );
  }
  // Roleta de leads (ordem do protótipo) e a demonstração com o gerente vendo
  // receita (pergunta em aberto no README). Na OPA o corretor vê só os seus.
  // O token da porta de entrada fica em opa_segredos (só o servidor lê).
  const entradaToken = randomBytes(24).toString("hex");
  await q(admin.from("opa_segredos").upsert({ organization_id: orgId, entrada_token: entradaToken }), "token de entrada");
  await q(
    admin
      .from("organizations")
      .update({
        settings: {
          visibility_mode: "own",
          opa: {
            roleta: ["luana", "paulo", "rodrigo", "cristian"].map((c) => usuarios[c]),
            roleta_ultimo: null,
            gerente_ve_receita: true,
            dominios_imovel: ["opailhabela.com.br", "r2.dev", "r2.cloudflarestorage.com"],
          },
        },
      })
      .eq("id", orgId),
    "settings da org",
  );

  const allyson = lista.users.find((x) => x.email === "allyson@gcompass.local");
  if (allyson) {
    await q(
      admin.from("user_organizations").insert({
        user_id: allyson.id, organization_id: orgId, role: "admin", accepted_at: new Date().toISOString(),
      }),
      "membro allyson",
    );
  }

  // Números de WhatsApp: um por corretor e o OPA Lembretes.
  const sessoes: Record<string, string> = {};
  const numeros = [
    { chave: "lembretes", nome: "OPA Lembretes", tel: "+5512991392393" },
    ...EQUIPE.map((p) => ({ chave: p.chave, nome: p.nome, tel: p.tel })),
  ];
  for (const n of numeros) {
    const s = await q(
      admin
        .from("channel_sessions")
        .insert({
          organization_id: orgId,
          waha_session_name: `opa-${n.chave}`,
          webhook_secret_encrypted: "\\x00",
          status: "WORKING",
          phone_number: n.tel,
          display_name: n.nome,
          warmup_completed_at: ha(60 * 24 * 30),
          metadata: { demonstracao: true },
        })
        .select("id")
        .single(),
      `sessão ${n.chave}`,
    );
    sessoes[n.chave] = (s as { id: string }).id;
  }

  // Funis
  const etapas: Record<string, { id: string; pipeline: string }> = {};
  let posFunil = 1000;
  for (const f of FUNIS) {
    const p = await q(
      admin
        .from("crm_pipelines")
        .insert({
          organization_id: orgId, name: f.nome, slug: f.slug, is_default: f.padrao, position: posFunil,
          vocabulary: {
            lead: "Lead", lead_plural: "Leads", deal: "Negócio", deal_plural: "Negócios",
            won: "Vendido", lost: "Perdido", stage: "Etapa", stage_plural: "Etapas",
          },
        })
        .select("id")
        .single(),
      `funil ${f.slug}`,
    );
    posFunil += 1000;
    const pid = (p as { id: string }).id;
    let pos = 1000;
    for (const [slug, nome, cor, horas] of [
      ...f.etapas,
      ...(f.slug === "compradores" ? ([["vendido", "Vendido", "#0B7A4B", null], ["perdido", "Perdido", "#8FA3AE", null]] as const) : []),
    ]) {
      const e = await q(
        admin
          .from("crm_stages")
          .insert({
            organization_id: orgId, pipeline_id: pid, name: nome, slug, color: cor, position: pos,
            expected_duration_hours: horas, is_won: slug === "vendido", is_lost: slug === "perdido",
            campos_obrigatorios: TRAVADAS.has(slug) ? ["finalidade", "regiao", "momento", "inegociavel"] : [],
            // Evento ao Meta quando o negócio entra na etapa (gatilho fn_evento_meta_da_etapa).
            evento_meta: f.slug === "compradores" ? (PADRAO.meta_eventos.find((m) => m.etapa === slug)?.evento ?? null) : null,
          })
          .select("id")
          .single(),
        `etapa ${slug}`,
      );
      etapas[`${f.slug}/${slug}`] = { id: (e as { id: string }).id, pipeline: pid };
      pos += 1000;
    }
  }

  // Imóveis reais do site
  const brutos = JSON.parse(fs.readFileSync(IMOVEIS_JSON, "utf8")) as ImovelJson[];
  const captadores: Chave[] = ["marco", "cristian", "rodrigo", "luana", "paulo"];
  const linhas = brutos.map((i, n) => linhaDeImovel(i, orgId, usuarios[captadores[n % captadores.length]!]!));
  const imoveis = await q(admin.from("imoveis").insert(linhas).select("*"), "imóveis");
  type ImovelRow = (typeof linhas)[number] & { id: string };
  const acervo = imoveis as ImovelRow[];
  console.info("imóveis", acervo.length);

  // Três imóveis de alto padrão viram off market (o da proposta do Otávio e mais dois).
  const offMarket = new Set<string>();
  const usados = new Set<string>();
  const escolher = (c: LeadDemo["imovel"]): ImovelRow => {
    const cand = acervo.filter(
      (i) =>
        i.preco_venda_cents &&
        (!c.regiao || i.regiao === c.regiao) &&
        (!c.bairro || i.bairro === c.bairro) &&
        (!c.minSuites || (i.suites ?? 0) >= c.minSuites) &&
        (!c.minPreco || (i.preco_venda_cents ?? 0) >= c.minPreco * 100) &&
        (!c.maxPreco || (i.preco_venda_cents ?? 0) <= c.maxPreco * 100),
    );
    const livre = cand.find((i) => !usados.has(i.codigo)) ?? cand[0] ?? acervo[0]!;
    usados.add(livre.codigo);
    return livre;
  };

  // Leads com conversa
  let extId = 0;
  for (const [n, l] of LEADS.entries()) {
    const imovel = escolher(l.imovel);
    if (l.offMarket) offMarket.add(imovel.codigo);
    const corretor = usuarios[l.corretor]!;
    const sessao = sessoes[l.corretor]!;
    const primeira = Math.max(...l.conversa.map((f) => f[2]));
    const ultima = Math.min(...l.conversa.map((f) => f[2]));

    const contato = await q(
      admin
        .from("contacts")
        .insert({
          organization_id: orgId, name: l.nome, display_name: l.nome, phone_number: l.tel,
          source: l.origem,
          consent: { marketing: true, origem: l.origem }, created_at: ha(primeira + 5), last_activity_at: ha(ultima),
        })
        .select("id")
        .single(),
      `contato ${l.nome}`,
    );
    const contactId = (contato as { id: string }).id;

    const conv = await q(
      admin
        .from("conversations")
        .insert({
          organization_id: orgId, contact_id: contactId, channel_session_id: sessao, channel: "whatsapp",
          status: "open", assigned_to_user_id: corretor, assignee_kind: "user", assigned_at: ha(primeira),
          last_message_at: ha(ultima), last_message_preview: l.conversa.at(-1)![1].slice(0, 120),
          last_inbound_at: ha(Math.min(...l.conversa.filter((f) => f[0] === "L").map((f) => f[2]), primeira)),
          last_outbound_at: l.conversa.some((f) => f[0] === "C")
            ? ha(Math.min(...l.conversa.filter((f) => f[0] === "C").map((f) => f[2])))
            : null,
          unread_count_for_assignee: l.conversa.at(-1)![0] === "L" ? 1 : 0,
          created_at: ha(primeira),
        })
        .select("id")
        .single(),
      `conversa ${l.nome}`,
    );
    const convId = (conv as { id: string }).id;

    const mensagens = l.conversa.map(([quem, texto, min]) => ({
      organization_id: orgId, conversation_id: convId, channel_session_id: sessao, contact_id: contactId,
      external_id: `demo-opa-${++extId}`, type: "text",
      direction: quem === "L" ? "inbound" : "outbound",
      status: quem === "L" ? "delivered" : "read",
      sent_via: "external_device",
      sent_by_user_id: quem === "L" ? null : corretor,
      body: texto, sent_at: ha(min), created_at: ha(min),
    }));
    await q(admin.from("messages").insert(mensagens), `mensagens ${l.nome}`);

    // Copiloto lê a conversa.
    const lidas: MensagemLida[] = mensagens.map((m) => ({ direction: m.direction as "inbound" | "outbound", body: m.body }));
    const leitura = analisarPorRegras(lidas, {
      nomeLead: l.nome, imovelTitulo: imovel.titulo, imovelValor: imovel.preco_venda_cents ? imovel.preco_venda_cents / 100 : null,
    });
    const confirmados = new Set(l.confirmados ?? []);
    const campos: Record<string, string> = { ...(l.jaPreenchido ?? {}) };
    for (const s of leitura.sugestoes) if (confirmados.has(s.campo)) campos[s.campo] = s.valor;

    const etapa = etapas[`compradores/${l.etapa}`]!;
    const lead = await q(
      admin
        .from("crm_leads")
        .insert({
          organization_id: orgId, pipeline_id: etapa.pipeline, stage_id: etapa.id, contact_id: contactId,
          title: `${l.nome} · ${imovel.codigo}`, status: "open", position_in_stage: (n + 1) * 1000,
          value_cents: imovel.preco_venda_cents, currency: "BRL",
          owner_user_id: corretor, owner_kind: "user", assigned_at: ha(primeira),
          last_activity_at: ha(ultima), stage_changed_at: ha(Math.round((primeira + ultima) / 2)),
          source: l.origem,
          tags: [l.origem === "meta" ? "pago" : "organico", ...(l.offMarket ? ["off-market-comprador"] : [])],
          custom_fields: {
            opa: campos,
            imovel_codigo: imovel.codigo,
            imoveis_interesse: [imovel.codigo],
            origem: {
              canal: l.origem,
              campanha: l.campanha ?? null,
              conjunto: l.campanha ? "Interesse Ilhabela 35-60" : null,
              anuncio: l.campanha ? `Vídeo ${imovel.bairro ?? "casa"}` : null,
            },
            copiloto: {
              resumo: leitura.resumo, proximoPasso: leitura.proximoPasso,
              temperatura: leitura.temperatura, motor: leitura.motor, analisado_em: new Date().toISOString(),
            },
          },
          created_at: ha(primeira + 5),
        })
        .select("id")
        .single(),
      `lead ${l.nome}`,
    );
    const leadId = (lead as { id: string }).id;

    const sugestoes = leitura.sugestoes.map((s) => ({
      organization_id: orgId, lead_id: leadId, campo: s.campo, valor: s.valor, evidencia: s.evidencia,
      confianca: s.confianca, status: confirmados.has(s.campo) ? "aceita" : "pendente",
      decidido_por: confirmados.has(s.campo) ? corretor : null,
      decidido_em: confirmados.has(s.campo) ? ha(ultima) : null,
    }));
    if (sugestoes.length) await q(admin.from("copiloto_sugestoes").insert(sugestoes), `sugestões ${l.nome}`);
    console.info(`lead ${l.nome}: ${imovel.codigo}, ${sugestoes.length} sugestões`);
  }

  // Off market no acervo.
  for (const i of acervo.filter((x) => !usados.has(x.codigo) && (x.suites ?? 0) >= 4).slice(0, 2)) offMarket.add(i.codigo);
  await q(
    admin.from("imoveis").update({ off_market: true }).eq("organization_id", orgId).in("codigo", [...offMarket]),
    "off market",
  );

  // Vendas no histórico: uma nos últimos 7 dias, outra há 20 dias.
  const etapaVendido = etapas["compradores/vendido"]!;
  const vendas = [
    { nome: "Patrícia Moreau", tel: "+5511984410021", corretor: "marco" as Chave, dias: 3, regiao: "Sul" },
    { nome: "Eduardo Lins", tel: "+5511983309912", corretor: "cristian" as Chave, dias: 20, regiao: "Norte" },
  ];
  for (const v of vendas) {
    const im = escolher({ regiao: v.regiao, minSuites: 3 });
    const fechado = ha(v.dias * 24 * 60);
    const contato = await q(
      admin
        .from("contacts")
        .insert({ organization_id: orgId, name: v.nome, display_name: v.nome, phone_number: v.tel, source: "site" })
        .select("id")
        .single(),
      `contato ${v.nome}`,
    );
    const vgv = im.preco_venda_cents ?? 0;
    await q(
      admin.from("crm_leads").insert({
        organization_id: orgId, pipeline_id: etapaVendido.pipeline, stage_id: etapaVendido.id,
        contact_id: (contato as { id: string }).id, title: `${v.nome} · ${im.codigo}`, status: "won",
        closed_at: fechado, value_cents: vgv, currency: "BRL", owner_user_id: usuarios[v.corretor], owner_kind: "user",
        source: "site", tags: ["organico"], created_at: ha((v.dias + 40) * 24 * 60),
        custom_fields: {
          opa: { finalidade: "Moradia", regiao: v.regiao, momento: "Agora (até 3 meses)", inegociavel: "Vista para o mar" },
          imovel_codigo: im.codigo,
          imoveis_interesse: [im.codigo],
          origem: { canal: "site" },
          venda: {
            imovel_codigo: im.codigo, vgv_cents: vgv, valor_pedido_cents: vgv, outro_valor: false,
            comissao_cents: Math.round(vgv * 0.03), data: fechado.slice(0, 10),
          },
        },
      }),
      `venda ${v.nome}`,
    );
    await q(admin.from("imoveis").update({ status: "vendido" }).eq("id", im.id), `vendido ${im.codigo}`);
  }

  // Pela porta de entrada (a mesma do site): a Renata, que já é da Luana, volta
  // por outro formulário e não passa pela roleta; um lead novo passa por ela.
  const outro = escolher({ regiao: "Centro e Vila", minSuites: 3 });
  const volta = await registrarEntrada(admin, orgId, {
    nome: "Renata Fontes", telefone: "(11) 98554-4478", imovelCodigo: outro.codigo, origem: "meta",
    campanha: CAMP_COMPRA, conjunto: "Interesse Ilhabela 35-60", anuncio: `Vídeo ${outro.bairro ?? "casa"}`, em: ha(40),
  });
  console.info("entrada Renata:", volta.tipo);
  const novo = escolher({ regiao: "Sul" });
  const roleta = await registrarEntrada(admin, orgId, {
    nome: "Bruno Câmara", telefone: "(11) 97720-1188", imovelCodigo: novo.codigo, origem: "site", em: ha(25),
  });
  console.info("entrada Bruno:", roleta.tipo, "para", EQUIPE.find((p) => usuarios[p.chave] === roleta.donoId)?.nome);

  // Captação e relacionamento com proprietário (pipelines do protótipo).
  const proprietarios = [
    {
      nome: "Lúcia Bastos", tel: "+5512988148814", corretor: "luana" as Chave, funil: "captacao", etapa: "visita-avaliacao",
      off: true, campos: { quem: "Herdeiro ou família", tipo: "Casa", endereco: "Av. Riachuelo, 1.480", bairro: "Praia Grande", motivo: "Inventário", exclusividade: "A negociar", documentacao: "Em inventário" },
      valor: 320_000_000, origem: "radar",
    },
    {
      nome: "Carlos Menezes", tel: "+5512987771020", corretor: "marco" as Chave, funil: "captacao", etapa: "contato",
      off: false, campos: { quem: "Dono", tipo: "Casa", bairro: "Portinho", motivo: "Mudança" }, valor: 280_000_000, origem: "site",
    },
    {
      nome: "Oportunidade · Casa no Centro", tel: "+5512986660001", corretor: "luana" as Chave, funil: "captacao", etapa: "radar",
      off: false, campos: { tipo: "Casa", bairro: "Centro (Vila)" }, valor: 350_000_000, origem: "radar",
    },
    {
      nome: "Oportunidade · Casa na Barra Velha", tel: "+5512986660002", corretor: "cristian" as Chave, funil: "captacao", etapa: "radar",
      off: false, campos: { tipo: "Casa", bairro: "Barra Velha" }, valor: 270_000_000, origem: "radar",
    },
    {
      nome: "Roberto Salles", tel: "+5512985550303", corretor: "rodrigo" as Chave, funil: "relacionamento", etapa: "observacao",
      off: false, campos: { quem: "Dono", tipo: "Casa em condomínio", bairro: "Engenho d'Água", exclusividade: "Sim" }, valor: 410_000_000, origem: "indicacao",
    },
  ];
  for (const [n, pr] of proprietarios.entries()) {
    const etapa = etapas[`${pr.funil}/${pr.etapa}`]!;
    const contato = await q(
      admin.from("contacts").insert({ organization_id: orgId, name: pr.nome, display_name: pr.nome, phone_number: pr.tel, source: pr.origem }).select("id").single(),
      `contato ${pr.nome}`,
    );
    await q(
      admin.from("crm_leads").insert({
        organization_id: orgId, pipeline_id: etapa.pipeline, stage_id: etapa.id, contact_id: (contato as { id: string }).id,
        title: pr.nome, status: "open", value_cents: pr.valor, currency: "BRL", owner_user_id: usuarios[pr.corretor], owner_kind: "user",
        source: pr.origem, tags: ["organico", ...(pr.off ? ["off-market-proprietario"] : [])], position_in_stage: (n + 1) * 1000,
        created_at: ha((n + 2) * 24 * 60), last_activity_at: ha((n + 1) * 12 * 60),
        custom_fields: { origem: { canal: pr.origem }, campos_corretor: pr.campos, respondido_em: ha(60), imoveis_interesse: [] },
      }),
      `proprietário ${pr.nome}`,
    );
  }

  // Visitas e uma mensagem agendada, para as abas da ficha e a tela de lembretes.
  const leadDe = async (nome: string) =>
    (await q(admin.from("crm_leads").select("id, owner_user_id, custom_fields").eq("organization_id", orgId).like("title", `${nome}%`).single(), `lead ${nome}`)) as {
      id: string; owner_user_id: string; custom_fields: { imovel_codigo?: string };
    };
  const sofia = await leadDe("Sofia Albuquerque");
  await q(
    admin.from("visitas").insert({
      organization_id: orgId, lead_id: sofia.id, imovel_codigo: sofia.custom_fields.imovel_codigo, status: "feita", quando: ha(22 * 60),
      quem: "Sofia e o marido", chegada: "Balsa, de carro", interesse: 4, gostou: "A vista e a varanda", nao_gostou: "Cozinha pequena",
      objecao: "Reforma da cozinha", proximo_passo: "Fazer proposta", registrada_por: sofia.owner_user_id,
    }),
    "visita Sofia",
  );
  const paula = await leadDe("Paula Siqueira");
  await q(
    admin.from("visitas").insert({
      organization_id: orgId, lead_id: paula.id, imovel_codigo: paula.custom_fields.imovel_codigo, status: "agendada",
      quando: new Date(agora + 2 * 24 * 60 * MIN).toISOString(), registrada_por: paula.owner_user_id,
    }),
    "visita Paula",
  );
  const gustavo = await leadDe("Gustavo Rangel");
  await q(
    admin.from("lembretes_agendados").insert({
      organization_id: orgId, lead_id: gustavo.id, para_user_id: gustavo.owner_user_id, quando: new Date(agora + 20 * 60 * MIN).toISOString(),
      mensagem: "Gustavo, conseguiu conversar com sua esposa? Tenho sábado de manhã livre para mostrar a casa.", origem: "manual",
      criado_por: gustavo.owner_user_id,
    }),
    "agendada Gustavo",
  );

  console.info(`\nPronto. Entrar com marco@opa.local (gestor) ou luana@opa.local (corretora), senha ${SENHA}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
