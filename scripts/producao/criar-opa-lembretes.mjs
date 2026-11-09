// Cria o número de avisos "OPA Lembretes" (sessão WAHA `opa-lembretes`) na org da OPA.
//
// Por que existe (09/11/2026): o código procura a sessão pelo nome exato
// `opa-lembretes` (lib/opa/aviso-whatsapp.ts, app/app/conexoes/page.tsx,
// app/app/hoje/_visoes.tsx, lib/auth/segundo-fator.ts). No local ela nasce do
// scripts/seed-opa.ts; em produção nunca nasceu, e a tela Conexões não cria uma
// sessão com esse nome (o POST de app/api/v1/channel-sessions/route.ts sorteia
// `org_<8>_<6>`).
//
// Faz o mesmo que aquele POST, com o nome fixo:
//   1. procura `opa-lembretes` na org; se já existe ativa, não faz nada;
//   2. grava a linha em channel_sessions (STARTING, sem dono, NOWEB, token de
//      webhook novo) e cria + inicia a sessão no WAHA (fica esperando o QR);
//   3. se o WAHA falhar, apaga só a linha que acabou de criar.
// Não toca em nenhuma outra sessão nem nos números dos corretores.
//
// Sobre o segredo do webhook: o app não cifra segredo por sessão. O POST grava um
// byte zero (Buffer.from([0])) e a sessão do corretor grava "\x00"; quem assina os
// webhooks é o WAHA, com a chave HMAC do contêiner (WHATSAPP_HOOK_HMAC_KEY), que o
// app confere com WAHA_HMAC_SECRET. Este script grava o mesmo byte zero.
//
// Uso (precisa das variáveis do app: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// WAHA_API_BASE_URL, WAHA_API_KEY):
//   node criar-opa-lembretes.mjs --telefone=+5512991392393 [--org=opa] [--seco]
// --seco: só confere e diz o que faria, sem gravar nada.
// Em produção, quem roda é o Allyson, por scripts/producao/criar-opa-lembretes.sh.

import { randomUUID } from "node:crypto";

const NOME = "opa-lembretes";
const ROTULO = "OPA Lembretes";
// Igual a CONFIG_DA_SESSAO de lib/waha/client.ts (mantenha os dois iguais).
const CONFIG_DA_SESSAO = {
  gows: { storage: { messages: false, groups: false, chats: false, labels: true, contacts: false, messageSecrets: false } },
  ignore: { status: true, groups: true, channels: true, broadcast: true },
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const seco = Boolean(args.seco);
const slug = String(args.org ?? "opa");
const telefone = String(args.telefone ?? "").replace(/[^\d+]/g, "");

function sair(msg, codigo = 1) {
  console.error(msg);
  process.exit(codigo);
}

if (!/^\+55\d{10,11}$/.test(telefone)) sair("Informe o chip do OPA Lembretes: --telefone=+55DDDNUMERO (ex.: --telefone=+5512991392393).");

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WAHA = (process.env.WAHA_API_BASE_URL || "").replace(/\/$/, "");
const WAHA_KEY = process.env.WAHA_API_KEY || "";
if (!SB || !SR) sair("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
if (!WAHA || !WAHA_KEY) sair("Faltam WAHA_API_BASE_URL e WAHA_API_KEY no ambiente.");

const cab = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

async function rest(caminho, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${caminho}`, { ...init, headers: { ...cab, ...(init.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

async function waha(caminho, corpo) {
  const r = await fetch(`${WAHA}${caminho}`, {
    method: "POST",
    headers: { "X-Api-Key": WAHA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(corpo ?? {}),
  });
  // 409/422 = já existe ou já iniciou (mesma tolerância de lib/waha/client.ts).
  if (!r.ok && r.status !== 409 && r.status !== 422) throw new Error(`WAHA ${caminho} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function main() {
  const [org] = await rest(`organizations?slug=eq.${encodeURIComponent(slug)}&select=id,slug`);
  if (!org) sair(`Organização "${slug}" não encontrada.`);
  console.info(`Organização: ${org.slug} (${org.id})`);

  // O nome da sessão é único na tabela inteira, arquivadas incluídas.
  const comNome = await rest(`channel_sessions?waha_session_name=eq.${NOME}&select=id,organization_id,status,archived_at,phone_number`);
  const ativa = comNome.find((s) => s.organization_id === org.id && !s.archived_at);
  if (ativa) {
    console.info(`Já existe: ${NOME} (${ativa.status}, ${ativa.phone_number ?? "sem número"}). Nada a fazer.`);
    return;
  }
  if (comNome.length) {
    sair(
      `Existe uma sessão ${NOME} ${comNome[0].archived_at ? "arquivada" : "em outra organização"} (id ${comNome[0].id}). ` +
        "O nome não pode repetir. Resolva essa linha antes (não mexi em nada).",
    );
  }
  const mesmoNumero = await rest(
    `channel_sessions?organization_id=eq.${org.id}&archived_at=is.null&phone_number=eq.${encodeURIComponent(telefone)}&select=id,display_name,waha_session_name`,
  );
  if (mesmoNumero.length) {
    sair(`O número ${telefone} já está ativo em "${mesmoNumero[0].display_name ?? mesmoNumero[0].waha_session_name}". Não mexi em nada.`);
  }

  if (seco) {
    console.info(`[seco] Criaria ${NOME} ("${ROTULO}", ${telefone}, sem dono, STARTING) e iniciaria no WAHA esperando o QR.`);
    return;
  }

  const [linha] = await rest("channel_sessions?select=id,waha_session_name,status", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org.id,
      waha_session_name: NOME,
      display_name: ROTULO,
      phone_number: telefone,
      owner_user_id: null,
      engine: "NOWEB",
      webhook_path_token: randomUUID().replace(/-/g, ""),
      webhook_secret_encrypted: "\\x00",
      status: "STARTING",
      last_status_change_at: new Date().toISOString(),
      consecutive_health_fails: 0,
      daily_message_limit: 250,
      metadata: {},
    }),
  });
  console.info(`Linha criada em channel_sessions: ${linha.id}`);

  try {
    await waha("/api/sessions", { name: NOME, config: CONFIG_DA_SESSAO });
    await waha(`/api/sessions/${NOME}/start`, {});
  } catch (e) {
    // Sem WAHA no ar, não fica canal fantasma preso em STARTING (como no POST do app).
    await rest(`channel_sessions?id=eq.${linha.id}`, { method: "DELETE" });
    sair(`O WAHA recusou (${e.message}). Apaguei só a linha criada agora; nada mais mudou.`);
  }
  console.info(`Pronto: ${NOME} iniciada no WAHA, esperando o QR. Leia em Conexões > OPA Lembretes > Gerenciar.`);
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
