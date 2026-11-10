#!/usr/bin/env bash
# Publica o painel do Studio da OPA (studio.opailhabela.com.br) a partir do main do site.
#
# Quem roda é o Allyson: o login da Cloudflare é um só neste computador e alterna entre a conta
# da G-Compass e a da OPA. Trocar de conta abre o navegador e pede o clique de uma pessoa.
# No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/publicar-painel-studio.sh"
#
# O que ele cuida:
#   - só publica o que está no main do GitHub (gcompassofc/new-opa), nunca um ramo de trabalho;
#   - confere que a conta logada enxerga o projeto opa-painel. Se não enxerga, abre o login
#     (escolher a conta da OPA) e confere de novo. Sem isso, o deploy na conta errada poderia
#     criar um painel novo e vazio em outra conta;
#   - roda os testes da revisão e da guarda antes de publicar;
#   - só o painel. O site público e o banco não são tocados (esta publicação não tem migração).
set -euo pipefail

PASTA="/d/1. OPA/1. SITE-revisao-acesso"
PROJETO="opa-painel"
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID 2>/dev/null || true

cd "$PASTA"

echo "== 1. Código"
git fetch --quiet origin main
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "PAREI: há arquivo alterado em $PASTA. Nada foi publicado." >&2
  exit 1
fi
git checkout --quiet --detach origin/main
echo "   publicando: $(git log --oneline -1 | cut -c1-80)"

echo "== 2. Conta da Cloudflare"
enxerga() {
  local lista
  lista="$(npx --yes wrangler pages project list 2>/dev/null || true)"
  case "$lista" in *"$PROJETO"*) return 0 ;; *) return 1 ;; esac
}
if ! enxerga; then
  echo "   a conta logada não tem o $PROJETO. Vou abrir o login: escolha a conta da OPA."
  npx --yes wrangler login
  if ! enxerga; then
    echo "PAREI: a conta escolhida ainda não enxerga o $PROJETO. Nada foi publicado." >&2
    exit 1
  fi
fi
echo "   conta certa: enxerga o $PROJETO"

echo "== 3. Pacote e testes"
node scripts/build-painel.js | tail -1
node scripts/teste-revisao-aceite.mjs | tail -1
node scripts/teste-guarda-deploy.js | tail -1

echo "== 4. Publicação"
npx --yes wrangler pages deploy --cwd dist-painel --project-name "$PROJETO" --branch main

echo
echo "== 5. Conferência"
npx --yes wrangler pages deployment list --project-name "$PROJETO" 2>/dev/null | head -8
echo
echo "Pronto. O wrangler ficou logado na conta da OPA."
echo "Antes de publicar a Central ou o site da G-Compass, rode: npx wrangler login (conta da G-Compass)."
