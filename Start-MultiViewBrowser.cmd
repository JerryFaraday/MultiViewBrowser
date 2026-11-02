@echo off
setlocal
set "MVB_APP=%~dp0release\win-unpacked\MultiViewBrowser.exe"
if not exist "%MVB_APP%" (
  echo MultiViewBrowser.exe was not found.
  echo Keep this launcher in the project root and keep the entire release\win-unpacked folder.
  pause
  exit /b 1
)
start "" /D "%~dp0release\win-unpacked" "%MVB_APP%"
exit /b 0
