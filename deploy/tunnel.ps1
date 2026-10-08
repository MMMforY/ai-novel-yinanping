param(
  [Parameter(Mandatory=$true)][string]$Server,
  [string]$User = "ubuntu",
  [Parameter(Mandatory=$true)][string]$IdentityFile,
  [Parameter(Mandatory=$true)][string]$KnownHostsFile,
  [int]$LocalPort = 18787,
  [int]$RemotePort = 18787
)
$ErrorActionPreference = "Stop"
$resolvedIdentity = (Resolve-Path -LiteralPath $IdentityFile).Path
$resolvedKnownHosts = (Resolve-Path -LiteralPath $KnownHostsFile).Path
Write-Host "迭页：http://localhost:$LocalPort/ · 联调：http://localhost:$LocalPort/integration.html"
& ssh -N -L "127.0.0.1:$($LocalPort):127.0.0.1:$($RemotePort)" -i $resolvedIdentity -o "UserKnownHostsFile=$resolvedKnownHosts" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 ($User + "@" + $Server)
exit $LASTEXITCODE
