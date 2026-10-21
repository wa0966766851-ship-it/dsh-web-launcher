param([switch]$NoOpen,[switch]$SkipStart,[switch]$SkipShortcuts)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$dshRoot=if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $env:USERPROFILE '.dsh'}
$candidates=@((Join-Path ([Environment]::GetFolderPath('Desktop')) 'DSH'),(Join-Path $env:LOCALAPPDATA 'DSHLauncher\app'))
$uiPath=Join-Path $dshRoot 'launcher\ui.json'
$ui=if(Test-Path -LiteralPath $uiPath){Get-Content -LiteralPath $uiPath -Raw | ConvertFrom-Json}else{$null}
if($ui.appDir -and $candidates -contains $ui.appDir){$candidates=@($ui.appDir)+$candidates}
$destination=$candidates | Where-Object {Test-Path -LiteralPath (Join-Path $_ 'control.mjs')} | Select-Object -First 1
if(-not $destination){throw 'No existing launcher was found. Run bootstrap.ps1 for a new installation.'}
$stage=Join-Path $env:TEMP ('dsh-patch-'+[guid]::NewGuid().ToString('N'))
$backup=Join-Path $dshRoot ('backups\launcher-patch-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$copied=$false
try {
 New-Item -ItemType Directory -Path $stage,$backup -Force | Out-Null
 Write-Host '[1/3] Downloading launcher repair...'
 $zip=Join-Path $stage 'source.zip'
 Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/wa0966766851-ship-it/dsh-web-launcher/archive/refs/heads/main.zip' -OutFile $zip -TimeoutSec 120
 Expand-Archive -LiteralPath $zip -DestinationPath $stage
 $source=Join-Path $stage 'dsh-web-launcher-main'
 $nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
 $nodeCandidates=@((Join-Path $env:LOCALAPPDATA 'DSHLauncher\node\node.exe'))
 if($nodeCommand){$nodeCandidates+=$nodeCommand.Source}
 $nodeExe=$nodeCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
 if(-not $nodeExe){throw 'Node.js is missing. Run the current bootstrap installer.'}
 $installedPackage=Join-Path $destination 'package.json'
 if(Test-Path -LiteralPath $installedPackage){
  $installedVersion=(Get-Content -LiteralPath $installedPackage -Raw | ConvertFrom-Json).version
  $sourceVersion=(Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json).version
  $order=& $nodeExe (Join-Path $source 'patched-plugin\patch-assets\update-monitor.mjs') --compare $installedVersion $sourceVersion
  if($LASTEXITCODE -ne 0){throw 'Cannot compare launcher versions. Existing program files were preserved.'}
  if([int]$order -gt 0){throw 'The installed launcher is newer than this download. Downgrade refused; existing files were preserved.'}
 }
 $files=@('server.mjs','control.mjs','manager.mjs','dsh-launcher.html','launch.ps1','Launch.vbs','install.ps1','shortcuts.ps1','repair.mjs','repair.ps1','package.json','README.md','VERIFICATION.md','Repair.cmd')
 foreach($name in $files){if(-not (Test-Path -LiteralPath (Join-Path $source $name))){throw ('Incomplete download: '+$name)}}
 if(-not (Test-Path -LiteralPath (Join-Path $source 'patched-plugin\patch-assets\patch-health.mjs'))){throw 'Patch assets are missing.'}
 foreach($name in $files){$old=Join-Path $destination $name;if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $backup}}
 $oldAssets=Join-Path $destination 'patched-plugin\patch-assets'
 if(Test-Path -LiteralPath $oldAssets){Copy-Item -LiteralPath $oldAssets -Destination (Join-Path $backup 'patch-assets') -Recurse}
 Write-Host '[2/3] Updating the existing launcher; profile data stays in place...'
 # Close only this launcher's verified server, never a process selected by port.
 if($ui.pid -and $ui.appDir -eq $destination){
  $serverPath=Join-Path $destination 'server.mjs'
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$ui.pid) -ErrorAction SilentlyContinue
  if($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Replace('/','\').IndexOf($serverPath,[StringComparison]::OrdinalIgnoreCase) -ge 0){Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue}
 }
 $copied=$true
 foreach($name in $files){Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force}
 New-Item -ItemType Directory -Path (Join-Path $destination 'patched-plugin') -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $source 'patched-plugin\patch-assets') -Destination (Join-Path $destination 'patched-plugin') -Recurse -Force
 Write-Host '[3/3] Repairing the installed plugin...'
 $repairArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $destination 'repair.ps1'))
 if($NoOpen){$repairArgs+='-NoOpen'}
 if($SkipStart){$repairArgs+='-SkipStart'}
 if($SkipShortcuts){$repairArgs+='-SkipShortcuts'}
 & powershell.exe @repairArgs
 if($LASTEXITCODE -ne 0){throw ('Repair failed; original files are backed up at '+$backup)}
 Write-Host ('Repair completed. Backup: '+$backup)
} catch {
 if($copied){
  foreach($name in $files){$old=Join-Path $backup $name;if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $destination -Force}}
  $savedAssets=Join-Path $backup 'patch-assets'
  if(Test-Path -LiteralPath $savedAssets){Copy-Item -LiteralPath $savedAssets -Destination (Join-Path $destination 'patched-plugin') -Recurse -Force}
  Write-Host ('Launcher program files restored. Plugin recovery backups retained at '+$backup)
 }
 throw
} finally {
 $resolved=[IO.Path]::GetFullPath($stage)
 $boundary=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\'
 if($resolved.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -match '^dsh-patch-[0-9a-f]{32}$' -and (Test-Path -LiteralPath $resolved)){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
