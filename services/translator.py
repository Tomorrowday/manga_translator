from typing import List, Dict
from ml.models import ml
from schemas import BatchTranslateItem


def translate_single_text(text: str) -> str:
    """Перевод одиночной реплики без контекста."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    prompt = (
        "Ты профессиональный переводчик манги с японского на русский. "
        "Переведи эту реплику. Без пояснений, только перевод.\n"
        f"Оригинал: {text}"
    )
    response = ml.gemini_model.generate_content(prompt)
    return response.text.strip()


def translate_batch_items(items: List[BatchTranslateItem]) -> Dict[str, str]:
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    if not items:
        return {}

    # Формируем реплики с указанием говорящего (если он задан)
    lines = []
    for i, item in enumerate(items):
        speaker_prefix = f"[{item.speaker}]: " if item.speaker and item.speaker.strip() else ""
        lines.append(f"[{i + 1}] {speaker_prefix}{item.text}")

    dialogue_text = "\n".join(lines)

    prompt = (
        "Ты профессиональный литературный переводчик манги с японского на русский язык.\n"
        "Переведи следующие реплики. Они идут в строгом порядке чтения (справа налево, сверху вниз).\n"
        "Правила перевода:\n"
        "1. Сохраняй естественный диалоговый тон манги.\n"
        "2. Если в начале реплики указано имя персонажа в квадратных скобках (например, [Макима]: или [Дэндзи]:) — "
        "строго учитывай пол и характер персонажа при выборе окончаний глаголов, местоимений (он/она) и стиля речи.\n"
        "3. Сам префикс с именем персонажа в перевод НЕ включай, возвращай только русский перевод самой фразы.\n\n"
        "Формат ответа СТРОГО такой:\n"
        "[1] Текст перевода первой реплики\n"
        "[2] Текст перевода второй реплики\n"
        "Никаких комментариев и примечаний, только [номер] и сам русский текст.\n\n"
        f"Оригинал:\n{dialogue_text}"
    )

    response = ml.gemini_model.generate_content(prompt)
    raw_text = response.text.strip()

    result_map = {}
    for line in raw_text.split("\n"):
        line = line.strip()
        if line.startswith("[") and "]" in line:
            idx_part, translated = line.split("]", 1)
            idx_str = idx_part.replace("[", "").strip()
            if idx_str.isdigit():
                idx = int(idx_str) - 1
                if 0 <= idx < len(items):
                    item_id = items[idx].id
                    result_map[item_id] = translated.strip()

    return result_map