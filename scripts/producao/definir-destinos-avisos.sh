#!/usr/bin/env bash
# Grava, no CRM da OPA em produção, os números que recebem os avisos da gestão e da
# administração. Detalhes em definir-destinos-avisos.mjs (mesma pasta).
# Só vale depois de publicado o código que lê `avisos` (10/11/2026); antes disso a
# gravação não muda nada.
#
# No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/definir-destinos-avisos.sh"
#       -> só mostra o que está gravado (números mascarados)
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/definir-destinos-avisos.sh" --gestor=NUM1,NUM2 --admin=NUM1
#       -> grava (acrescente --seco para só conferir)
#   ... --teste=NUM                      -> modo de teste: o OPA Lembretes só manda para esse número ("--teste=" sai do teste)
#   ... --assistente=NUM:Nome:admin --assistente-ligado=sim   -> quem fala com o assistente e se ele está ligado
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"
NO_APP="cd /opt/crm && docker compose -f docker-compose.prod.yml exec -T app"

ARGS=""
for a in "$@"; do
  case "$a" in
    --gestor=* | --admin=* | --teste=* | --assistente-ligado=* | --seco) ARGS="$ARGS $(printf '%s' "$a" | tr -cd '0-9a-z=,-')" ;;
    # NUMERO:Nome:papel. Só letras, números, dois-pontos e vírgula passam (o nome vai sem espaço nem acento).
    --assistente=*) ARGS="$ARGS $(printf '%s' "$a" | tr -cd '0-9A-Za-z=,:-')" ;;
    *)
      echo "Use: definir-destinos-avisos.sh [--gestor=NUM,NUM] [--admin=NUM,NUM] [--teste=NUM] [--assistente=NUM:Nome:papel] [--assistente-ligado=sim|nao] [--seco]" >&2
      exit 1
      ;;
  esac
done

echo "== Destinos dos avisos da OPA"
$SSH "$NO_APP node --input-type=module - $ARGS" < "$AQUI/definir-destinos-avisos.mjs"
