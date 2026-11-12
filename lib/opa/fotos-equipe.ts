/**
 * Foto de cada pessoa da equipe a partir do site da OPA.
 *
 * O site guarda os corretores em `dados/corretores.json` (`perfis`, com nome,
 * e-mail e foto). O CRM usa a foto como `user_metadata.avatar_url` do usuário,
 * apontando para o arquivo publicado no site: trocou a foto no site, o CRM
 * acompanha. Casa por e-mail; sem e-mail igual, pelo nome.
 */

export interface FotoDoSite {
  nome: string;
  email: string | null;
  foto: string;
}

interface PerfilDoSite {
  nome?: string;
  email?: string;
  foto?: string;
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Lê os perfis do JSON do site e devolve a foto em endereço completo. */
export function fotosDoSite(corretoresJson: unknown, urlBase = "https://opailhabela.com.br"): FotoDoSite[] {
  const perfis = ((corretoresJson as { perfis?: Record<string, PerfilDoSite> })?.perfis ?? {}) as Record<string, PerfilDoSite>;
  const base = urlBase.replace(/\/+$/, "");
  return Object.values(perfis)
    .filter((p): p is Required<Pick<PerfilDoSite, "nome" | "foto">> & PerfilDoSite => Boolean(p?.nome && p?.foto))
    .map((p) => ({
      nome: p.nome,
      email: p.email ? p.email.trim().toLowerCase() : null,
      foto: /^https:\/\//.test(p.foto) ? p.foto : `${base}/${p.foto.replace(/^\/+/, "")}`,
    }));
}

/**
 * Acha a foto de uma pessoa: e-mail igual; senão nome igual; senão primeiro e
 * último nome iguais ("Marco Henrique da Silva" casa com "Marco Henrique").
 */
export function fotoDaPessoa(fotos: FotoDoSite[], pessoa: { email?: string | null; nome?: string | null }): string | null {
  const email = (pessoa.email ?? "").trim().toLowerCase();
  if (email) {
    const porEmail = fotos.find((f) => f.email === email);
    if (porEmail) return porEmail.foto;
  }
  const nome = semAcento(pessoa.nome ?? "");
  if (!nome) return null;
  const exato = fotos.find((f) => semAcento(f.nome) === nome);
  if (exato) return exato.foto;
  const pontas = (n: string) => {
    const p = semAcento(n).split(" ");
    return `${p[0]} ${p.at(-1)}`;
  };
  const alvo = pontas(nome);
  const parecidos = fotos.filter((f) => pontas(f.nome) === alvo || semAcento(f.nome).startsWith(`${nome} `) || nome.startsWith(`${semAcento(f.nome)} `));
  return parecidos.length === 1 ? parecidos[0]!.foto : null;
}

/**
 * Fotos guardadas no próprio CRM (public/opa/equipe), copiadas do site da OPA e
 * do site da G-Compass em 12/11/2026 (pedido do Allyson). Valem para quem ainda
 * não tem `avatar_url`: a foto que a pessoa puser no perfil sempre ganha.
 */
export const FOTOS_DA_EQUIPE: FotoDoSite[] = [
  { nome: "Marco Henrique", email: null, foto: "/opa/equipe/marco-henrique.webp" },
  { nome: "Luana Machado", email: null, foto: "/opa/equipe/luana-machado.webp" },
  { nome: "Paulo Martin", email: null, foto: "/opa/equipe/paulo-martin.webp" },
  { nome: "Rodrigo Festuccia", email: null, foto: "/opa/equipe/rodrigo-festuccia.webp" },
  { nome: "Cristian Spengler", email: null, foto: "/opa/equipe/cristian-spengler.webp" },
  { nome: "June Rocha", email: null, foto: "/opa/equipe/june-rocha.webp" },
];

const LOGO_GCOMPASS = "/opa/equipe/gcompass.png";

/** O acesso da G-Compass (Growth Compass) leva a logo da casa. */
function ehAcessoDaGCompass(nome: string, email: string): boolean {
  const n = semAcento(nome).replace(/[^a-z]/g, "");
  const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return /growthcompass|gcompass/.test(n) || /^(growthcompass|gcompass)/.test(local);
}

/**
 * Foto para mostrar de uma pessoa da equipe: a do perfil; senão a guardada no CRM
 * (por nome, e pelo primeiro nome quando ele é único na lista, ex. "Luana", "June");
 * senão a logo, se for o acesso da G-Compass; senão nenhuma (as iniciais assumem).
 */
export function fotoDaEquipe(p: { avatarUrl?: string | null; email?: string | null; nome?: string | null }): string | null {
  if (p.avatarUrl) return p.avatarUrl;
  const nome = (p.nome ?? "").trim();
  const email = (p.email ?? "").trim();
  if (ehAcessoDaGCompass(nome, email)) return LOGO_GCOMPASS;
  // Sem nome cadastrado, o CRM mostra o começo do e-mail ("luana.machado"): procura por ele.
  const procurado = nome || (email.split("@")[0] ?? "").replace(/[._-]+/g, " ");
  if (!procurado) return null;
  const porNome = fotoDaPessoa(FOTOS_DA_EQUIPE, { nome: procurado });
  if (porNome) return porNome;
  const primeiro = semAcento(procurado.split(" ")[0] ?? "");
  const mesmos = FOTOS_DA_EQUIPE.filter((f) => semAcento(f.nome).split(" ")[0] === primeiro);
  return mesmos.length === 1 ? mesmos[0]!.foto : null;
}
