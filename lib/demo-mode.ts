import { env } from "@/lib/env";

/**
 * Modo VITRINE: o app roda inteiro sem Supabase, WAHA, Redis ou Docker.
 *
 * Ligado quando `NEXT_PUBLIC_SUPABASE_URL` aponta para o host de demonstração
 * — um endereço que não resolve. É o que permite abrir o produto no
 * `localhost` sem instalar nada, para ver a interface funcionando.
 *
 * A CERCA, e por que ela importa: em modo demo a autenticação é dispensada e
 * as rotas devolvem dados de mentira. Se `demo.supabase.co` fosse alcançável,
 * ou se alguém apontasse esta variável para um Supabase real acreditando estar
 * numa demo, o resultado seria um CRM sem login. Por isso o gatilho é um host
 * fixo e inexistente, e não um `DEMO=1` que qualquer deploy poderia herdar
 * por acidente.
 *
 * NÃO é ambiente de teste: a doutrina de QA Visual (CLAUDE.md) exige banco
 * fresco vindo do `supabase/baseline.sql`. Verde aqui não prova nada sobre a
 * instalação real.
 *
 * Existe como constante única porque a mesma comparação estava escrita em
 * dezesseis arquivos; um erro de digitação em qualquer um deles abriria um
 * buraco silencioso — a rota cairia no caminho real e explodiria, ou pior,
 * pularia a autenticação onde não devia.
 */
/** Vitest define `NODE_ENV=test` e `VITEST` no processo que roda a suíte. */
const ESTA_EM_TESTE = process.env.NODE_ENV === "test" || !!process.env.VITEST;

export const IS_DEMO_MODE =
  env.NEXT_PUBLIC_SUPABASE_URL.includes("demo.supabase.co") && !ESTA_EM_TESTE;

/**
 * A SEGUNDA cerca, e a que quase faltou.
 *
 * `tests/setup/vitest.setup.ts` carrega o `.env.local` da máquina ANTES dos
 * placeholders (`??=`, então o valor real vence). Numa máquina com a demo
 * ligada, a suíte inteira rodava em modo demo: os desvios de demonstração
 * disparavam dentro dos testes e faziam `requireRole` devolver `ok` sem
 * consultar papel nenhum.
 *
 * O resultado não foi teste vermelho — foi teste VERDE pelo motivo errado. 35
 * casos de RBAC, autenticação e falha-fechada passaram a exercitar o atalho da
 * vitrine em vez da regra que existem para vigiar. Uma suíte de segurança que
 * aprova tudo é pior que suíte nenhuma, porque ninguém desconfia dela.
 *
 * Por isso o modo demo é desligado à força sob teste: o que a suíte mede é o
 * caminho real, sempre — mesmo que o `.env.local` de quem roda diga outra
 * coisa.
 */
