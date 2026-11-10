#!/usr/bin/env bash
# Guarda no GitHub, em repositórios PRIVADOS, o código que hoje só existe neste computador:
#   1. o CRM da OPA  -> gcompassofc/opa-crm   (ramos opa/* do GCompass-CRM)
#   2. o OPA Radar   -> gcompassofc/opa-radar (ramo master e o ramo de guarda de 10/11/2026)
#
# Quem roda é o Allyson: criar repositório e enviar código para fora é decisão de pessoa
# (o modo auto do Claude Code nega, e a regra do Radar pede que uma pessoa acione o push).
# No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/guardar-codigos-no-github.sh"
#
# O que ele cuida:
#   - confere que a conta ativa do gh é a gcompassofc;
#   - cria cada repositório como privado, só se ainda não existir;
#   - DESLIGA as automações (Actions) do repositório antes de enviar. Sem isso, o Radar
#     passaria a rodar coletas agendadas sozinho no GitHub, e o CRM rodaria testes a cada envio;
#   - não envia .env, material/ nem nada que esteja fora do git;
#   - pode rodar de novo: o que já está lá é só atualizado.
set -euo pipefail

CRM="/d/3. GCompass/GCompass-CRM"
RADAR="/d/1. OPA/radar-ilhabela"
DONO="gcompassofc"

ativa="$(gh api user -q .login)"
if [ "$ativa" != "$DONO" ]; then
  echo "A conta ativa do gh é '$ativa'. Rode antes: gh auth switch --user $DONO" >&2
  exit 1
fi

guardar() {
  local pasta="$1" repo="$2" descricao="$3"
  shift 3
  echo
  echo "== $repo"
  if gh repo view "$DONO/$repo" --json visibility -q .visibility >/dev/null 2>&1; then
    echo "   já existe"
  else
    gh repo create "$DONO/$repo" --private --description "$descricao" >/dev/null
    echo "   criado"
  fi
  local visibilidade
  visibilidade="$(gh repo view "$DONO/$repo" --json visibility -q .visibility)"
  if [ "$visibilidade" != "PRIVATE" ]; then
    echo "   PAREI: o repositório $repo não está privado ($visibilidade). Nada foi enviado." >&2
    exit 1
  fi
  gh api -X PUT "repos/$DONO/$repo/actions/permissions" -F enabled=false >/dev/null
  echo "   privado, automações desligadas"
  git -C "$pasta" remote remove privado 2>/dev/null || true
  git -C "$pasta" remote add privado "https://github.com/$DONO/$repo.git"
  for ramo in "$@"; do
    if git -C "$pasta" rev-parse --verify --quiet "refs/heads/$ramo" >/dev/null; then
      git -C "$pasta" push --quiet privado "refs/heads/$ramo:refs/heads/$ramo"
      echo "   enviado: $ramo ($(git -C "$pasta" log --oneline -1 "$ramo" | cut -c1-60))"
    else
      echo "   (ramo $ramo não existe aqui, pulei)"
    fi
  done
  gh api -X PATCH "repos/$DONO/$repo" -f default_branch="$1" >/dev/null 2>&1 || true
}

guardar "$CRM" "opa-crm" "CRM da OPA Imoveis. Privado." \
  opa/crm-local opa/painel-no-crm opa/crm-simplificado opa/waha-gows-etiquetas opa/captacoes-radar

guardar "$RADAR" "opa-radar" "OPA Radar (coletor de anuncios de Ilhabela). Privado." \
  master guarda/2026-11-10

echo
echo "Pronto. Para conferir: gh repo list $DONO --visibility private --limit 50 | grep opa-"
echo "Os dados do Radar (material/ e .radar-local/) não vão para o GitHub: estão em"
echo "C:\\Users\\allys\\OneDrive\\Documentos\\Backups-OPA\\radar\\radar-material-2026-11-10.zip"
