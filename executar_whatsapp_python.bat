@echo off
title Robô Python WhatsApp - Checklist Truck Pro
chcp 65001 > nul
cd /d "%~dp0"
color 0A

echo ================================================================
echo       ROBÔ PYTHON WHATSAPP - CHECKLIST TRUCK PRO
echo ================================================================
echo.
echo Verificando ambiente Python...

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Python nao foi encontrado no seu computador!
    echo Por favor, instale o Python em https://www.python.org/
    pause
    exit /b 1
)

echo [*] Iniciando ferramenta de envio de fotos e relatorio...
echo.
python python_tools\whatsapp_sender.py %*

echo.
pause
