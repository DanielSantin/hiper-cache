<#
.SYNOPSIS
  Bootstrap publico — baixa e roda install-policy.ps1 direto do site,
  perguntando so a letra desta maquina (o token de inscricao CBCM ja vem
  fixo aqui, e o mesmo pra todas as maquinas da loja). Precisa ser Administrador.

.EXAMPLE
  Em PowerShell ABERTO COMO ADMINISTRADOR:
    irm https://sistema.santin.tec.br/instalar.ps1 | iex
#>

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Rode isso em um PowerShell aberto como Administrador (botao direito > Executar como administrador)."
    exit 1
}

# TODO: preencher com o token gerado no admin console (Chrome Browser Cloud
# Management) — mesmo token em todas as maquinas. Ver RELEASE.md.
$enrollmentToken = "COLOQUE_O_TOKEN_AQUI"
$siteDomain = "https://sistema.santin.tec.br"

if ($enrollmentToken -eq "COLOQUE_O_TOKEN_AQUI") {
    Write-Error "instalar.ps1 ainda nao tem o token de inscricao CBCM configurado. Gere o token no admin console e edite este arquivo (ver RELEASE.md)."
    exit 1
}

$letra = Read-Host "Letra dos orcamentos desta maquina (ex: A, B, C...)"

if ($letra -notmatch '^[A-Za-z]{1,3}$') {
    Write-Error "Letra invalida: '$letra'. Use de 1 a 3 letras (ex: A, B, AT)."
    exit 1
}

$tmp = Join-Path $env:TEMP "hiper-install-policy.ps1"
Write-Host "Baixando install-policy.ps1 de $siteDomain..."
Invoke-WebRequest -Uri "$siteDomain/install-policy.ps1" -OutFile $tmp -UseBasicParsing

& $tmp -EnrollmentToken $enrollmentToken -SiteDomain $siteDomain -Letra $letra
