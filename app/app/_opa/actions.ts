"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig } from "@/lib/opa/config";
import { carregarLeads } from "@/lib/opa/dados";
import { normalizarTelefone, registrarEntrada, type Entrada } from "@/lib/opa/entrada";
import { faltaNaFicha } from "@/lib/opa/visita";
import { createAdminClient } from "@/lib/supabase/admin";

import { registrarVisita, type ResultadoEtapa } from "../leads/actions";

/**
 * "Novo lead" do cabeçalho: começa pelo celular e avisa se o número já existe
 * (telefone único). Corretor cria lead próprio dele; gerente e administrador
 * escolhem o corretor ou deixam a roleta decidir.
 */

export type NumeroExistente =
  | { existe: false }
  | { existe: true; meu: boolean; leadId: string | null; nome: string | null; dono: string | null };

/** Estas ações usam o client admin (a entrada passa pela roleta), então o papel é checado aqui. */
async function contexto() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) throw new Error("Sem organização ativa.");
  if (org.role === "viewer") throw new Error("Seu acesso é só de leitura.");
  return { user, org, gestor: org.role === "manager" || org.role === "admin" };
}

export async function verificarTelefone(telefone: string): Promise<NumeroExistente> {
  const { user, org, gestor } = await contexto();
  if (telefone.replace(/\D/g, "").length < 10) return { existe: false };
  const admin = createAdminClient();
  const { data: contato } = await admin
    .from("contacts")
    .select("id, name")
    .eq("organization_id", org.orgId)
    .eq("phone_number", normalizarTelefone(telefone))
    .is("is_merged_into", null)
    .maybeSingle();
  if (!contato) return { existe: false };
  const c = contato as { id: string; name: string | null };
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, owner_user_id")
    .eq("organization_id", org.orgId)
    .eq("contact_id", c.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const l = lead as { id: string; owner_user_id: string | null } | null;
  const meu = l?.owner_user_id === user.id;
  let dono: string | null = null;
  if (l?.owner_user_id) {
    const { data: u } = await admin.auth.admin.getUserById(l.owner_user_id);
    dono = (u.user?.user_metadata?.full_name as string | undefined) ?? null;
  }
  // O corretor só abre o lead se for dele; o nome do corretor que atende
  // aparece para ele saber com quem falar. O nome do contato e a conversa,
  // não (senão a busca por telefone vira jeito de listar a base dos colegas).
  const vePessoa = meu || gestor;
  return { existe: true, meu, leadId: vePessoa ? (l?.id ?? null) : null, nome: vePessoa ? (c.name ?? "Contato") : null, dono };
}

export type ResultadoNovoLead = { ok: true; leadId: string; voltou: boolean } | { ok: false; erro: string };

export async function criarLeadManual(formData: FormData): Promise<ResultadoNovoLead> {
  const { user, org, gestor } = await contexto();
  const nome = String(formData.get("nome") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const imovel = String(formData.get("imovel") ?? "").trim() || null;
  const origem = String(formData.get("origem") ?? "whatsapp") as Entrada["origem"];
  const escolhido = String(formData.get("dono") ?? "").trim();
  if (!nome) return { ok: false, erro: "Escreva o nome." };
  if (telefone.replace(/\D/g, "").length < 10) return { ok: false, erro: "Telefone com DDD." };

  // Atendente não mexe em lead de colega: se o número já tem dono, só avisa.
  if (!gestor) {
    const existente = await verificarTelefone(telefone);
    if (existente.existe && !existente.meu) {
      return { ok: false, erro: `Esse número já é atendido${existente.dono ? ` por ${existente.dono}` : " por outro corretor"}.` };
    }
  }
  if (!["meta", "site", "whatsapp", "linkbio", "indicacao"].includes(origem)) return { ok: false, erro: "Origem inválida." };
  if (gestor && escolhido) {
    const { data: membro } = await createAdminClient()
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", org.orgId)
      .eq("user_id", escolhido)
      .is("revoked_at", null)
      .maybeSingle();
    if (!membro) return { ok: false, erro: "Esse corretor não é da equipe." };
  }

  // Atendente: o lead é dele (lead próprio). Gestor: o escolhido, ou a roleta.
  const dono = gestor ? escolhido || undefined : user.id;
  const r = await registrarEntrada(createAdminClient(), org.orgId, {
    nome,
    telefone,
    imovelCodigo: imovel,
    origem,
    dono,
    proprio: !gestor || Boolean(escolhido),
  });
  revalidatePath("/app/hoje");
  revalidatePath("/app/fila");
  revalidatePath("/app/leads");
  return { ok: true, leadId: r.leadId, voltou: r.tipo !== "novo" };
}

// ---------------------------------------------------------------- ficha de visita rápida

export interface LeadParaVisita {
  id: string;
  nome: string;
  final: string;
  imovel: string | null;
  etapa: string;
}

/**
 * Busca da ficha de visita: só os leads que a pessoa já pode ver (a lista vem
 * pela sessão, com a RLS), por nome, telefone ou código do imóvel.
 */
export async function buscarLeadsVisita(q: string): Promise<LeadParaVisita[]> {
  const { org } = await contexto();
  const termo = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  if (termo.length < 2) return [];
  const leads = await carregarLeads(org.orgId, { funil: "todos" });
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return leads
    .filter(
      (l) =>
        sem(l.nome).includes(termo) ||
        (digitos.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos)) ||
        l.imoveisInteresse.some((c) => c.toLowerCase().includes(termo)),
    )
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open"))
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      final: (l.telefone ?? "").replace(/\D/g, "").slice(-4),
      imovel: l.imovelCodigo,
      etapa: l.status === "open" ? l.etapa.nome : l.status === "won" ? "Ganho" : "Perdido",
    }));
}

export type ResultadoVisitaRapida = (ResultadoEtapa & { leadId?: string; criado?: boolean });

/**
 * Ficha de visita de qualquer tela (adaptada do Painel/Studio): lead cadastrado
 * é puxado pela busca; quem não está no CRM é indicado com nome e celular e
 * vira lead do corretor na hora. Corretor não registra visita em lead de colega.
 */
export async function registrarVisitaRapida(formData: FormData): Promise<ResultadoVisitaRapida> {
  const { user, org, gestor } = await contexto();
  let leadId = String(formData.get("leadId") ?? "").trim();
  let criado = false;

  // Confere a ficha antes de criar lead novo (senão um erro de campo deixava lead órfão).
  if (!String(formData.get("imovel") ?? "")) return { ok: false, erro: "Escolha o imóvel visitado." };
  if (!String(formData.get("quando") ?? "")) return { ok: false, erro: "Informe a data e a hora." };
  // Os campos obrigatórios de Configurações > Ficha de visita, também antes de criar o lead.
  const faltou = faltaNaFicha((await carregarConfig(createAdminClient(), org.orgId)).ficha_visita, (k) => String(formData.get(k) ?? ""), "feita");
  if (faltou) return { ok: false, erro: faltou };

  if (!leadId) {
    const nome = String(formData.get("nome") ?? "").trim();
    const telefone = String(formData.get("telefone") ?? "").trim();
    const origem = String(formData.get("origem") ?? "indicacao") as Entrada["origem"];
    if (nome.length < 2) return { ok: false, erro: "Escreva o nome de quem visitou." };
    if (telefone.replace(/\D/g, "").length < 10) return { ok: false, erro: "Celular com DDD." };
    if (!["meta", "site", "whatsapp", "linkbio", "indicacao"].includes(origem)) return { ok: false, erro: "Origem inválida." };
    const existente = await verificarTelefone(telefone);
    if (existente.existe) {
      if (!existente.meu && !gestor) {
        return { ok: false, erro: `Esse cliente já é atendido${existente.dono ? ` por ${existente.dono}` : " por outro corretor"}.` };
      }
      if (!existente.leadId) return { ok: false, erro: "Esse número já está no CRM. Procure pelo nome." };
      leadId = existente.leadId;
    } else {
      const r = await registrarEntrada(createAdminClient(), org.orgId, {
        nome,
        telefone,
        origem,
        imovelCodigo: String(formData.get("imovel") ?? "") || null,
        dono: user.id,
        proprio: true,
      });
      leadId = r.leadId;
      criado = true;
    }
  }

  formData.set("leadId", leadId);
  formData.set("status", "feita");
  const r = await registrarVisita(formData);
  revalidatePath("/app/hoje");
  revalidatePath("/app/leads");
  return { ...r, leadId, criado };
}
