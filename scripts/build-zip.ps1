<#
.SYNOPSIS
  Gera o .zip pra upload manual no Chrome Web Store Developer Dashboard.
  Nao assina nada — a Web Store cuida da assinatura e do auto-update.

.EXAMPLE
  ./build-zip.ps1
#>

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestJson = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifestJson.version

# referencias/ tem fetches capturados com token Bearer — nunca vai no pacote.
# dist/ e onde os zips ficam (no .gitignore); fora do pacote, senao cada zip levaria os anteriores.
$excluir = @('scripts', 'tests', 'RELEASE.md', 'CLAUDE.md', 'referencias', '.gitignore', '.git', 'dist')
$dist    = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$saida   = Join-Path $dist "hiper-cache-v$version.zip"

if (Test-Path $saida) { Remove-Item $saida -Force }

$itens = Get-ChildItem -Path $root -Force | Where-Object { $excluir -notcontains $_.Name }

Compress-Archive -Path $itens.FullName -DestinationPath $saida -CompressionLevel Optimal

Write-Host "OK: $saida"
# chave-inicial.json (fora do git): estágio 1 da proteção da API vai COM ela;
# a partir do estágio 2, apague o arquivo antes de gerar o zip.
if (Test-Path (Join-Path $root "chave-inicial.json")) {
  Write-Host "ATENCAO: o zip leva chave-inicial.json (a chave da API vai para todos os PCs)." -ForegroundColor Yellow
} else {
  Write-Host "Sem chave-inicial.json: o zip nao distribui a chave." -ForegroundColor Green
}
Write-Host "Suba esse arquivo em https://chrome.google.com/webstore/devconsole"
