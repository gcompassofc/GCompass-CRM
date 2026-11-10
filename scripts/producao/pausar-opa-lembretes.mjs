// Pausa e religa o número de avisos "OPA Lembretes" (sessão WAHA `opa-lembretes`).
//
// Por que existe (10/11/2026, pedido do Allyson): parar os avisos enquanto as regras
// são reconfiguradas. O CRM não tem interruptor geral: tudo sai por
// lib/opa/aviso-whatsapp.ts, que só manda quando a sessão está WORKING. Pausar é
// PARAR a sessão no WAHA (stop). O pareamento fica guardado: religar é um start,
// sem QR. Não usa logout nem apaga a sessão (a tela Conexões > Excluir faz isso e
// obriga a criar tudo de novo).
//
// Com o número pausado:
//   - aviso de prazo, repasse, escalada, negócio parado, Captações do Radar e aviso
//     de boas-vindas que não saiu ficam gravados em opa_avisos como "falhou" e NÃO
//     são reenviados ao religar (sem rajada);
//   - o repasse automático não acontece (regra C4: sem aviso entregue, o lead não
//     troca de corretor);
//   - lembrete agendado que vencer tenta 3 vezes e fica "falhou" na tela Lembretes;
//   - código de entrada por WhatsApp (verificação em duas etapas) não sai: por isso
//     o script confere antes quem usa esse método e não pausa sem `--mesmo-assim`;
//   - a tela Hoje do gestor mostra a faixa "O número OPA Lembretes está desconectado".
// O resto da rotina de minuto em minuto segue igual (card que anda sozinho, limpeza
// das mensagens em espera, etiquetas).
//
// Uso (precisa das variáveis do app):
//   node pausar-opa-lembretes.mjs --acao=conferir
//   node pausar-opa-lembretes.mjs --acao=pausar [--mesmo-assim]
//   node pausar-opa-lembretes.mjs --acao=religar
// Em produção roda por scripts/producao/pausar-opa-lembretes.sh.

const NOME = "opa-lembretes";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const acao = String(args.acao ?? "conferir");
const mesmoAssim = Boolean(args["mesmo-assim"]);

function sair(msg, codigo = 1) {
  console.error(msg);
  process.exit(codigo);
}

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WAHA = (process.env.WAHA_API_BASE_URL || "").replace(/\/$/, "");
const WAHA_KEY = process.env.WAHA_API_KEY || "";
if (!SB || !SR) sair("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
if (!WAHA || !WAHA_KEY) sair("Faltam WAHA_API_BASE_URL e WAHA_API_KEY no ambiente.");
if (!["conferir", "pausar", "religar"].includes(acao)) sair("Use --acao=conferir, --acao=pausar ou --acao=religar.");

const cab = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(caminho, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${caminho}`, { ...init, headers: { ...cab, ...(init.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

async function linhaDaSessao() {
  const linhas = await rest(`channel_sessions?waha_session_name=eq.${NOME}&archived_at=is.null&select=id,organization_id,status`);
  return linhas[0] ?? null;
}

async function estadoNoWaha() {
  const r = await fetch(`${WAHA}/api/sessions/${NOME}`, { headers: { "X-Api-Key": WAHA_KEY } });
  if (!r.ok) return null;
  return String((await r.json()).status ?? "").toUpperCase() || null;
}

async function comando(verbo) {
  const r = await fetch(`${WAHA}/api/sessions/${NOME}/${verbo}`, {
    method: "POST",
    headers: { "X-Api-Key": WAHA_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  // 409/422 = já está nesse estado (mesma tolerância de lib/waha/client.ts).
  if (!r.ok && r.status !== 409 && r.status !== 422) throw new Error(`WAHA ${verbo} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Espera o WAHA chegar a um dos estados; devolve o último estado visto. */
async function esperarEstado(alvos, segundos) {
  let visto = null;
  for (let i = 0; i < segundos; i++) {
    visto = await estadoNoWaha();
    if (visto && alvos.includes(visto)) return visto;
    await espera(1000);
  }
  return visto;
}

/** O webhook session.status grava o estado no banco; se não chegou, grava aqui o mesmo valor. */
async function alinharBanco(id, status) {
  for (let i = 0; i < 6; i++) {
    const [l] = await rest(`channel_sessions?id=eq.${id}&select=status`);
    if (l?.status === status) return "pelo aviso do WAHA";
    await espera(1000);
  }
  await rest(`channel_sessions?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, last_status_change_at: new Date().toISOString() }),
  });
  return "gravado pelo script";
}

/** Quem entra no CRM com código por WhatsApp (o código sai deste número). Só primeiro nome e papel. */
async function quemUsaCodigoPorWhatsapp(orgId) {
  const membros = await rest(`user_organizations?organization_id=eq.${orgId}&revoked_at=is.null&select=user_id,role`);
  const lista = [];
  for (const m of membros) {
    const r = await fetch(`${SB}/auth/v1/admin/users/${m.user_id}`, { headers: cab });
    if (!r.ok) continue;
    const u = await r.json();
    if (u.app_metadata?.segundo_fator !== "whatsapp") continue;
    const nome = String(u.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || "sem nome";
    lista.push(`${nome} (${m.role})`);
  }
  return lista;
}

async function resumo(orgId) {
  const pendentes = await rest(`lembretes_agendados?organization_id=eq.${orgId}&status=eq.pendente&select=quando&order=quando.asc`);
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const avisos = await rest(`opa_avisos?organization_id=eq.${orgId}&created_at=gte.${desde}&select=tipo,status&limit=5000`);
  const porTipo = {};
  for (const a of avisos) {
    const tipo = a.tipo.startsWith("aviso_") ? "aviso_de_prazo" : a.tipo;
    const chave = `${tipo} ${a.status}`;
    porTipo[chave] = (porTipo[chave] ?? 0) + 1;
  }
  console.info(`Lembretes agendados pendentes: ${pendentes.length}${pendentes.length ? ` (o próximo em ${pendentes[0].quando})` : ""}`);
  console.info(`Avisos dos últimos 7 dias: ${Object.entries(porTipo).map(([k, n]) => `${k}: ${n}`).join(" | ") || "nenhum"}`);
}

async function main() {
  const linha = await linhaDaSessao();
  if (!linha) sair(`A sessão ${NOME} não existe (ou está arquivada). Nada a fazer.`);
  const waha = await estadoNoWaha();
  console.info(`OPA Lembretes agora: banco ${linha.status} | WAHA ${waha ?? "sem sessão"}`);

  if (acao === "conferir") {
    const codigo = await quemUsaCodigoPorWhatsapp(linha.organization_id);
    console.info(`Entram com código por WhatsApp: ${codigo.length ? codigo.join(", ") : "ninguém"}`);
    await resumo(linha.organization_id);
    return;
  }

  if (acao === "pausar") {
    const codigo = await quemUsaCodigoPorWhatsapp(linha.organization_id);
    if (codigo.length && !mesmoAssim) {
      sair(
        `Não pausei. ${codigo.join(", ")} ${codigo.length === 1 ? "entra" : "entram"} no CRM com código por WhatsApp, e o código sai deste número.\n` +
          "Troque o método dessa conta (Minha conta > Verificação em duas etapas) ou rode de novo com --mesmo-assim.",
      );
    }
    await resumo(linha.organization_id);
    await comando("stop");
    const depois = await esperarEstado(["STOPPED"], 15);
    if (depois !== "STOPPED") sair(`O WAHA não confirmou a parada (estado: ${depois ?? "sem resposta"}). Confira com --conferir.`);
    const como = await alinharBanco(linha.id, "STOPPED");
    console.info(`Pausado: WAHA STOPPED, banco STOPPED (${como}). Nenhum aviso sai até religar.`);
    return;
  }

  // religar
  await comando("start");
  const depois = await esperarEstado(["WORKING", "SCAN_QR_CODE", "FAILED"], 40);
  if (depois === "WORKING") {
    const como = await alinharBanco(linha.id, "WORKING");
    console.info(`Religado: WAHA WORKING, banco WORKING (${como}). O que venceu durante a pausa não é reenviado.`);
  } else if (depois === "SCAN_QR_CODE") {
    console.info("O WhatsApp pediu o QR de novo: CRM > Conexões > OPA Lembretes > Gerenciar, e leia com o celular do chip.");
  } else {
    sair(`Não voltou sozinho (estado: ${depois ?? "sem resposta"}). Abra CRM > Conexões > OPA Lembretes > Gerenciar > Reconectar.`);
  }
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
