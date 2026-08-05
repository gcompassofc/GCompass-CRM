# Rodar um fork com design próprio na sua VPS

Este guia é para quem instalou o DeskcommCRM numa VPS, **fez mudanças no
código** (design, textos, ajustes) e quer colocá-las no ar sem perder as
correções que o projeto original publica.

Se você não mexeu no código, não precisa disto: `update.sh` já resolve.

---

## Por que o caminho normal não serve

A instalação padrão roda uma **imagem Docker pronta** do repositório oficial
(`ghcr.io/melgarafael/deskcommcrm`). O `update.sh` faz `git checkout <tag>` e
baixa a imagem correspondente.

Duas consequências, e as duas mordem:

1. **Editar arquivos na VPS não muda nada no ar.** O container roda a imagem,
   não os arquivos do disco. Você edita, recarrega a página, e vê a versão
   antiga — sem nenhuma mensagem de erro explicando por quê.
2. **O próximo `update.sh` apaga suas mudanças.** `git checkout` descarta
   qualquer edição local. Sem aviso, porque do ponto de vista do script isso é
   arrumar a casa.

O conserto tem duas metades: **seu código precisa virar sua imagem** (build), e
**sua VPS precisa puxar a sua imagem** (registro).

---

## Passo 1 — Fork no GitHub

No GitHub, abra `melgarafael/DeskcommCRM` e clique em **Fork**. Isso cria
`SEU-USUARIO/DeskcommCRM`.

Na sua máquina, aponte o repositório para os dois lugares:

```bash
# 'origin' passa a ser o SEU fork (para onde você envia)
git remote set-url origin https://github.com/SEU-USUARIO/DeskcommCRM.git

# 'upstream' é o projeto original (de onde você recebe correções)
git remote add upstream https://github.com/melgarafael/DeskcommCRM.git

git remote -v   # confira: origin = seu, upstream = original
```

Envie seu trabalho:

```bash
git push -u origin feat/mobile-bussola
```

---

## Passo 2 — A imagem se constrói sozinha

**Não precisa editar nada.** O `.github/workflows/publish-image.yml` usa
`IMAGE_NAME: ${{ github.repository }}`, que no seu fork resolve sozinho para
`ghcr.io/SEU-USUARIO/deskcommcrm`.

O build roda nos servidores do GitHub (grátis, ~6 min). Sua VPS não gasta CPU
com isso — importante porque, durante um build local, os vCPUs ficam saturados
e o CRM que já está atendendo cliente fica lento.

Para publicar uma versão:

```bash
git checkout main
git merge feat/mobile-bussola
git push origin main

git tag v1.0.0-meu       # a tag é o que vira versão instalável
git push origin v1.0.0-meu
```

Acompanhe em **Actions** no GitHub. Ao fim, a imagem aparece em **Packages**.

> **Deixe o pacote público** (Packages → o pacote → Package settings → Change
> visibility → Public). Se ficar privado, a VPS precisa de login no GHCR para
> baixar, e o `docker pull` falha com "manifest unknown" — erro que não diz que
> o problema é permissão.

---

## Passo 3 — Apontar a VPS para a sua imagem

Na VPS, dentro da pasta do projeto:

```bash
cd ~/deskcommcrm     # ou onde você instalou

# 1. BACKUP ANTES DE QUALQUER COISA
bash hostgator-setup-kit/backup.sh

# 2. Anote a imagem atual — é para ela que você volta se der errado
grep APP_IMAGE .env
```

Agora aponte o repositório e a imagem para os seus:

```bash
git remote set-url origin https://github.com/SEU-USUARIO/DeskcommCRM.git

# IMAGE_REPO manda em qual registro o update.sh procura a imagem.
# Sem esta linha, todo update.sh volta calado para a imagem do projeto
# original — com o seu código no disco e a imagem de outra pessoa rodando.
echo 'IMAGE_REPO=ghcr.io/SEU-USUARIO/deskcommcrm' >> .env
```

E atualize:

```bash
bash hostgator-setup-kit/update.sh
```

Ele faz backup de novo, baixa sua tag, aplica o banco e sobe a imagem nova.

---

## Se der errado: voltar atrás

O `update.sh` guarda a imagem anterior antes de trocar. Para voltar na mão:

```bash
cd ~/deskcommcrm
# use o valor que você anotou no Passo 3
sed -i 's|^APP_IMAGE=.*|APP_IMAGE=ghcr.io/melgarafael/deskcommcrm:latest|' .env
docker compose -f docker-compose.prod.yml up -d --force-recreate app
```

O banco **não** é desfeito por isso. Se a atualização mexeu no schema e você
precisa voltar os dados também, use `restore.sh` com o backup do Passo 3.

---

## Receber correções do projeto original

De tempos em tempos, traga o que o autor publicou:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

Se aparecer conflito, ele estará quase sempre nos arquivos que você mudou
(`app/globals.css`, componentes de UI). Resolva mantendo os **dois** lados: a
correção dele e o seu design. Nunca resolva escolhendo um lado no automático —
é assim que se perde silenciosamente uma correção de segurança.

Depois: `git push origin main`, nova tag, e `update.sh` na VPS.

---

## Alternativa: build na própria VPS

Só se você não quiser depender do GitHub. Exige 4GB+ de RAM e leva 15-25 min,
com o site lento nesse tempo:

```bash
cd ~/deskcommcrm
git pull origin main
docker compose -f docker-compose.prod.yml -f docker-compose.build.yml build app
echo 'APP_IMAGE=deskcomm-app:local' >> .env
echo 'APP_PULL_POLICY=never' >> .env
docker compose -f docker-compose.prod.yml up -d
```

`APP_PULL_POLICY=never` é obrigatório: sem ele o compose tenta puxar
`deskcomm-app:local` de um registro, não acha, e o container não sobe.
