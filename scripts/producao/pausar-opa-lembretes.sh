#!/usr/bin/env bash
# Pausa e religa o número de avisos "OPA Lembretes" no CRM da OPA em produção.
# O que muda com ele pausado está em pausar-opa-lembretes.mjs (mesma pasta).
# Não mexe em nenhum número de corretor. Não desloga: religar não pede QR.
#
# No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/pausar-opa-lembretes.sh" --conferir
#       -> só leitura: estado, quem entra com código por WhatsApp, agendados pendentes, avisos de 7 dias
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/pausar-opa-lembretes.sh" --pausar
#       -> para o número (recusa se alguém entra no CRM com código por WhatsApp)
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/pausar-opa-lembretes.sh" --pausar --mesmo-assim
#       -> para mesmo com gente usando código por WhatsApp
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/pausar-opa-lembretes.sh" --religar
#       -> volta a mandar
#
# O .mjs vai pela entrada padrão para dentro do contêiner do app, que já tem as
# variáveis (Supabase e WAHA): nenhum segredo passa pela sua máquina nem fica em arquivo.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"
NO_APP="cd /opt/crm && docker compose -f docker-compose.prod.yml exec -T app"

case "${1:-}" in
  --conferir) ACAO="conferir" ;;
  --pausar) ACAO="pausar" ;;
  --religar) ACAO="religar" ;;
  *)
    echo "Use: pausar-opa-lembretes.sh --conferir | --pausar [--mesmo-assim] | --religar" >&2
    exit 1
    ;;
esac
EXTRA=""
[ "${2:-}" = "--mesmo-assim" ] && EXTRA="--mesmo-assim"

echo "== OPA Lembretes · $ACAO"
$SSH "$NO_APP node --input-type=module - --acao=$ACAO $EXTRA" < "$AQUI/pausar-opa-lembretes.mjs"
