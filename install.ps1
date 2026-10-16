param([switch]$NoOpen,[switch]$SkipStart,[switch]$SkipShortcuts,[switch]$IncludeOps,[int]$Port=3080,[string]$InstallPrefix)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8='1'
if([Environment]::OSVersion.Platform -ne 'Win32NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64'){throw 'Windows x64 is required.'}
function Say([string]$Text){Write-Host $Text}
function Run-Checked([string]$File,[string[]]$Arguments){$previousPreference=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& $File @Arguments 2>&1 | ForEach-Object {Write-Host $_};$code=$LASTEXITCODE}finally{$ErrorActionPreference=$previousPreference}if($code -ne 0){throw "Command failed ($code): $File"}}
$nodeCandidates=@((Join-Path $env:LOCALAPPDATA 'DSHLauncher\node\node.exe'))
$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
if($nodeCommand){$nodeCandidates+=$nodeCommand.Source}
$nodeCandidates+=(Join-Path $env:ProgramFiles 'nodejs\node.exe')
$nodeExe=$nodeCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $nodeExe){throw 'Node.js is missing. Run bootstrap.ps1 first.'}
$nodeVersion=(& $nodeExe -p 'process.versions.node').Trim()
$parts=$nodeVersion.Split('.')
if(-not ([int]$parts[0] -ge 24 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 19))){throw "Unsupported Node.js version: $nodeVersion"}
$nodeDir=Split-Path -Parent $nodeExe
$npmCli=Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'
if(-not (Test-Path -LiteralPath $npmCli)){throw 'npm is missing from the Node.js installation.'}
if(-not $InstallPrefix){$InstallPrefix=Join-Path $env:APPDATA 'npm'}
$env:Path=$nodeDir+';'+$InstallPrefix+';'+$env:Path
$env:npm_config_fund='false'
$env:npm_config_audit='false'
$dshData=if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $env:USERPROFILE '.dsh'}
$profileDir=Join-Path $dshData 'profiles\web'
$profileFile=Join-Path $profileDir 'package.json'
$backupDir=Join-Path $dshData ('backups\launcher-install-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach($name in @('package.json','cordis.patch.yml','pnpm-lock.yaml','pnpm-workspace.yaml')){if(Test-Path -LiteralPath (Join-Path $profileDir $name)){Copy-Item -LiteralPath (Join-Path $profileDir $name) -Destination $backupDir}}
$cli=Join-Path $InstallPrefix 'node_modules\@deepseek-ai\dsh\lib\bin.js'
$existingConfigFile=Join-Path $PSScriptRoot 'launcher.config.json'
if(Test-Path -LiteralPath $existingConfigFile){$savedConfig=Get-Content -LiteralPath $existingConfigFile -Raw | ConvertFrom-Json;if($savedConfig.cliPath -and (Test-Path -LiteralPath $savedConfig.cliPath) -and -not $PSBoundParameters.ContainsKey('InstallPrefix')){$cli=$savedConfig.cliPath}}
Say "[1/5] Node.js $nodeVersion; checking DSH..."
if(-not (Test-Path -LiteralPath $cli)){Run-Checked $nodeExe @($npmCli,'install','--global','--prefix',$InstallPrefix,'@deepseek-ai/dsh@0.2.0-rc.2')}else{Say 'Existing DSH found; keeping its version and settings.'}
if(-not (Test-Path -LiteralPath $cli)){throw 'DSH CLI is missing after installation.'}
Run-Checked $nodeExe @($cli,'--version')
$config=if(Test-Path -LiteralPath $existingConfigFile){Get-Content -LiteralPath $existingConfigFile -Raw | ConvertFrom-Json}else{[pscustomobject]@{port=$Port;mode='app';theme='light'}}
$config | Add-Member -MemberType NoteProperty -Name cliPath -Value $cli -Force
if(-not $PSBoundParameters.ContainsKey('Port') -and $config.port){$Port=[int]$config.port}
[IO.File]::WriteAllText($existingConfigFile,($config | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$plugins=@(
 @{Name='dsh-our-free-model';Spec='dsh-our-free-model@2.1.0'},
 @{Name='dsh-orb';Spec='dsh-orb@0.1.7'},
 @{Name='gal-view';Spec='https://codeload.github.com/Ayase34/gal-view/tar.gz/d002fe0e7051c618a2665af3c653f9838cd6aa8a'}
)
Say '[2/5] Checking Our Free Model, Orb and GAL view...'
$changed=$false
foreach($plugin in $plugins){
 $profile=if(Test-Path -LiteralPath $profileFile){Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json}else{$null}
 $bundles=@($profile.dsh.profile.bundles)
 if(($bundles -contains $plugin.Name) -and (Test-Path -LiteralPath (Join-Path $profileDir ('node_modules\'+$plugin.Name+'\package.json')))){Say ('Already enabled: '+$plugin.Name);continue}
 Say ('Installing '+$plugin.Name+'...')
 Run-Checked $nodeExe @($cli,'plugin','--profile','web','add',$plugin.Spec)
 $profile=Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
 if(@($profile.dsh.profile.bundles) -notcontains $plugin.Name){throw ('Bundle was not enabled: '+$plugin.Name)}
 $changed=$true
}
if($IncludeOps){Say 'Installing optional dsh-ops...';Run-Checked $nodeExe @($npmCli,'exec','--yes','--package=dsh-ops@0.3.0','--','dsh-ops','install','--profile','web')}
Say '[3/5] Checking bundle uniqueness...'
$profile=Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
$duplicates=@($profile.dsh.profile.bundles | Group-Object | Where-Object {$_.Count -gt 1})
if($duplicates.Count){throw ('Duplicate bundles: '+(($duplicates | ForEach-Object {$_.Name}) -join ', '))}
Say '[4/5] Creating desktop shortcuts...'
if(-not $SkipShortcuts){& (Join-Path $PSScriptRoot 'shortcuts.ps1')}
if(-not $SkipStart){Say '[5/5] Starting the web profile...';$action=if($changed){'restart'}else{'start'};Run-Checked $nodeExe @((Join-Path $PSScriptRoot 'control.mjs'),$action,'--port',[string]$Port,'--no-open')}
Say 'Ready. Accounts and API keys must be configured by the owner in the DSH settings.'
if(-not $NoOpen){Run-Checked $nodeExe @((Join-Path $PSScriptRoot 'control.mjs'),'ui')}
