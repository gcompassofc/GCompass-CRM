#!/usr/bin/env bash
# Sobe o WAHA LOCAL no motor GOWS para testar a etiqueta "Lead OPA" (05/11/2026).
# Não toca na VPS. O motor vale para o contêiner inteiro, então o teste fica aqui.
#
# Usa um volume novo: a sessão NOWEB local fica guardada em gcrm-waha-data e volta
# com WAHA_MOTOR=noweb. Reaproveita as variáveis atuais do contêiner, sem imprimi-las.
#
# Uso (na raiz do repositório):
#   bash scripts/waha-gows-local.sh           sobe no GOWS
#   WAHA_MOTOR=noweb bash scripts/waha-gows-local.sh   volta ao NOWEB
#   WAHA_HOOK_URL=http://host.docker.internal:3100/api/v1/webhooks/waha   se o app não estiver na 3000
set -euo pipefail

motor="${WAHA_MOTOR:-gows}"
case "$motor" in
  gows)
    imagem="devlikeapro/waha:gows-2026.10.1"
    engine="GOWS"
    volume="gcrm-waha-gows-data"
    ;;
  noweb)
    imagem="devlikeapro/waha:noweb"
    engine="NOWEB"
    volume="gcrm-waha-data"
    ;;
  *) echo "WAHA_MOTOR deve ser gows ou noweb."; exit 1 ;;
esac

# Só as variáveis da aplicação: o resto (PATH, caminhos internos) vem da imagem nova.
envs=$(docker inspect gcrm-waha --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(WAHA_API_KEY|WHATSAPP_HOOK_HMAC_KEY)=')
hook="${WAHA_HOOK_URL:-$(docker inspect gcrm-waha --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^WHATSAPP_HOOK_URL=' | cut -d= -f2-)}"

args=()
while IFS= read -r linha; do args+=(-e "$linha"); done <<< "$envs"

docker pull "$imagem" >/dev/null
docker rm -f gcrm-waha >/dev/null
docker run -d --name gcrm-waha --restart unless-stopped \
  -p 127.0.0.1:3030:3000 \
  --add-host host.docker.internal:host-gateway \
  -v "$volume:/app/.sessions" \
  -v gcrm-waha-media:/app/.media \
  "${args[@]}" \
  -e WHATSAPP_HOOK_URL="$hook"   -e WHATSAPP_DEFAULT_ENGINE="$engine" \
  -e WHATSAPP_HOOK_EVENTS="message,message.any,message.ack,session.status,state.change,label.upsert,label.deleted,label.chat.added,label.chat.deleted" \
  -e WAHA_DASHBOARD_ENABLED=false \
  -e WHATSAPP_SWAGGER_ENABLED=false \
  -e WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC=false \
  "$imagem" >/dev/null

echo "WAHA local no motor $engine ($imagem), volume $volume."
