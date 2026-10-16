@echo off
title DSH Web Launcher Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Invoke-RestMethod 'https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/bootstrap.ps1' | Invoke-Expression } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
  echo Installation failed. Please keep the error above and retry.
  pause
  exit /b 1
)
