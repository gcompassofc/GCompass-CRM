"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import {
  carregarConfig,
  numeroDeAviso,
  salvarConfig,
  type CampoLead,
  type CampoVisita,
  type ConfigOpa,
  type DiaAtendimento,
} from "@/lib/opa/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Configurações da conta da imobiliária (organizations.settings.opa).
 * Todas conferem o papel antes: só gerente e administrador gravam.
 */

async function gestor() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) {
    throw new Error("Só gestor ou administrador muda as configurações.");
  }
  const admin = createAdminClient();
  return { orgId: org.orgId, admin, config: await carregarConfig(admin, org.orgId) };
}

async function gravar(orgId: string, parcial: Partial<ConfigOpa>) {
  await salvarConfig(createAdminClient(), orgId, parcial);
  revalidatePath("/app/configuracoes");
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numero = (fd: FormData, k: string, padrao: number) => {
  const n = Number(texto(fd, k));
  return Number.isFinite(n) && n > 0 ? n : padrao;
};

function mover<T>(lista: T[], i: number, direcao: number): T[] {
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j]!, nova[i]!];
  return nova;
}

// ---------------------------------------------------------------- roleta

/** Sobe ou desce um corretor na roleta de leads ou na de captação. */
export async function moverNaRoleta(formData: FormData) {
  const { orgId, config } = await gestor();
  const qual = texto(formData, "roleta");
  const id = texto(formData, "id");
  const direcao = texto(formData, "direcao") === "subir" ? -1 : 1;
  const ordemBase = texto(formData, "ordem").split(",").filter(Boolean);
  if (qual === "captacao") {
    const ordem = config.captacao.ordem.length ? config.captacao.ordem : ordemBase;
    await gravar(orgId, { captacao: { ...config.captacao, ordem: mover(ordem, ordem.indexOf(id), direcao) } });
  } else {
    const ordem = config.roleta.length ? config.roleta : ordemBase;
    await gravar(orgId, { roleta: mover(ordem, ordem.indexOf(id), direcao) });
  }
}

/**
 * Liga ou desliga um corretor da roleta de leads (fica na ordem, mas pula a vez).
 * Quem ainda não está na ordem (entrou na equipe depois que a ordem foi salva)
 * entra no fim da fila, já valendo (#562, 07/11/2026: Luana, Cristian e Paulo
 * Martin estavam na Equipe e não apareciam na roleta).
 */
export async function alternarNaRoleta(formData: FormData) {
  const { orgId, admin, config } = await gestor();
  const id = texto(formData, "id");
  const ordemBase = texto(formData, "ordem").split(",").filter(Boolean);
  const ordem = config.roleta.length ? config.roleta : ordemBase;
  const pausados = new Set(config.roleta_pausados);
  if (!ordem.includes(id)) {
    // Só membro ativo da empresa, e não quem só lê.
    const { data: membro } = await admin
      .from("user_organizations")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", id)
      .is("revoked_at", null)
      .maybeSingle();
    const papel = (membro as { role: string } | null)?.role;
    if (!papel || papel === "viewer") throw new Error("Só quem atende pode entrar na roleta.");
    pausados.delete(id);
    await gravar(orgId, { roleta: [...ordem, id], roleta_pausados: [...pausados] });
    return;
  }
  if (pausados.has(id)) pausados.delete(id);
  else pausados.add(id);
  await gravar(orgId, {
    roleta: ordem,
    roleta_pausados: [...pausados],
  });
}

// ---------------------------------------------------------------- boas-vindas

/** Liga ou desliga a boas-vindas automática pelo WhatsApp do corretor (#498, D6). */
export async function alternarBoasVindas() {
  const { orgId, config } = await gestor();
  await gravar(orgId, { boas_vindas: { ...config.boas_vindas, ligada: !config.boas_vindas.ligada } });
}

/** Quebras de linha guardadas (até um parágrafo em branco), sem espaço sobrando. */
function textoEmParagrafos(v: string): string {
  return v.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Como cada corretor assina a boas-vindas (uma palavra, sem travessão) e o texto próprio dele. */
export async function salvarAssinaturas(formData: FormData) {
  const { orgId, config } = await gestor();
  const assinaturas: Record<string, string> = {};
  const modelos: Record<string, string> = { ...(config.boas_vindas.modelos ?? {}) };
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("assina_")) {
      const nome = String(v).trim().replace(/[\u2013\u2014]/g, "").slice(0, 40);
      if (nome) assinaturas[k.slice(7)] = nome;
    } else if (k.startsWith("texto_")) {
      const t = textoEmParagrafos(String(v));
      if (t.length > 600) throw new Error("Texto próprio com até 600 caracteres.");
      if (/[\u2013\u2014]/.test(t)) throw new Error("Sem travessão: use vírgula, ponto ou dois-pontos.");
      modelos[k.slice(6)] = t;
    }
  }
  await gravar(orgId, { boas_vindas: { ...config.boas_vindas, assinaturas, modelos } });
}

/** Texto da boas-vindas. Vazio volta ao texto da casa. */
export async function salvarModeloBoasVindas(formData: FormData) {
  const { orgId, config } = await gestor();
  const modelo = textoEmParagrafos(texto(formData, "modelo"));
  if (modelo.length > 600) throw new Error("Texto com até 600 caracteres.");
  if (/[\u2013\u2014]/.test(modelo)) throw new Error("Sem travessão: use vírgula, ponto ou dois-pontos.");
  await gravar(orgId, { boas_vindas: { ...config.boas_vindas, modelo } });
}

// ---------------------------------------------------------------- quem recebe os avisos

/**
 * Números de WhatsApp que recebem os avisos da gestão e da administração, um por
 * linha (10/11/2026). Lista vazia volta à regra por papel: gerente e administrador,
 * pelo número que cada um conectou no CRM.
 */
export async function salvarDestinosDosAvisos(formData: FormData) {
  const { orgId } = await gestor();
  const ler = (campo: string): string[] => {
    const linhas = texto(formData, campo)
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length > 10) throw new Error("Até 10 números em cada lista.");
    const numeros: string[] = [];
    for (const linha of linhas) {
      const n = numeroDeAviso(linha);
      if (!n) throw new Error(`Número inválido: "${linha}". Use DDD e número, como 12 99999-0000.`);
      if (!numeros.includes(n)) numeros.push(n);
    }
    return numeros;
  };
  await gravar(orgId, { avisos: { gestor: ler("gestor"), admin: ler("admin") } });
}

export async function salvarPrazos(formData: FormData) {
  const { orgId, config } = await gestor();
  await gravar(orgId, {
    prazos: {
      ...config.prazos,
      pago_min: numero(formData, "pago_min", config.prazos.pago_min),
      organico_min: numero(formData, "organico_min", config.prazos.organico_min),
    },
    volta_dias: numero(formData, "volta_dias", config.volta_dias),
  });
}

export async function salvarCaptacao(formData: FormData) {
  const { orgId, config } = await gestor();
  await gravar(orgId, {
    captacao: {
      ...config.captacao,
      por_semana: numero(formData, "por_semana", config.captacao.por_semana),
      devolutiva_dias: numero(formData, "devolutiva_dias", config.captacao.devolutiva_dias),
      cadastro_dias: numero(formData, "cadastro_dias", config.captacao.cadastro_dias),
      tentativas: numero(formData, "tentativas", config.captacao.tentativas),
    },
  });
}

// ---------------------------------------------------------------- etiquetas

export async function adicionarEtiqueta(formData: FormData) {
  const { orgId, config } = await gestor();
  const grupo = texto(formData, "grupo");
  const valor = texto(formData, "valor");
  if (!valor) return;
  await gravar(orgId, {
    etiquetas: config.etiquetas.map((g) =>
      g.chave === grupo && !g.opcoes.includes(valor) ? { ...g, opcoes: [...g.opcoes, valor] } : g,
    ),
  });
}

export async function removerEtiqueta(formData: FormData) {
  const { orgId, config } = await gestor();
  const grupo = texto(formData, "grupo");
  const valor = texto(formData, "valor");
  await gravar(orgId, {
    etiquetas: config.etiquetas.map((g) =>
      g.chave === grupo
        ? {
            ...g,
            opcoes: g.opcoes.filter((o) => o !== valor),
            subgrupos: g.subgrupos
              ? Object.fromEntries(Object.entries(g.subgrupos).map(([r, os]) => [r, os.filter((o) => o !== valor)]))
              : undefined,
          }
        : g,
    ),
  });
}

// ---------------------------------------------------------------- campos do lead

function lerOpcoes(fd: FormData): string[] | undefined {
  const ops = texto(fd, "opcoes")
    .split(/[,;\n]/)
    .map((o) => o.trim())
    .filter(Boolean);
  return ops.length ? ops : undefined;
}

function chaveDe(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export async function adicionarCampo(formData: FormData) {
  const { orgId, config } = await gestor();
  const lista = texto(formData, "lista") === "proprietario" ? "campos_proprietario" : "campos_lead";
  const rotulo = texto(formData, "rotulo");
  if (!rotulo) return;
  const opcoes = lerOpcoes(formData);
  const tipoPedido = texto(formData, "tipo") as CampoLead["tipo"];
  const tipo: CampoLead["tipo"] = opcoes ? "lista" : tipoPedido === "area" ? "area" : "texto";
  const atual = config[lista];
  let chave = chaveDe(rotulo) || `campo_${atual.length + 1}`;
  if (atual.some((c) => c.chave === chave)) chave = `${chave}_${atual.length + 1}`;
  await gravar(orgId, { [lista]: [...atual, { chave, rotulo, tipo, opcoes, dica: texto(formData, "dica") || undefined }] });
}

export async function removerCampo(formData: FormData) {
  const { orgId, config } = await gestor();
  const lista = texto(formData, "lista") === "proprietario" ? "campos_proprietario" : "campos_lead";
  const chave = texto(formData, "chave");
  await gravar(orgId, { [lista]: config[lista].filter((c) => c.chave !== chave) });
}

export async function moverCampo(formData: FormData) {
  const { orgId, config } = await gestor();
  const lista = texto(formData, "lista") === "proprietario" ? "campos_proprietario" : "campos_lead";
  const chave = texto(formData, "chave");
  const atual = config[lista];
  await gravar(orgId, {
    [lista]: mover(atual, atual.findIndex((c) => c.chave === chave), texto(formData, "direcao") === "subir" ? -1 : 1),
  });
}

// ---------------------------------------------------------------- ficha de visita

export async function alternarObrigatorioVisita(formData: FormData) {
  const { orgId, config } = await gestor();
  const chave = texto(formData, "chave");
  await gravar(orgId, {
    ficha_visita: config.ficha_visita.map((c) => (c.chave === chave ? { ...c, obrigatorio: !c.obrigatorio } : c)),
  });
}

export async function adicionarCampoVisita(formData: FormData) {
  const { orgId, config } = await gestor();
  const rotulo = texto(formData, "rotulo");
  if (!rotulo) return;
  let chave = chaveDe(rotulo) || `campo_${config.ficha_visita.length + 1}`;
  if (config.ficha_visita.some((c) => c.chave === chave)) chave = `${chave}_${config.ficha_visita.length + 1}`;
  const novo: CampoVisita = { chave, rotulo, obrigatorio: formData.get("obrigatorio") === "on", opcoes: lerOpcoes(formData) };
  await gravar(orgId, { ficha_visita: [...config.ficha_visita, novo] });
}

export async function removerCampoVisita(formData: FormData) {
  const { orgId, config } = await gestor();
  const chave = texto(formData, "chave");
  // Data, imóvel e interesse sustentam a ficha (e o "Visita realizada"): não saem.
  if (["quando", "imovel", "interesse"].includes(chave)) return;
  await gravar(orgId, { ficha_visita: config.ficha_visita.filter((c) => c.chave !== chave) });
}

// ---------------------------------------------------------------- motivos de perda

export async function adicionarMotivo(formData: FormData) {
  const { orgId, config } = await gestor();
  const motivo = texto(formData, "motivo");
  if (!motivo || config.motivos_perda.some((m) => m.motivo === motivo)) return;
  await gravar(orgId, {
    motivos_perda: [...config.motivos_perda, { motivo, definitivo: formData.get("definitivo") === "on" }],
  });
}

export async function alternarMotivoDefinitivo(formData: FormData) {
  const { orgId, config } = await gestor();
  const motivo = texto(formData, "motivo");
  await gravar(orgId, {
    motivos_perda: config.motivos_perda.map((m) => (m.motivo === motivo ? { ...m, definitivo: !m.definitivo } : m)),
  });
}

export async function removerMotivo(formData: FormData) {
  const { orgId, config } = await gestor();
  const motivo = texto(formData, "motivo");
  await gravar(orgId, { motivos_perda: config.motivos_perda.filter((m) => m.motivo !== motivo) });
}

// ---------------------------------------------------------------- horário

export async function salvarHorario(formData: FormData) {
  const { orgId, config } = await gestor();
  const hora = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? v : "");
  const horario: DiaAtendimento[] = config.horario.map((d, i) => {
    const aberto = formData.get(`aberto_${i}`) === "on";
    return {
      dias: d.dias,
      aberto,
      abre: aberto ? hora(texto(formData, `abre_${i}`)) || d.abre || "08:00" : "",
      fecha: aberto ? hora(texto(formData, `fecha_${i}`)) || d.fecha || "18:00" : "",
    };
  });
  await gravar(orgId, { horario });
}
