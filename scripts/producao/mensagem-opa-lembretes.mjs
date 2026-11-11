// Manda UMA mensagem do número OPA Lembretes para alguém da equipe da OPA.
//
// Por que existe (10/11/2026, pedido do Allyson): avisar a pessoa de que os lembretes e
// avisos do CRM chegam por esse número, para ela fixar a conversa. Vai para o WhatsApp
// que a pessoa conectou no CRM (o mesmo número que recebe os avisos da rotina).
//
// Uso (precisa das variáveis do app: Supabase e WAHA):
//   node mensagem-opa-lembretes.mjs --para=Marco --texto64=<texto em base64> [--seco]
// `--para` é o primeiro nome; se duas pessoas com número conectado tiverem o mesmo,
// o script para e não manda. Em produção roda por mensagem-opa-lembretes.sh.

const NOME = "opa-lembretes";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const seco = Boolean(args.seco);

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

const para = typeof args.para === "string" ? args.para.trim() : "";
const texto = typeof args.texto64 === "string" ? Buffer.from(args.texto64, "base64").toString("utf8").trim() : "";
if (!para) sair("Diga para quem: --para=PrimeiroNome.");
if (!texto) sair("Falta o texto (--texto64=...).");
if (texto.length > 1000) sair("Texto longo demais (até 1000 caracteres).");

const cab = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const semAcento = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const mascarar = (n) => `${n.slice(0, 4)}*****${n.slice(-4)}`;

async function rest(caminho) {
  const r = await fetch(`${SB}/rest/v1/${caminho}`, { headers: cab });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${corpo.slice(0, 300)}`);
  return corpo ? JSON.parse(corpo) : null;
}

async function main() {
  const [lembretes] = await rest(`channel_sessions?waha_session_name=eq.${NOME}&archived_at=is.null&select=organization_id,status`);
  if (!lembretes) sair(`A sessão ${NOME} não existe (ou está arquivada).`);
  if (String(lembretes.status).toUpperCase() !== "WORKING") sair(`O OPA Lembretes está ${lembretes.status}: religue antes de mandar.`);

  const sessoes = await rest(
    `channel_sessions?organization_id=eq.${lembretes.organization_id}&archived_at=is.null&owner_user_id=not.is.null&select=owner_user_id,phone_number`,
  );
  const achados = [];
  for (const s of sessoes) {
    const digitos = String(s.phone_number ?? "").replace(/\D/g, "");
    if (!digitos) continue;
    const r = await fetch(`${SB}/auth/v1/admin/users/${s.owner_user_id}`, { headers: cab });
    if (!r.ok) continue;
    const u = await r.json();
    const nome = String(u.user_metadata?.full_name ?? "").trim();
    if (semAcento(nome.split(/\s+/)[0] ?? "") === semAcento(para)) achados.push({ nome, digitos });
  }
  if (achados.length === 0) sair(`Ninguém chamado "${para}" tem WhatsApp conectado no CRM.`);
  if (achados.length > 1) sair(`Mais de uma pessoa chamada "${para}" com WhatsApp conectado: ${achados.map((a) => a.nome).join(", ")}. Não mandei.`);

  const alvo = achados[0];
  console.info(`${seco ? "[seco] Mandaria" : "Mandando"} para ${alvo.nome} (${mascarar(alvo.digitos)}), ${texto.length} caracteres.`);
  if (seco) return;

  const r = await fetch(`${WAHA}/api/sendText`, {
    method: "POST",
    headers: { "X-Api-Key": WAHA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ session: NOME, chatId: `${alvo.digitos}@c.us`, text: texto }),
  });
  if (!r.ok) sair(`O WhatsApp não aceitou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  console.info("Enviada.");
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
