@echo off
set PORTA=3333
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORTA% " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>&1
)
taskkill /IM cloudflared.exe /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Ponte MCP*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunel Cloudflare*" /T /F >nul 2>&1
echo Parado.
timeout /t 3 >nul
