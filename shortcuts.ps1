$ErrorActionPreference='Stop'
$desktop=[Environment]::GetFolderPath('Desktop')
$shell=New-Object -ComObject WScript.Shell
foreach($item in @(@{Name='DSH 啟動台.lnk';Action='ui'},@{Name='DSH 啟動台（停止）.lnk';Action='stop'})){
 $shortcut=$shell.CreateShortcut((Join-Path $desktop $item.Name))
 $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\wscript.exe'
 $shortcut.Arguments='"'+(Join-Path $PSScriptRoot 'Launch.vbs')+'" '+$item.Action
 $shortcut.WorkingDirectory=$PSScriptRoot
 $shortcut.IconLocation=(Join-Path $env:SystemRoot 'System32\shell32.dll')+',14'
 $shortcut.Description='DeepSeek Harness Web Launcher'
 $shortcut.Save()
}
$command="& '"+(Join-Path $PSScriptRoot 'launch.ps1').Replace("'","''")+"' -Action ui"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$batch='@echo off'+"`r`n"+'powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand '+$encoded+"`r`n"+'if errorlevel 1 pause'+"`r`n"
[IO.File]::WriteAllText((Join-Path $desktop 'DSH-Launcher.bat'),$batch,[Text.Encoding]::ASCII)
