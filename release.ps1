<#
  LANÇAR NOVA VERSÃO - CHECKLIST TRUCK PRO
  Uso:  powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 1.5.0 [-Message "o que mudou"]

  Faz tudo sozinho:
   1. Atualiza o número da versão em update.js, version.json, sw.js e index.html
   2. Valida a sintaxe dos scripts
   3. Copia public/ para a raiz (GitHub Pages)
   4. Commit + push na branch main
   Depois do push, quem tem o app instalado vê "Atualização Disponível".
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Message = ""
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Versão inválida '$Version'. Use o formato 1.5.0" }

$current = (Get-Content "public\version.json" -Raw | ConvertFrom-Json).version
if ($current -eq $Version) { throw "A versão $Version já é a atual. Informe um número maior." }
Write-Host "Versão atual: $current  ->  Nova versão: $Version"

$files = @("public\js\update.js", "public\version.json", "public\sw.js", "public\index.html")
foreach ($f in $files) {
  $text = [IO.File]::ReadAllText((Resolve-Path $f))
  if (-not $text.Contains($current)) { throw "Não encontrei a versão $current em $f" }
  [IO.File]::WriteAllText((Resolve-Path $f), $text.Replace($current, $Version), (New-Object Text.UTF8Encoding($false)))
  Write-Host "  atualizado: $f"
}

foreach ($js in @("public\js\db.js", "public\js\auth.js", "public\js\app.js", "public\js\update.js", "public\sw.js")) {
  node -c $js
  if ($LASTEXITCODE -ne 0) { throw "Erro de sintaxe em $js" }
}
Write-Host "  sintaxe OK"

Copy-Item -Path "public\*" -Destination "." -Recurse -Force
Write-Host "  public/ copiado para a raiz"

$msg = "v$Version"
if ($Message) { $msg += ": $Message" }
git add -A
git commit -m "$msg"
$prevEA = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
git push origin main
$ErrorActionPreference = $prevEA
Write-Host "Versão $Version publicada com sucesso! GitHub Pages leva ~1 minuto para atualizar."
