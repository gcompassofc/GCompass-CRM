"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { TAMANHO_MAX_DO_AVISO, enviarAvisoManual, fraseDoResultado } from "@/lib/opa/aviso-manual";
import { mesclarCampos } from "@/lib/opa/campos";
import { carregarConfig, salvarConfig, type RegraLembrete, type Trilha } from "@/lib/opa/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Ações da tela Lembretes e cadência. Regra é configuração da conta: só
 * gerente e administrador mexem. Agendar mensagem e religar aviso de um lead
 * vale para quem vê o lead (o RLS de crm_leads decide).
 */

async function contexto() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) throw new Error("Sem organização ativa.");
  return { user, org, gestor: org.role === "manager" || org.role === "admin", supabase: await createClient() };
}

/**
 * Aviso escrito na hora, pelo OPA Lembretes, para quem da equipe o gestor escolher
 * (Agenda > Enviados, 10/11/2026). Só gerente e administrador. A mensagem fica gravada
 * com quem mandou; aqui só volta o resumo para a tela.
 */
export async function mandarAviso(formData: FormData): Promise<{ ok: true; enviados: number; falhas: string[] } | { ok: false; erro: string }> {
  const { user, org, gestor } = await contexto();
  if (!gestor) return { ok: false, erro: "Só o gestor manda aviso pelo OPA Lembretes." };
  const texto = String(formData.get("texto") ?? "").trim();
  const para = formData.getAll("para").map(String).filter(Boolean);
  if (!texto) return { ok: false, erro: "Escreva a mensagem." };
  if (texto.length > TAMANHO_MAX_DO_AVISO) return { ok: false, erro: `A mensagem passa de ${TAMANHO_MAX_DO_AVISO} caracteres.` };
  if (!para.length) return { ok: false, erro: "Escolha quem recebe." };
  if (para.length > 30) return { ok: false, erro: "Muita gente de uma vez: até 30 pessoas." };

  const resultados = await enviarAvisoManual(createAdminClient(), { orgId: org.orgId, autorId: user.id, paraIds: para, texto });
  if (!resultados.length) return { ok: false, erro: "Ninguém da lista está na equipe." };
  revalidatePath("/app/lembretes");
  return {
    ok: true,
    enviados: resultados.filter((r) => r.resultado === "enviado").length,
    falhas: resultados.filter((r) => r.resultado !== "enviado").map((r) => `${r.nome.split(/\s+/)[0]}: ${fraseDoResultado(r.resultado)}.`),
  };
}

async function regras(orgId: string): Promise<RegraLembrete[]> {
  return (await carregarConfig(createAdminClient(), orgId)).lembretes;
}

async function gravarRegras(orgId: string, lista: RegraLembrete[]) {
  await salvarConfig(createAdminClient(), orgId, { lembretes: lista });
  revalidatePath("/app/lembretes");
}

export async function alternarRegra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { org, gestor } = await contexto();
  if (!gestor) return;
  const lista = await regras(org.orgId);
  await gravarRegras(
    org.orgId,
    lista.map((r) => (r.id === id ? { ...r, ativa: !r.ativa } : r)),
  );
}

export async function editarRegra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { org, gestor } = await contexto();
  if (!gestor) return;
  const campo = (k: string) => String(formData.get(k) ?? "").trim();
  const lista = await regras(org.orgId);
  await gravarRegras(
    org.orgId,
    lista.map((r) =>
      r.id === id
        ? {
            ...r,
            etapa: campo("etapa") || r.etapa,
            quando: campo("quando") || r.quando,
            oQue: campo("oQue") || r.oQue,
            para: campo("para") || r.para,
          }
        : r,
    ),
  );
}

export async function novaRegra(formData: FormData) {
  const { org, gestor } = await contexto();
  if (!gestor) return;
  const campo = (k: string) => String(formData.get(k) ?? "").trim();
  const trilha = campo("trilha") as Trilha;
  if (!["pago", "organico", "cadencia", "captacao"].includes(trilha) || !campo("etapa") || !campo("oQue")) return;
  const lista = await regras(org.orgId);
  await gravarRegras(org.orgId, [
    ...lista,
    {
      id: `${trilha}-${Date.now().toString(36)}`,
      trilha,
      etapa: campo("etapa"),
      quando: campo("quando") || "Na hora",
      oQue: campo("oQue"),
      para: campo("para") || "Corretor",
      ativa: true,
    },
  ]);
}

export async function excluirRegra(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { org, gestor } = await contexto();
  if (!gestor) return;
  const lista = await regras(org.orgId);
  await gravarRegras(
    org.orgId,
    lista.filter((r) => r.id !== id),
  );
}

export type ResultadoAgendar = { ok: true } | { ok: false; erro: string };

/**
 * Agenda uma mensagem. "para_lead" sai do WhatsApp do corretor para o lead;
 * "para_corretor" sai do OPA Lembretes para o próprio corretor. O envio de
 * verdade liga com a Evolution/WAHA; até lá a linha fica pendente na fila.
 */
export async function agendarMensagem(formData: FormData): Promise<ResultadoAgendar> {
  const { user, org, supabase } = await contexto();
  const leadId = String(formData.get("leadId") ?? "") || null;
  const quandoLocal = String(formData.get("quando") ?? "");
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  const destino = String(formData.get("destino") ?? "para_lead");
  if (!mensagem) return { ok: false, erro: "Escreva a mensagem." };
  if (!quandoLocal) return { ok: false, erro: "Escolha o dia e a hora." };
  if (destino === "para_lead" && !leadId) return { ok: false, erro: "Escolha o lead." };
  // datetime-local chega sem fuso: é horário de Ilhabela.
  const quando = new Date(`${quandoLocal}:00-03:00`);
  if (Number.isNaN(quando.getTime())) return { ok: false, erro: "Data inválida." };
  if (quando.getTime() < Date.now() - 60_000) return { ok: false, erro: "Escolha um horário daqui para a frente." };

  const { error } = await supabase.from("lembretes_agendados").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    para_user_id: user.id,
    quando: quando.toISOString(),
    mensagem,
    origem: destino === "para_corretor" ? "para_corretor" : "para_lead",
    criado_por: user.id,
  });
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/app/lembretes");
  if (leadId) revalidatePath(`/app/leads/${leadId}`);
  return { ok: true };
}

export async function cancelarAgendada(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { org, supabase } = await contexto();
  await supabase
    .from("lembretes_agendados")
    .update({ status: "cancelado" })
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .eq("status", "pendente");
  revalidatePath("/app/lembretes");
}

export async function religarLembretes(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const { org, supabase } = await contexto();
  // Só as duas chaves saem; o resto do lead não é relido nem regravado (E1).
  await mesclarCampos(supabase, leadId, {}, { remover: ["lembretes_desligados", "lembretes_desligados_em"], orgId: org.orgId });
  revalidatePath("/app/lembretes");
  revalidatePath(`/app/leads/${leadId}`);
}
