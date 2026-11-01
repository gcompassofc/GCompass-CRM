/**
 * Grava os modelos de e-mail do Supabase Auth da OPA em supabase/templates/opa/.
 *
 * Uso (na raiz do repositório):  npx tsx scripts/gerar-modelos-email-opa.ts
 *
 * Depois, cole cada arquivo no painel do Supabase (Authentication > Emails) com o
 * assunto que o script imprime. O passo a passo está em docs/EMAILS-OPA.md.
 * O teste tests/unit/emails-opa.test.ts reprova se os arquivos ficarem velhos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { MODELOS_SUPABASE_OPA } from "../lib/email/modelos-supabase-opa";

// A marca é lida na hora de montar cada modelo, então basta valer antes do html().
process.env.APP_PALETTE = "opa";

const pasta = path.join(process.cwd(), "supabase", "templates", "opa");
fs.mkdirSync(pasta, { recursive: true });

for (const m of MODELOS_SUPABASE_OPA) {
  fs.writeFileSync(path.join(pasta, m.arquivo), m.html(), "utf8");
  console.info(`${m.notificacao ? "aviso " : "e-mail"}  ${m.painel.padEnd(24)} ${m.arquivo.padEnd(40)} assunto: ${m.assunto}`);
}
