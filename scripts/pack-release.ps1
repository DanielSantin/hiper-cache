<#
.SYNOPSIS
  Empacota a extensao (.crx), gera update.xml e copia os dois arquivos
  para o clone local do repositorio hiper-sites, pronto para commit/push.

.PARAMETER SiteRepoPath
  Caminho local para o clone do repositorio hiper-sites.

.PARAMETER SiteDomain
  Dominio publico do site (sem barra no final), ex: https://hiper.seudominio.com

.EXAMPLE
  ./pack-release.ps1 -SiteRepoPath "C:\Users\danie\Documents\hiper-sites" -SiteDomain "https://hiper.seudominio.com"
#>
param(
    [Parameter(Mandatory = $true)][string]$SiteRepoPath,
    [Parameter(Mandatory = $true)][string]$SiteDomain
)

$ErrorActionPreference = "Stop"

$root      = Split-Path -Parent $PSScriptRoot
$keyPath   = Join-Path (Split-Path -Parent $root) "keys\extension-key.pem"
$manifest  = Join-Path $root "manifest.json"
$chrome    = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$crxName   = "hiper-cache.crx"

if (-not (Test-Path $keyPath)) {
    throw "Chave privada nao encontrada em $keyPath. Nunca recrie essa chave depois do primeiro release - o extension ID muda."
}
if (-not (Test-Path $chrome)) {
    throw "chrome.exe nao encontrado em $chrome. Ajuste o caminho no script."
}

$manifestJson = Get-Content $manifest -Raw | ConvertFrom-Json
$version = $manifestJson.version
Write-Host "Empacotando versao $version..."

# Chrome escreve o .crx como <nome-da-pasta>.crx ao lado da pasta da extensao
$tmpCrx = "$root.crx"
if (Test-Path $tmpCrx) { Remove-Item $tmpCrx -Force }

& $chrome --pack-extension="$root" --pack-extension-key="$keyPath" | Out-Null

if (-not (Test-Path $tmpCrx)) {
    throw "Falha ao gerar o .crx. Rode o comando manualmente para ver o erro:`n$chrome --pack-extension=`"$root`" --pack-extension-key=`"$keyPath`""
}

if (-not (Test-Path $SiteRepoPath)) {
    throw "SiteRepoPath nao existe: $SiteRepoPath"
}

$finalCrxPath = Join-Path $SiteRepoPath $crxName
Move-Item $tmpCrx $finalCrxPath -Force

$extensionId = "beegoeddmoobncnpjliopfddjedehhib"
$updateXmlPath = Join-Path $SiteRepoPath "update.xml"

$xml = @"
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$extensionId'>
    <updatecheck codebase='$SiteDomain/$crxName' version='$version' />
  </app>
</gupdate>
"@

[System.IO.File]::WriteAllText($updateXmlPath, $xml, (New-Object System.Text.UTF8Encoding($false)))

# Publica os instaladores junto (fonte unica em scripts/) — sao os arquivos
# baixados por "irm $SiteDomain/instalar.ps1 | iex" nas maquinas da loja.
Copy-Item (Join-Path $PSScriptRoot "install-policy.ps1") (Join-Path $SiteRepoPath "install-policy.ps1") -Force
Copy-Item (Join-Path $PSScriptRoot "instalar.ps1")       (Join-Path $SiteRepoPath "instalar.ps1")       -Force

Write-Host ""
Write-Host "OK. Gerado:"
Write-Host "  $finalCrxPath"
Write-Host "  $updateXmlPath"
Write-Host "  $(Join-Path $SiteRepoPath 'install-policy.ps1')"
Write-Host "  $(Join-Path $SiteRepoPath 'instalar.ps1')"
Write-Host ""
Write-Host "Proximo passo: revisar e dar 'git commit' + 'git push' dentro de $SiteRepoPath"
Write-Host "O Chrome so detecta a atualizacao depois que o push for publicado no Cloudflare Pages."
