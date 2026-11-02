@echo off
rem ============================================================
rem  PAINEL DE ACOMPANHAMENTO DE OBRAS - abre em tela cheia
rem  Edite apenas as linhas "set" logo abaixo, se precisar.
rem ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem Posicao horizontal do monitor da TV, em pixels.
rem  0     = abre no monitor principal
rem  1920  = TV a direita do monitor principal (Full HD)
rem  -1920 = TV a esquerda do monitor principal
set "MONITOR_X=1920"

rem Pasta de perfil exclusiva do painel (nao mexe nos seus favoritos/abas).
set "PERFIL=%LOCALAPPDATA%\PainelObras\perfil"

rem Endereco do painel (espacos viram %%20)
set "URL=file:///%~dp0painel.html"
set "URL=!URL:\=/!"
set "URL=!URL: =%%20!"

rem Procura o Edge e, se nao achar, o Chrome
set "NAVEGADOR="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "NAVEGADOR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined NAVEGADOR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "NAVEGADOR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined NAVEGADOR if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "NAVEGADOR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined NAVEGADOR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "NAVEGADOR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined NAVEGADOR if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "NAVEGADOR=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined NAVEGADOR (
  echo Nao encontrei o Microsoft Edge nem o Google Chrome neste computador.
  pause
  exit /b 1
)

rem --allow-file-access-from-files : permite que o painel leia a planilha (somente leitura)
rem --user-data-dir               : necessario para a opcao acima valer mesmo com o navegador ja aberto
start "" "!NAVEGADOR!" --user-data-dir="!PERFIL!" --allow-file-access-from-files --app="!URL!" --window-position=!MONITOR_X!,0 --start-fullscreen --no-first-run --no-default-browser-check --disable-session-crashed-bubble
endlocal
