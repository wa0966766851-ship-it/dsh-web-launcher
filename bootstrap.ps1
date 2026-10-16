param([switch]$NoOpen,[switch]$SkipStart,[switch]$SkipShortcuts)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
if($env:OS -ne 'Windows_NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64'){throw 'This installer supports Windows x64 only.'}
$installRoot=Join-Path $env:LOCALAPPDATA 'DSHLauncher'
$stageRoot=Join-Path $env:TEMP ('dsh-launcher-'+[guid]::NewGuid().ToString('N'))
try {
New-Item -ItemType Directory -Path $stageRoot,$installRoot -Force | Out-Null
Write-Host '[1/3] Downloading launcher from GitHub...'
$archive=Join-Path $stageRoot 'launcher.zip'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/wa0966766851-ship-it/dsh-web-launcher/archive/refs/heads/main.zip' -OutFile $archive -TimeoutSec 120
Expand-Archive -LiteralPath $archive -DestinationPath $stageRoot -Force
$source=Join-Path $stageRoot 'dsh-web-launcher-main'
if(-not (Test-Path -LiteralPath (Join-Path $source 'install.ps1'))){throw 'The GitHub archive is incomplete.'}
Write-Host '[2/3] Checking Node.js...'
$node=Get-Command node.exe -ErrorAction SilentlyContinue
$supported=$false
if($node){$version=(& $node.Source -p 'process.versions.node').Trim().Split('.');$supported=([int]$version[0] -ge 24 -or ([int]$version[0] -eq 22 -and [int]$version[1] -ge 19))}
$nodeDestination=Join-Path $installRoot 'node'
if(-not $supported -and -not (Test-Path -LiteralPath (Join-Path $nodeDestination 'node.exe'))){
 $releases=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
 $release=$releases | Where-Object {$_.version -match '^v24\.'} | Select-Object -First 1
 if(-not $release){throw 'Could not locate an official Node.js 24 release.'}
 $name='node-'+$release.version+'-win-x64.zip'
 $nodeZip=Join-Path $stageRoot $name
 $base='https://nodejs.org/dist/'+$release.version+'/'
 Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile $nodeZip -TimeoutSec 300
 $checksums=(Invoke-WebRequest -UseBasicParsing -Uri ($base+'SHASUMS256.txt') -TimeoutSec 30).Content
 $line=$checksums -split "`n" | Where-Object {$_.Trim().EndsWith($name)} | Select-Object -First 1
 if(-not $line){throw 'Official Node.js checksum is missing.'}
 $expected=($line.Trim() -split '\s+')[0]
 if((Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash -ne $expected){throw 'Node.js checksum verification failed.'}
 Expand-Archive -LiteralPath $nodeZip -DestinationPath $stageRoot -Force
 $nodeSource=Join-Path $stageRoot ('node-'+$release.version+'-win-x64')
 New-Item -ItemType Directory -Path $nodeDestination -Force | Out-Null
 Copy-Item -Path (Join-Path $nodeSource '*') -Destination $nodeDestination -Recurse -Force
}
Write-Host '[3/3] Installing and creating the launcher...'
$destination=Join-Path $installRoot 'app'
if(Test-Path -LiteralPath $destination){$backup=Join-Path $installRoot ('backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'));New-Item -ItemType Directory -Path $backup -Force | Out-Null;Get-ChildItem -LiteralPath $destination -File | Copy-Item -Destination $backup}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
Get-ChildItem -LiteralPath $destination -Recurse -File | Unblock-File
$installArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $destination 'install.ps1'))
if($NoOpen){$installArguments+='-NoOpen'}
if($SkipStart){$installArguments+='-SkipStart'}
if($SkipShortcuts){$installArguments+='-SkipShortcuts'}
& powershell.exe @installArguments
if($LASTEXITCODE -ne 0){throw ('Installation did not complete. Run the same command to retry. Logs and backups: '+$installRoot)}
} finally {
 $resolvedStage=[IO.Path]::GetFullPath($stageRoot)
 $tempBoundary=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\'
 if($resolvedStage.StartsWith($tempBoundary,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage) -match '^dsh-launcher-[0-9a-f]{32}$' -and (Test-Path -LiteralPath $resolvedStage)){Remove-Item -LiteralPath $resolvedStage -Recurse -Force}
}
