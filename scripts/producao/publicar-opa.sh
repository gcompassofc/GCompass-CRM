#!/usr/bin/env bash
# Publica o commit atual do ramo opa/crm-local no CRM da OPA (crm.opailhabela.com.br).
#
# Quem roda é o Allyson: o modo auto do Claude Code nega publicação em produção à IA.
# No PowerShell, chamar pelo Git Bash (o `bash` solto abre o WSL, que não acha a chave SSH):
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/publicar-opa.sh" [migration.sql ...]
#
# Migrations novas vão como argumento (caminho a partir da raiz do repositório), na ordem.
# Cada uma roda numa transação só e precisa poder rodar de novo sem estragar.
# Guarda cópia do .env e da imagem anterior para voltar se precisar.
set -euo pipefail

REPO="/d/3. GCompass/GCompass-CRM"
VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"
MARCA="antes-$(date +%Y%m%d-%H%M)"

cd "$REPO"
echo "== Commit que vai para o ar: $(git log --oneline -1)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Há mudança sem commit: o git archive leva só o que está commitado. Commite antes." >&2
  exit 1
fi
for m in "$@"; do test -f "$m" || { echo "Migration não encontrada: $m" >&2; exit 1; }; done

echo "== 1/6 Conferências e cópia do .env e da imagem atual"
$SSH "cd /opt/crm && test \$(grep -c '^PII_' .env) -ge 3 && echo 'chaves de cifra: ok' \
  && grep -q \"^APP_PULL_POLICY='\\?never\" .env && echo 'pull travado: ok' \
  && cp -p .env .env.bak-$MARCA && docker tag ghcr.io/gcompassofc/gcompass-crm:latest gcompass-crm:$MARCA && echo 'copia: ok'"

echo "== 2/6 Código do commit para /opt/crm (o .env não vai junto)"
git archive --format=tar HEAD | $SSH 'tar -x -C /opt/crm && echo ok'

echo "== 3/6 Migrations (${#} nesta publicação)"
for m in "$@"; do
  echo "-- $m"
  $SSH "cd /opt/crm && URL=\$(grep '^SUPABASE_DB_URL=' .env | cut -d= -f2- | tr -d \"\\047\\042\") \
    && docker run --rm -i postgres:17-alpine psql \"\$URL\" -v ON_ERROR_STOP=1 -1 -q < $m && echo ok"
done

echo "== 4/6 Imagem do app construída na VPS (uns 6 minutos)"
$SSH 'cd /opt/crm && docker compose -f docker-compose.prod.yml -f docker-compose.build.yml build app'

echo "== 5/6 Sobe o app novo (WhatsApp, Redis e agendador continuam rodando)"
$SSH 'cd /opt/crm && docker compose -f docker-compose.prod.yml up -d app'

echo "== 6/6 Conferência"
sleep 25
$SSH 'cd /opt/crm && docker compose -f docker-compose.prod.yml ps --format "{{.Service}} {{.Status}}"'
node scripts/producao/conferir-producao.mjs || true

echo
echo "Para voltar o app à versão anterior:"
echo "  $SSH 'docker tag gcompass-crm:$MARCA ghcr.io/gcompassofc/gcompass-crm:latest && cd /opt/crm && docker compose -f docker-compose.prod.yml up -d app'"
