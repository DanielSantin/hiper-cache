# Release da extensão (Chrome Web Store, não listada)

A extensão é distribuída como item **não listado** da Chrome Web Store — não aparece em
busca, só quem tem o link instala. Isso substitui o antigo `atualizar.bat` (modo
desenvolvedor + git pull): a instalação passa a ser "abrir o link → Adicionar ao Chrome",
sem dev mode, sem política de registro, sem CBCM. O auto-update é 100% nativo do Chrome.

## Chave privada

`../keys/extension-key.pem` garante que o extension ID continua sendo sempre
`beegoeddmoobncnpjliopfddjedehhib` — a Web Store respeita o campo `"key"` do
`manifest.json` no primeiro upload do item. **Nunca versionar esse arquivo, nunca gerar
outro.** Guarde uma cópia de backup fora deste PC (não é mais estritamente necessária
depois do primeiro upload, mas é barato manter por segurança).

## Publicar uma nova versão

1. Suba o `"version"` em `manifest.json` (ex: `1.8` → `1.9`).
2. Rode:
   ```powershell
   ./scripts/build-zip.ps1
   ```
   Gera `hiper-cache-vX.Y.zip` na raiz do projeto (sem `scripts/`, sem a chave privada
   que já fica fora da pasta da extensão).
3. Em https://chrome.google.com/webstore/devconsole, abra o item, "Package" →
   "Upload new package" → selecione o zip → "Submit for review".
4. Itens não listados normalmente passam por revisão automática (minutos a poucas
   horas) — não precisa aprovação manual demorada como itens públicos, mas não é
   instantâneo. O Chrome atualiza os clientes sozinho depois que a nova versão fica
   pública (checagem periódica nativa, igual qualquer extensão da Web Store).

## Primeiro upload (setup único)

1. Crie uma conta de desenvolvedor em https://chrome.google.com/webstore/devconsole
   (taxa única de registro, ~US$5 — não é assinatura).
2. "New item" → suba o zip gerado por `build-zip.ps1`.
3. Preencha a ficha da loja: descrição, categoria, **pelo menos 1 screenshot**
   (print do popup ou da extensão em uso já serve), ícone 128×128 (já incluído no
   pacote via `manifest.json`).
4. Em "Privacy practices", justifique as permissões usadas:
   - `host_permissions` (`tagdrywall.hiper.com.br`, `api.hiper.com.br`,
     `api.sistema.santin.tec.br`): necessário pra interceptar e complementar as
     requisições do Hiper e falar com o backend interno da loja.
   - `tabs`, `scripting`: necessário pra injetar os módulos da extensão nas páginas
     do Hiper e reagir a mudanças de aba.
   - `webRequest`: necessário pra detectar eventos de rede específicos (atualização
     de situação de pedido) que não passam pelo `fetch` interceptável.
   - Precisa de uma URL de política de privacidade — pode ser uma página simples
     dizendo que os dados ficam só entre o navegador do usuário e o backend interno
     da loja, sem terceiros.
5. Em "Visibility", marque **Unlisted** (não Public, não Private).
6. Depois de aprovado, o link de instalação fica em
   `https://chromewebstore.google.com/detail/beegoeddmoobncnpjliopfddjedehhib`
   (assumindo que o ID é preservado — confirme no dashboard depois do upload).
7. Compartilhe esse link com as 5 máquinas — cada uma instala clicando "Adicionar ao
   Chrome", sem precisar de PowerShell nem admin.

## Numeração de orçamento (letra por perfil, contador compartilhado no servidor)

O código do orçamento (`T1005`, `T1006`...) usa uma **letra configurável por perfil**
(popup da extensão, `chrome.storage.local`, padrão `"T"`) — mas o **contador não é
local**: cada chamada de `POST /pedido/proximo-numero?letra=X` incrementa
atomicamente `sync_meta.orc_seq:<LETRA>` no backend (`BEGIN IMMEDIATE`). Isso significa
que várias pessoas podem usar a mesma letra (ex: todo mundo com o padrão "T") em
perfis e máquinas diferentes, ao mesmo tempo, sem nunca gerar o mesmo código — cada
requisição pega o próximo número da fila, não importa de onde veio.

Na primeira vez que uma letra é usada, o contador começa do maior número já salvo com
aquele prefixo (`SELECT codigo FROM pedidos WHERE codigo LIKE 'T%'`), então não colide
com códigos antigos gerados antes dessa migração.
