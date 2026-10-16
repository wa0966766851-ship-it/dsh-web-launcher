Option Explicit
Dim shell, fso, folder, action, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
action = "ui"
If WScript.Arguments.Count > 0 Then action = LCase(WScript.Arguments(0))
If action <> "ui" And action <> "start" And action <> "stop" And action <> "restart" And action <> "status" Then WScript.Quit 2
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & folder & "\launch.ps1"" -Action " & action
result = shell.Run(command, 0, True)
If result <> 0 Then MsgBox "DSH could not complete the action. Use DSH-Launcher.bat to view the error.", 48, "DSH Launcher"
WScript.Quit result
