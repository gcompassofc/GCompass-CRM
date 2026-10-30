// Gera lib/opa/kit.ts a partir de corretores/kit-atendimento-opa/src (mesma fonte do montar-kit.py).
//
// Run: node scripts/gerar-kit-opa.mjs [pasta/src/do/kit]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const SRC =
  process.argv[2] ??
  "C:/Users/allys/OneDrive/Documentos/JARVIS-GCOMPASS/02 - Clientes/opa/corretores/kit-atendimento-opa/src";
const DEST = path.join(AQUI, "..", "lib", "opa", "kit.ts");
const ARQUIVOS = ["01-atendimento.js", "02-resgate.js", "03-audio.js", "04-objecoes.js"];

const KIT = { modulos: [] };
new Function("KIT", ARQUIVOS.map((a) => fs.readFileSync(path.join(SRC, a), "utf8")).join("\n"))(KIT);
const ORDEM = ["atendimento", "resgate", "audio", "objecoes"];
const modulos = ORDEM.map((id) => KIT.modulos.find((m) => m.id === id)).filter(Boolean);

const cabecalho = `/**
 * Kit de Atendimento OPA, como dados do CRM.
 *
 * GERADO a partir de 02 - Clientes/opa/corretores/kit-atendimento-opa/src
 * (a mesma fonte do montar-kit.py do protótipo). Não editar à mão: mudou o
 * kit, rode "node scripts/gerar-kit-opa.mjs" e confira o diff.
 *
 * Campos de cada mensagem: t título, q quando usar, o o que o cliente diz
 * (objeções), m a mensagem, p por que funciona, a roteiro de áudio,
 * perfis restringe a alguns perfis. Na mensagem, {lead} {corretor} {imovel}
 * {bairro} {link} vêm do CRM e [texto] é o que o corretor completa.
 */

export type PerfilKit = "medio" | "alto" | "off";

export const PERFIS_KIT: Array<{ id: PerfilKit; nome: string }> = [
  { id: "medio", nome: "Médio padrão" },
  { id: "alto", nome: "Alto padrão" },
  { id: "off", nome: "Off market" },
];

export interface ItemKit {
  t: string;
  q?: string;
  o?: string;
  m: string;
  p?: string;
  a?: boolean;
  perfis?: PerfilKit[];
}

export interface EtapaKit {
  nome: string;
  desc?: string;
  regras?: string[];
  perfis?: PerfilKit[];
  itens: ItemKit[];
}

export interface ModuloKit {
  id: "atendimento" | "resgate" | "audio" | "objecoes";
  nome: string;
  titulo: string;
  desc: string | Partial<Record<PerfilKit | "todos", string>>;
  busca?: boolean;
  guia?: Array<{ b: string; s: string }>;
  etapas: EtapaKit[] | Partial<Record<PerfilKit, EtapaKit[]>>;
}

export const KIT: ModuloKit[] = `;

fs.writeFileSync(DEST, cabecalho + JSON.stringify(modulos, null, 2) + ";\n", "utf8");
console.info("kit.ts:", fs.statSync(DEST).size, "bytes,", modulos.length, "módulos");
