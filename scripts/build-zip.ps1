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

$excluir = @('scripts', 'RELEASE.md', '.gitignore', '.git')
$saida   = Join-Path (Split-Path -Parent $root) "hiper-cache-v$version.zip"

if (Test-Path $saida) { Remove-Item $saida -Force }

$itens = Get-ChildItem -Path $root -Force | Where-Object { $excluir -notcontains $_.Name }

Compress-Archive -Path $itens.FullName -DestinationPath $saida -CompressionLevel Optimal

Write-Host "OK: $saida"
Write-Host "Suba esse arquivo em https://chrome.google.com/webstore/devconsole"
