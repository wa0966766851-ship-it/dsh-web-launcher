param([ValidateSet('ui','start','stop','restart','status','open')][string]$Action='ui',[int]$Port=3080,[ValidateSet('app','browser')][string]$Mode='app',[switch]$NoOpen)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$runtimeRoot=Join-Path $env:LOCALAPPDATA 'DSHLauncher'
$nodeCandidates=@((Join-Path $runtimeRoot 'node\node.exe'))
$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
if($nodeCommand){$nodeCandidates += $nodeCommand.Source}
$nodeCandidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
$nodeExe=$nodeCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $nodeExe){throw 'Node.js is missing. Run the GitHub bootstrap command first.'}
$arguments=@((Join-Path $PSScriptRoot 'control.mjs'),$Action,'--port',$Port,'--mode',$Mode)
if($NoOpen){$arguments+='--no-open'}
& $nodeExe @arguments
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
