#!/usr/bin/env bash
# Endurece o acesso à VPS do CRM da OPA (05/11/2026). Quem roda é o Allyson, pelo Git Bash.
# Pode rodar de novo. Mantém a entrada por chave do root, para não trancar ninguém do lado de fora.
#
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/endurecer-vps.sh"
#
# - SSH: só por chave, sem senha, com poucas tentativas.
# - fail2ban no SSH.
# - Firewall só com 22, 80 e 443.
# - Atualização automática de segurança do sistema.
# - .env só legível pelo root.
set -euo pipefail

VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"

$SSH 'bash -s' <<'REMOTO'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

cat > /etc/ssh/sshd_config.d/10-opa-endurecer.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
X11Forwarding no
CONF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

apt-get update -qq
apt-get install -y -qq fail2ban unattended-upgrades >/dev/null
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

if command -v ufw >/dev/null; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ufw status | head -12
fi

chmod 600 /opt/crm/.env /opt/crm/.env.bak-* 2>/dev/null || true

echo "--- Conferência"
sshd -T | grep -E '^(passwordauthentication|permitrootlogin|maxauthtries) '
fail2ban-client status sshd | grep -E 'Currently banned|Total banned' || true
stat -c '%a %n' /opt/crm/.env
REMOTO

echo "Conferindo se a chave ainda entra..."
$SSH 'echo ok'
