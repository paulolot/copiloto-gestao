@echo off
setlocal
cd /d "%~dp0"
title Copiloto Gestao

if not exist ".env" (
  echo ERRO: arquivo .env nao encontrado. Copie .env.example para .env e preencha.
  pause
  exit /b 1
)

set PORTA=3333

echo Parando o que ja estiver rodando...
rem Encerra o processo que ocupa a porta da ponte (so ele, nao todos os node)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORTA% " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>&1
)
rem Encerra o tunel
taskkill /IM cloudflared.exe /T /F >nul 2>&1
rem Fecha as janelas antigas, se ainda estiverem abertas
taskkill /FI "WINDOWTITLE eq Ponte MCP*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Tunel Cloudflare*" /T /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo Compilando...
call npm run build
if errorlevel 1 (
  echo ERRO na compilacao.
  pause
  exit /b 1
)

echo Iniciando a ponte MCP...
start "Ponte MCP" cmd /k "cd /d %~dp0 && npm start"

echo Aguardando a ponte subir...
timeout /t 4 /nobreak >nul

echo Iniciando o tunel Cloudflare...
start "Tunel Cloudflare" cmd /k "cloudflared tunnel run copiloto-gestao"

echo.
echo Tudo iniciado. Janelas: "Ponte MCP" e "Tunel Cloudflare".
timeout /t 5 >nul
