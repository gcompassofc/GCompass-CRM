#!/usr/bin/env bash
# Recria Redis, SRH e WAHA do ambiente local escutando só em 127.0.0.1, e o
# Redis com senha (auditoria de 30/10/2026, P6). Antes, as três portas abriam
# para qualquer aparelho do mesmo Wi-Fi, e o Redis respondia sem senha.
#
# Mantém os volumes (sessão do WhatsApp e mídia) e as variáveis atuais de cada
# contêiner. A senha do Redis é gerada aqui, gravada no .env.local como
# REDIS_SENHA_LOCAL e nunca impressa.
#
# Uso (na raiz do repositório):  bash scripts/servicos-locais-fechados.sh
set -euo pipefail

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "Rode na raiz do repositório (falta $ENV_FILE)."; exit 1; }

senha=$(grep -E '^REDIS_SENHA_LOCAL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
if [ -z "$senha" ]; then
  senha=$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')
  printf '\n# Senha do Redis local (scripts/servicos-locais-fechados.sh)\nREDIS_SENHA_LOCAL=%s\n' "$senha" >> "$ENV_FILE"
fi

# Variáveis atuais de um contêiner, uma por linha, sem as do sistema.
envs_de() {
  docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -vE '^(PATH|HOME|LANG|LC_ALL|TERM|NODE_VERSION|YARN_VERSION|OTP_VERSION|REBAR3_VERSION|ELIXIR_VERSION|GOSU_VERSION|REDIS_VERSION|REDIS_DOWNLOAD_URL|REDIS_DOWNLOAD_SHA)=' \
    | grep -v '^$'
}

echo "Redis..."
docker rm -f gcrm-redis >/dev/null 2>&1 || true
docker run -d --name gcrm-redis --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine redis-server --save "" --appendonly no --requirepass "$senha" >/dev/null

echo "SRH (ponte HTTP do Redis)..."
srh_env=$(envs_de gcrm-srh | grep -v '^SRH_CONNECTION_STRING=')
docker rm -f gcrm-srh >/dev/null 2>&1 || true
args=()
while IFS= read -r linha; do args+=(-e "$linha"); done <<< "$srh_env"
docker run -d --name gcrm-srh --restart unless-stopped \
  -p 127.0.0.1:8079:80 \
  "${args[@]}" -e "SRH_CONNECTION_STRING=redis://:${senha}@host.docker.internal:6379" \
  --add-host host.docker.internal:host-gateway \
  hiett/serverless-redis-http:latest >/dev/null

echo "WAHA (mantém a sessão do WhatsApp)..."
waha_env=$(envs_de gcrm-waha | grep -vE '^(PUPPETEER_SKIP_DOWNLOAD|NODE_OPTIONS|WAHA_GOWS_PATH|WAHA_GOWS_SOCKET|CHOKIDAR_USEPOLLING|CHOKIDAR_INTERVAL|WAHA_ZIPPER|GODEBUG)=')
docker rm -f gcrm-waha >/dev/null 2>&1 || true
args=()
while IFS= read -r linha; do args+=(-e "$linha"); done <<< "$waha_env"
docker run -d --name gcrm-waha --restart unless-stopped \
  -p 127.0.0.1:3030:3000 \
  "${args[@]}" \
  --add-host host.docker.internal:host-gateway \
  -v gcrm-waha-data:/app/.sessions -v gcrm-waha-media:/app/.media \
  devlikeapro/waha:noweb >/dev/null

docker ps --filter name=gcrm- --format '{{.Names}}  {{.Ports}}'
echo "Pronto: Redis com senha e as três portas só em 127.0.0.1."
