/**
 * Regras do "Mudar nome" da ficha do lead. O nome mora em três lugares, e cada
 * tela lê um: `contacts.name` (ficha, funil, avisos), `contacts.display_name`
 * (Multi-atendimento, que o prefere) e o começo de `crm_leads.title` ("Nome · CA007").
 */

const TAMANHO_MAXIMO = 200;
const SEPARADOR = " · ";

/** Nome pronto para gravar, ou null se não serve. O "·" sai porque separa o nome do imóvel no título. */
export function limparNomeDoLead(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const nome = bruto.replace(/·/g, " ").replace(/\s+/g, " ").trim();
  return nome.length >= 2 && nome.length <= TAMANHO_MAXIMO ? nome : null;
}

/** Troca só o nome no título: "Ana · CA007" vira "Ana Souza · CA007". */
export function tituloComNovoNome(titulo: string | null | undefined, nome: string): string {
  const [, ...resto] = (titulo ?? "").split(SEPARADOR);
  return [nome, ...resto].join(SEPARADOR);
}
