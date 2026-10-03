@echo off
title Enviar para o GitHub - Checklist Truck Pro
chcp 65001 > nul
cd /d "%~dp0"
color 0A

echo ================================================================
echo       ENVIAR ATUALIZACOES PARA O GITHUB AUTOMATICAMENTE
echo              CHECKLIST TRUCK PRO - BITREM & FROTAS
echo ================================================================
echo.

:: 1. Se o repositorio Git ainda nao foi inicializado nesta pasta
if not exist ".git" (
    echo [*] Primeira configuracao detectada!
    echo [*] Conectando seu projeto ao repositorio carlaoapp/checklist-truck-pro...
    git init
    git branch -M main
    git remote add origin https://github.com/carlaoapp/checklist-truck-pro.git
    echo [+] Conexao com o GitHub configurada com sucesso!
    echo.
)

:: 2. Identifica e adiciona todos os arquivos
echo [*] Mapeando arquivos...
git add -A

:: 3. Verifica se ha alteracoes para enviar
git status --porcelain > "%temp%\truck_git_status.txt"
set /p TEM_ALTERACOES=<"%temp%\truck_git_status.txt"

if "%TEM_ALTERACOES%"=="" (
    echo.
    echo ================================================================
    echo   TUDO ATUALIZADO! Nao ha nenhum arquivo modificado para subir.
    echo   Seu GitHub ja esta 100%% em dia com o seu computador!
    echo ================================================================
    echo.
    pause
    exit /b 0
)

:: 4. Cria o commit com data e hora
set "DATA_HORA=%date% as %time:~0,5%"
echo [*] Gravando alteracoes: %DATA_HORA%...
git commit -m "Atualizacao: %DATA_HORA%"

:: 5. Envia para o GitHub na branch main
echo [*] Enviando arquivos para o GitHub na nuvem...
echo.
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ================================================================
    echo   [SUCESSO TOTAL!]
    echo   Todos os arquivos foram enviados para o GitHub!
    echo   Repositorio: https://github.com/carlaoapp/checklist-truck-pro
    echo   O Render ira detectar o envio e atualizar o seu site no ar.
    echo ================================================================
) else (
    echo [!] Ocorreu um erro ao enviar para o GitHub. Verifique sua conexao.
)
echo.
pause
