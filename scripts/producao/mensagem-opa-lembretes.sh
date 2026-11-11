#!/usr/bin/env bash
# Manda UMA mensagem do número OPA Lembretes para alguém da equipe da OPA, em produção.
# Detalhes em mensagem-opa-lembretes.mjs (mesma pasta).
#
# No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/mensagem-opa-lembretes.sh" Marco "caminho/do/texto.txt"
#   ... Marco "caminho/do/texto.txt" --seco     -> só mostra para quem iria
#
# O texto vem de um arquivo (UTF-8) e viaja em base64: acento e quebra de linha chegam inteiros.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"
NO_APP="cd /opt/crm && docker compose -f docker-compose.prod.yml exec -T app"

PARA="$(printf '%s' "${1:-}" | tr -cd 'A-Za-z')"
ARQUIVO="${2:-}"
SECO=""
[ "${3:-}" = "--seco" ] && SECO="--seco"
if [ -z "$PARA" ] || [ ! -f "$ARQUIVO" ]; then
  echo "Use: mensagem-opa-lembretes.sh PrimeiroNome arquivo-do-texto.txt [--seco]" >&2
  exit 1
fi
TEXTO64="$(base64 -w0 < "$ARQUIVO")"

echo "== OPA Lembretes · mensagem para $PARA"
$SSH "$NO_APP node --input-type=module - --para=$PARA --texto64=$TEXTO64 $SECO" < "$AQUI/mensagem-opa-lembretes.mjs"
