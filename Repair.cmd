@echo off
title DSH Launcher Repair
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Invoke-RestMethod 'https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/patch.ps1' | Invoke-Expression } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
  echo Repair failed. Please keep the error above. Your profile data was not removed.
  pause
  exit /b 1
)
