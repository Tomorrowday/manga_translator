@echo off
chcp 65001 >nul
title Manga Translator Launcher
cd /d "%~dp0"

set "PIP_CACHE_DIR=%~dp0weights\cache\pip"
set "NPM_CONFIG_CACHE=%~dp0weights\cache\npm"
set "HF_HOME=%~dp0weights\cache\huggingface"
set "TORCH_HOME=%~dp0weights\cache\torch"

echo ===================================================
echo   Запуск Manga Translator - RTX 50-series cu128
echo ===================================================

if exist "venv\Scripts\uvicorn.exe" goto CHECK_FRONTEND

echo [1/3] Папка venv не найдена. Ищу установленный Python...
set "SYS_PYTHON="

py -3.11 --version >nul 2>&1
if not errorlevel 1 set "SYS_PYTHON=py -3.11"
if defined SYS_PYTHON goto FOUND_PYTHON

py -3 --version >nul 2>&1
if not errorlevel 1 set "SYS_PYTHON=py -3"
if defined SYS_PYTHON goto FOUND_PYTHON

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "SYS_PYTHON="%LocalAppData%\Programs\Python\Python311\python.exe""
if defined SYS_PYTHON goto FOUND_PYTHON

if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "SYS_PYTHON="%LocalAppData%\Programs\Python\Python312\python.exe""
if defined SYS_PYTHON goto FOUND_PYTHON

if exist "C:\Python311\python.exe" set "SYS_PYTHON="C:\Python311\python.exe""
if defined SYS_PYTHON goto FOUND_PYTHON

python --version >nul 2>&1
if not errorlevel 1 set "SYS_PYTHON=python"
if defined SYS_PYTHON goto FOUND_PYTHON

echo [ОШИБКА] Python не найден на компьютере!
echo Откройте в старой папке файл venv\pyvenv.cfg и посмотрите путь к Python.
pause
exit /b 1

:FOUND_PYTHON
echo Найден интерпретатор: %SYS_PYTHON%
echo Создаю локальное окружение venv...
%SYS_PYTHON% -m venv venv
if errorlevel 1 (
    echo [ОШИБКА] Не удалось создать venv!
    pause
    exit /b 1
)

echo [2/3] Скачиваю и устанавливаю PyTorch Nightly cu128 для RTX 5070 Ti...
call "venv\Scripts\python.exe" -m pip install --no-cache-dir --upgrade pip
call "venv\Scripts\pip.exe" install --no-cache-dir --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128
if errorlevel 1 (
    echo [ОШИБКА] Ошибка при установке PyTorch!
    pause
    exit /b 1
)

echo [3/3] Устанавливаю зависимости из requirements.txt...
call "venv\Scripts\pip.exe" install --no-cache-dir -r requirements.txt
if errorlevel 1 (
    echo [ОШИБКА] Проверьте, что файл requirements.txt лежит рядом со start.bat!
    pause
    exit /b 1
)

:CHECK_FRONTEND
if exist "manga_ui\node_modules" goto START_SERVERS

echo [Фронтенд] Папка node_modules не найдена. Скачиваю пакеты через npm install...
cd /d "%~dp0manga_ui"
call npm install --legacy-peer-deps --cache "%~dp0weights\cache\npm"
if errorlevel 1 (
    echo [ОШИБКА] Не удалось выполнить npm install. Проверьте, установлен ли Node.js!
    pause
    exit /b 1
)
cd /d "%~dp0"

:START_SERVERS
echo Запускаю Бэкенд FastAPI...
start "Manga Translator - Backend" cmd /k "chcp 65001 >nul && cd /d "%~dp0" && "venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Запускаю Фронтенд Next.js...
start "Manga Translator - Frontend" cmd /k "chcp 65001 >nul && cd /d "%~dp0manga_ui" && npm run dev"

timeout /t 4 >nul
start http://localhost:3000

echo ===================================================
echo Все серверы запущены!
echo ===================================================
pause