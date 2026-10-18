@echo off
echo =======================================
echo Запуск Бэкенда (FastAPI) для Manga Translator
echo =======================================

:: Изолируем локальный трафик от системных прокси (Clash, V2Ray, Xray и т.д.)
set NO_PROXY=localhost,127.0.0.1
set no_proxy=localhost,127.0.0.1

:: Активируем виртуальное окружение PyCharm
call venv\Scripts\activate.bat

:: Запускаем сервер строго на 127.0.0.1:8000
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause