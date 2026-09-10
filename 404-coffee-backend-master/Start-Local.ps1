$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$taskNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
& $taskNode src/server.local.js
exit $LASTEXITCODE
