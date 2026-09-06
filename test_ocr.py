import time
from manga_ocr import MangaOcr


def main():
    print("Инициализация модели MangaOCR...")
    print("При первом запуске веса модели (около 400 МБ) скачаются автоматически.")

    start_time = time.time()
    # Инициализируем модель. Она автоматически найдет твою видеокарту (CUDA), если мы всё сделали правильно.
    mocr = MangaOcr()
    print(f"Модель загружена за {time.time() - start_time:.2f} сек.")

    # Укажи имя файла с тестовой картинкой
    image_path = 'test.png'

    try:
        print(f"Распознаю текст на картинке: {image_path}")
        start_time = time.time()

        # Сам процесс распознавания
        text = mocr(image_path)

        print("-" * 30)
        print(f"Результат: {text}")
        print("-" * 30)
        print(f"Распознавание заняло: {time.time() - start_time:.4f} сек.")

    except FileNotFoundError:
        print(f"Ошибка: Файл '{image_path}' не найден. Положи картинку в папку с проектом.")
    except Exception as e:
        print(f"Произошла ошибка: {e}")


if __name__ == "__main__":
    main()