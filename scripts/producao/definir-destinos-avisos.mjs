// Grava os números de WhatsApp que recebem os avisos da gestão e da administração
// do CRM da OPA (organizations.settings.opa.avisos, 10/11/2026).
//
// É o mesmo que salvar em Configurações > Horário > Quem recebe os avisos. Existe
// para gravar junto com a publicação, sem precisar entrar na tela. Os números não
// ficam no repositório: vêm na linha de comando.
//
// Uso (precisa das variáveis do app: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY):
//   node definir-destinos-avisos.mjs --gestor=16988301706,12992096501 --admin=16988301706 [--org=opa] [--seco]
// Sem argumento de lista, só mostra o que está gravado. Lista vazia ("--gestor=") volta
// à regra por papel (gerente e administrador, no número que cada um conectou).

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const slug = String(args.org ?? "opa");
const seco = Boolean(args.seco);

function sair(msg, codigo = 1) {
  console.error(msg);
  process.exit(codigo);
}

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SB || !SR) sair("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
const cab = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

/** Igual a numeroDeAviso de lib/opa/config.ts. */
function numero(bruto) {
  let d = String(bruto).replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^\d{12,13}$/.test(d) ? d : null;
}

function lista(valor, nome) {
  if (valor === undefined) return undefined;
  const partes = valor === true ? [] : String(valor).split(",").map((p) => p.trim()).filter(Boolean);
  const numeros = [];
  for (const p of partes) {
    const n = numero(p);
    if (!n) sair(`Número inválido em --${nome}: "${p}". Use DDD e número.`);
    if (!numeros.includes(n)) numeros.push(n);
  }
  return numeros;
}

const mascarar = (n) => `${n.slice(0, 4)}*****${n.slice(-4)}`;

async function main() {
  const r = await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&select=id,settings`, { headers: cab });
  if (!r.ok) sair(`banco ${r.status}`);
  const [org] = await r.json();
  if (!org) sair(`Organização "${slug}" não encontrada.`);
  const atual = org.settings?.opa?.avisos ?? {};
  console.info(`Gravado hoje: gestão ${(atual.gestor ?? []).map(mascarar).join(", ") || "(por papel)"} | administração ${(atual.admin ?? []).map(mascarar).join(", ") || "(por papel)"}`);

  const gestor = lista(args.gestor, "gestor");
  const admin = lista(args.admin, "admin");
  if (gestor === undefined && admin === undefined) return;
  const novo = { gestor: gestor ?? atual.gestor ?? [], admin: admin ?? atual.admin ?? [] };
  console.info(`${seco ? "[seco] Gravaria" : "Gravando"}: gestão ${novo.gestor.map(mascarar).join(", ") || "(por papel)"} | administração ${novo.admin.map(mascarar).join(", ") || "(por papel)"}`);
  if (seco) return;

  const g = await fetch(`${SB}/rest/v1/rpc/fn_opa_mesclar_config`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ p_org: org.id, p_parcial: { avisos: novo } }),
  });
  if (!g.ok) sair(`Não gravou (${g.status}): ${(await g.text()).slice(0, 200)}`);
  console.info("Pronto. A rotina lê a configuração a cada minuto: vale na próxima rodada.");
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
