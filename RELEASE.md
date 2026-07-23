# Release e auto-update da extensão

A extensão deixou de ser instalada via `atualizar.bat` (modo desenvolvedor + git pull).
Agora ela é distribuída como `.crx` assinado, force-instalada via política do Chrome,
e atualizada automaticamente a partir de `https://sistema.santin.tec.br/update.xml`.

## Por que precisa de CBCM

O Chrome só aceita `ExtensionInstallForcelist` com um `update_url` próprio (fora da
Chrome Web Store) em máquinas "enterprise managed" — só gravar a chave no registro não
conta como gerenciado, e o Chrome ignora a política silenciosamente (mostra `[BLOCKED]`
em `chrome://policy`, com um aviso "Este computador não foi detectado como gerenciado
por empresa"). Sem domínio Active Directory, a forma gratuita de virar "gerenciado" é
inscrever a máquina no **Chrome Browser Cloud Management (CBCM)**.

Isso é inscrição por máquina via um token — não pede login de ninguém, os perfis dos
vendedores continuam sem conta Google. Passo a passo (feito uma única vez):

1. Acesse **https://admin.google.com** com uma conta Google qualquer e crie uma
   organização gratuita (não precisa de Google Workspace pago — recuse qualquer oferta
   de teste pago se aparecer).
2. No console, vá em **Dispositivos → Chrome → Configurações → Inscrição** (ou busque
   "token de inscrição" na busca do admin console) e gere um **token de inscrição**
   pra unidade organizacional padrão dos navegadores.
3. Copie esse token — é o mesmo valor usado em todas as 5 máquinas, não muda por PC.
4. Cole o token em `scripts/instalar.ps1` (variável `$enrollmentToken`, tem um `TODO`
   marcando o lugar) e rode `pack-release.ps1` de novo pra publicar a versão atualizada
   do instalador no site.

Os menus exatos do admin console do Google mudam de vez em quando — se o caminho acima
não bater, busque por "enrollment token" ou "inscrição" dentro do console.

## Chave privada

`../keys/extension-key.pem` é o que garante que o extension ID continua sendo sempre
`beegoeddmoobncnpjliopfddjedehhib`. **Nunca versionar esse arquivo, nunca gerar outro.**
Se ela for perdida, é preciso gerar uma chave nova, o que muda o ID e obriga reinstalar
a extensão (e reconfigurar a política) em todas as máquinas. Guarde uma cópia de backup
fora deste PC (gerenciador de senhas, cofre, etc).

## Publicar uma nova versão

1. Suba o `"version"` em `manifest.json` (ex: `1.5` → `1.6`).
2. Rode (PowerShell, não precisa ser admin):
   ```powershell
   ./scripts/pack-release.ps1 -SiteRepoPath "C:\Users\danie\Documents\hiper-sites" -SiteDomain "https://sistema.santin.tec.br"
   ```
   Isso gera `hiper-cache.crx` e `update.xml` dentro do clone do `hiper-sites`.
3. Revise o diff em `hiper-sites` e dê `git add` + `commit` + `push`. O Cloudflare Pages
   publica automaticamente.
4. O Chrome verifica `update_url` periodicamente (a cada ~5h, ou ao reiniciar o navegador).
   Não há como forçar todos os clientes a atualizar na hora.

## Instalar/migrar uma máquina (CBCM + força via política, sem modo desenvolvedor)

Pré-requisito: token de inscrição CBCM já configurado em `instalar.ps1` (ver seção
acima) e publicado no site.

1. Em `chrome://extensions`, remova a instalação antiga "unpacked" (a que veio do
   `atualizar.bat`), se existir.
2. Abra PowerShell **como Administrador** e rode:
   ```powershell
   irm https://sistema.santin.tec.br/instalar.ps1 | iex
   ```
   Ele só pergunta a letra desta máquina (ex: A, B, C...) — o token de inscrição já vem
   embutido, o mesmo pra todas as máquinas. Baixa e chama `install-policy.ps1` direto do
   site, sem precisar clonar o repositório da extensão nessa máquina.

   Alternativa manual, se preferir rodar localmente com o repo já clonado:
   ```powershell
   ./scripts/install-policy.ps1 -EnrollmentToken "xxxx-xxxx-xxxx" -Letra "B"
   ```
3. **Encerre TODOS os processos `chrome.exe`** (Gerenciador de Tarefas — só fechar as
   janelas não é suficiente, o Chrome pode manter processos em segundo plano) e reabra.
4. Confirme em `chrome://management` que aparece "Este navegador é gerenciado pela sua
   organização". Confirme em `chrome://policy` que `ExtensionInstallForcelist` não tem
   mais `[BLOCKED]` nem erro.
5. Confirme em `chrome://extensions` que a extensão aparece instalada e marcada como
   "Instalada pela empresa" — não pode ser removida pelo usuário nem afetada por toggles
   de modo desenvolvedor.

Repita os passos 1-4 nas 5 máquinas, cada uma com uma letra diferente — o token é o
mesmo em todas.

`install-policy.ps1` e `instalar.ps1` são publicados no site a cada release
(`pack-release.ps1` já copia os dois pro clone do `hiper-sites`) — sempre a mesma
versão que está no repositório da extensão, sem precisar manter cópias separadas.

## Numeração de orçamento (letra por máquina, contador compartilhado)

O código do orçamento (`A1005`, `B1002`...) não é mais gerado nem guardado no
`chrome.storage.local` de cada perfil — isso causava colisão: perfis diferentes podiam
gerar o mesmo código e sobrescrever silenciosamente o orçamento um do outro
(`POST /pedido` faz `ON CONFLICT DO UPDATE`).

Agora:
- A **letra** é definida por máquina via política (`chrome.storage.managed`, gravada pelo
  `install-policy.ps1` no registro) — todos os perfis do Chrome da mesma máquina leem a
  mesma letra automaticamente, sem configurar nada no popup.
- O **contador** de cada letra vive no backend (`sync_meta.orc_seq:<LETRA>` em `dbApi`),
  incrementado atomicamente (`BEGIN IMMEDIATE`) — mesmo que duas máquinas usem a letra
  errada por engano ao mesmo tempo, não há corrida perdida silenciosamente.
- Na primeira vez que uma letra é usada, o contador começa do maior número já salvo com
  aquele prefixo (`SELECT codigo FROM pedidos WHERE codigo LIKE 'B%'`), então não colide
  com códigos antigos gerados localmente antes dessa migração.
