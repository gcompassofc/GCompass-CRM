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
