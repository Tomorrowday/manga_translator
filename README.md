В нужную папку прописать git clone https://github.com/Tomorrowday/manga_translator

Скачать в соответствующую папку weights 2 модели:

Для детекта бабблов в папку detect-bubble моя собственная модель на основе yolo26:
https://huggingface.co/TomorrowDay/Detect-bubble-on-manga-v3.3

В папку clean-lama скачать и поместить файл anime-manga-big-lama.pt
https://huggingface.co/TomorrowDay/anime-manga-big-lama


Запустить start.bat
Всё нужное установится в первый запуск само

В браузере открыть:
http://localhost:3000/

Проверена работа на 5070Ti для более старых вероятно понадобится более старая версия cuda
