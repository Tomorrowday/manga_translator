@echo off
echo =======================================
echo Запуск Бэкенда (FastAPI) для Manga Translator
echo =======================================

:: Активируем виртуальное окружение PyCharm
call venv\Scripts\activate.bat

:: Запускаем сервер
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause