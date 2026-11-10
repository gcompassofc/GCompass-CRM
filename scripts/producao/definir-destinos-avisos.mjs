// Grava a configuração do OPA Lembretes do CRM da OPA (organizations.settings.opa):
//   - avisos.gestor e avisos.admin: números que recebem os avisos da gestão e da administração;
//   - avisos.teste: modo de teste. Com número aqui, o OPA Lembretes SÓ manda para ele;
//   - assistente: quem fala com o assistente do número e se ele está ligado.
//
// É o mesmo que salvar em Configurações > Horário > Quem recebe os avisos (a parte do
// assistente ainda não tem tela). Existe para gravar junto com a publicação. Os números
// não ficam no repositório: vêm na linha de comando.
//
// Uso (precisa das variáveis do app: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY):
//   node definir-destinos-avisos.mjs                       -> só mostra o que está gravado
//   ... --gestor=NUM,NUM --admin=NUM                       -> destinos dos avisos
//   ... --teste=NUM            (ou --teste= para sair do teste)
//   ... --assistente=NUM:Nome:papel[,NUM:Nome:papel]  --assistente-ligado=sim|nao
//       papel: admin, manager ou agent
//   ... --seco                                             -> só confere, não grava
// Lista vazia ("--gestor=") volta à regra por papel.

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

/** "5516988301706:Allyson:admin" -> { numero, nome, papel }. */
function pessoas(valor) {
  if (valor === undefined) return undefined;
  const partes = valor === true ? [] : String(valor).split(",").map((p) => p.trim()).filter(Boolean);
  const saida = [];
  for (const p of partes) {
    const [n, nome, papel] = p.split(":").map((x) => (x ?? "").trim());
    const num = numero(n ?? "");
    if (!num || !nome || !["admin", "manager", "agent"].includes(papel)) sair(`Pessoa inválida em --assistente: "${p}". Use NUMERO:Nome:papel (admin, manager ou agent).`);
    if (!saida.some((s) => s.numero === num)) saida.push({ numero: num, nome: nome.slice(0, 40), papel });
  }
  return saida;
}

const mascarar = (n) => `${n.slice(0, 4)}*****${n.slice(-4)}`;
const mostrar = (l) => (l ?? []).map(mascarar).join(", ");

async function main() {
  const r = await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&select=id,settings`, { headers: cab });
  if (!r.ok) sair(`banco ${r.status}`);
  const [org] = await r.json();
  if (!org) sair(`Organização "${slug}" não encontrada.`);
  const avisosAtuais = org.settings?.opa?.avisos ?? {};
  const assistenteAtual = org.settings?.opa?.assistente ?? {};
  const descrever = (av, as) =>
    `gestão ${mostrar(av.gestor) || "(por papel)"} | administração ${mostrar(av.admin) || "(por papel)"} | teste ${mostrar(av.teste) || "(desligado: manda para todos)"} | assistente ${as.ligado ? "ligado" : "desligado"} para ${(as.numeros ?? []).map((p) => `${p.nome} (${p.papel}, ${mascarar(p.numero)})`).join(", ") || "ninguém"}`;
  console.info(`Gravado hoje: ${descrever(avisosAtuais, assistenteAtual)}`);

  const gestor = lista(args.gestor, "gestor");
  const admin = lista(args.admin, "admin");
  const teste = lista(args.teste, "teste");
  const numeros = pessoas(args.assistente);
  const ligado = args["assistente-ligado"] === undefined ? undefined : ["sim", "true", "1"].includes(String(args["assistente-ligado"]).toLowerCase());
  if ([gestor, admin, teste, numeros, ligado].every((x) => x === undefined)) return;

  // O banco troca cada chave de primeiro nível inteira: manda o objeto completo de cada uma.
  const parcial = {};
  if (gestor !== undefined || admin !== undefined || teste !== undefined) {
    parcial.avisos = { gestor: gestor ?? avisosAtuais.gestor ?? [], admin: admin ?? avisosAtuais.admin ?? [], teste: teste ?? avisosAtuais.teste ?? [] };
  }
  if (numeros !== undefined || ligado !== undefined) {
    parcial.assistente = { ligado: ligado ?? assistenteAtual.ligado === true, numeros: numeros ?? assistenteAtual.numeros ?? [] };
  }
  console.info(`${seco ? "[seco] Gravaria" : "Gravando"}: ${descrever(parcial.avisos ?? avisosAtuais, parcial.assistente ?? assistenteAtual)}`);
  if (seco) return;

  const g = await fetch(`${SB}/rest/v1/rpc/fn_opa_mesclar_config`, { method: "POST", headers: cab, body: JSON.stringify({ p_org: org.id, p_parcial: parcial }) });
  if (!g.ok) sair(`Não gravou (${g.status}): ${(await g.text()).slice(0, 200)}`);
  console.info("Pronto. O CRM lê a configuração a cada uso: vale na próxima mensagem.");
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
