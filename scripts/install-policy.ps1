<#
.SYNOPSIS
  Inscreve esta maquina no Chrome Browser Cloud Management (CBCM), forca a
  instalacao da extensao Hiper Cache via politica do Chrome
  (ExtensionInstallForcelist com update_url proprio) e define a letra de
  orcamento desta maquina via managed storage (compartilhada por todos os
  perfis do Chrome no PC). Precisa ser executado como Administrador.

.PARAMETER EnrollmentToken
  Token de inscricao do Chrome Browser Cloud Management (gerado uma unica vez
  no admin console — o MESMO token e usado em todas as maquinas da loja).
  Sem isso, o Chrome bloqueia ExtensionInstallForcelist com update_url proprio
  em maquina nao gerenciada — ver RELEASE.md.

.PARAMETER Letra
  Letra usada nos codigos de orcamento gerados nesta maquina (ex: A, B, C...).
  Todos os perfis do Chrome desta maquina compartilham essa letra automaticamente.

.PARAMETER SiteDomain
  Dominio publico onde o update.xml esta hospedado. Default: sistema.santin.tec.br

.EXAMPLE
  Rodar em PowerShell como Admin:
  ./install-policy.ps1 -EnrollmentToken "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -Letra "B"

.NOTES
  Depois de rodar, feche TODOS os processos do Chrome (nao so as janelas) e
  reabra — a inscricao no CBCM e o force-install acontecem no proximo start.
  Confirme em chrome://management que a maquina aparece como gerenciada, e em
  chrome://policy que ExtensionInstallForcelist nao mostra mais [BLOCKED].
#>
param(
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z]{1,3}$')][string]$Letra,
    [Parameter(Mandatory = $false)][string]$SiteDomain = "https://sistema.santin.tec.br"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Rode este script como Administrador (botao direito > Executar como administrador)."
}

$extensionId = "beegoeddmoobncnpjliopfddjedehhib"
$letraUpper  = $Letra.ToUpper()
$policyEntry = "$extensionId;$SiteDomain/update.xml"

$chromeRegPath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
if (-not (Test-Path $chromeRegPath)) {
    New-Item -Path $chromeRegPath -Force | Out-Null
}

# ── CBCM: inscreve a maquina (nao pede login de ninguem, e por maquina) ──────
New-ItemProperty -Path $chromeRegPath -Name "CloudManagementEnrollmentToken" -Value $EnrollmentToken -PropertyType String -Force | Out-Null

# ── ExtensionInstallForcelist: forca a instalacao sem modo desenvolvedor ─────
$regPath = "$chromeRegPath\ExtensionInstallForcelist"
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}

# Remove entradas antigas dessa mesma extensao pra nao deixar duplicatas/lixo
$existing = Get-Item -Path $regPath
foreach ($name in $existing.Property) {
    $val = (Get-ItemProperty -Path $regPath -Name $name).$name
    if ($val -like "$extensionId*") {
        Remove-ItemProperty -Path $regPath -Name $name -Force
    }
}

$existing = Get-Item -Path $regPath
$nextIndex = 1
foreach ($name in $existing.Property) {
    if ($name -as [int]) {
        $n = [int]$name
        if ($n -ge $nextIndex) { $nextIndex = $n + 1 }
    }
}
New-ItemProperty -Path $regPath -Name "$nextIndex" -Value $policyEntry -PropertyType String -Force | Out-Null

# ── Managed storage: letra desta maquina (chrome.storage.managed em background.js) ──
$managedRegPath = "$chromeRegPath\3rdparty\extensions\$extensionId\policy"
if (-not (Test-Path $managedRegPath)) {
    New-Item -Path $managedRegPath -Force | Out-Null
}
# Valor precisa ser JSON valido (aspas incluidas), conforme managed storage do Chrome
New-ItemProperty -Path $managedRegPath -Name "letra" -Value "`"$letraUpper`"" -PropertyType String -Force | Out-Null

Write-Host "CBCM enrollment token aplicado."
Write-Host "ExtensionInstallForcelist aplicado: $policyEntry"
Write-Host "Letra desta maquina definida como: $letraUpper (compartilhada por todos os perfis)"
Write-Host ""
Write-Host "IMPORTANTE: encerre TODOS os processos chrome.exe (Gerenciador de Tarefas, nao so fechar janelas) e reabra."
Write-Host "Verifique em chrome://management (deve mostrar 'gerenciado pela sua organizacao')"
Write-Host "e em chrome://policy (ExtensionInstallForcelist sem [BLOCKED])."
