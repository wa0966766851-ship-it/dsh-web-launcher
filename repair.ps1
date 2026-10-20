param([switch]$NoOpen,[switch]$SkipStart,[switch]$SkipShortcuts)
$ErrorActionPreference='Stop'
$candidates=@((Join-Path $env:LOCALAPPDATA 'DSHLauncher\node\node.exe'))
$command=Get-Command node.exe -ErrorAction SilentlyContinue
if($command){$candidates+=$command.Source}
$candidates+=(Join-Path $env:ProgramFiles 'nodejs\node.exe')
$nodeExe=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $nodeExe){throw 'Node.js is missing. Run the full bootstrap installer.'}
$repairArguments=@((Join-Path $PSScriptRoot 'repair.mjs'))
if($NoOpen){$repairArguments+='--no-open'}
if($SkipStart){$repairArguments+='--skip-start'}
& $nodeExe @repairArguments
if($LASTEXITCODE -ne 0){throw 'Repair failed. The original files were backed up; see the error above.'}
if(-not $SkipShortcuts){& (Join-Path $PSScriptRoot 'shortcuts.ps1')}
if(-not $NoOpen){& $nodeExe (Join-Path $PSScriptRoot 'control.mjs') ui; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
