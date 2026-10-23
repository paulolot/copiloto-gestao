@echo off
setlocal
cd /d "%~dp0"

set ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Copiloto Gestao.lnk

if /i "%~1"=="remover" (
  if exist "%ATALHO%" del "%ATALHO%"
  echo Inicializacao com o Windows removida.
  timeout /t 3 >nul
  exit /b 0
)

rem Cria o atalho na pasta Inicializar (shell:startup), com a janela minimizada
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:ATALHO); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (
  echo ERRO ao criar o atalho.
  pause
  exit /b 1
)

echo Pronto. O iniciar.bat (ponte MCP + tunel) vai rodar a cada login no Windows.
echo O Grok Bot fica na nuvem e nao precisa ser iniciado: ele chama a ponte pelo tunel.
echo Para desfazer: instalar-inicializacao.bat remover
timeout /t 6 >nul
