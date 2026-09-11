import re
from typing import List, Dict, Any, Optional
from ml.models import ml
from schemas import BatchTranslateItem
from logger import logger


def format_glossary_line(g: Dict[str, Any]) -> str:
    """Форматирует строку глоссария с учетом того, есть ли японское имя."""
    jap = (g.get("jap_word") or "").strip()
    rus = (g.get("rus_word") or "").strip()
    ctx = (g.get("context") or "").strip()

    if jap:
        line = f"- {jap} -> {rus}"
    else:
        line = f"- Персонаж / Роль: {rus}"

    if ctx:
        line += f" ({ctx})"
    return line


def translate_single_text(text: str, title_description: str = "") -> str:
    """Перевод одиночной реплики без контекста."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    desc_prompt = f"\nСтиль и синопсис манги:\n{title_description.strip()}\n" if title_description.strip() else ""

    prompt = (
        "Ты профессиональный переводчик манги с японского на русский. "
        "Переведи эту реплику естественно. Без пояснений, только перевод.\n"
        f"{desc_prompt}"
        f"Оригинал: {text}"
    )
    logger.info(f"--- [Gemini Single] Запрос:\n{text}")
    response = ml.gemini_model.generate_content(prompt)
    result = response.text.strip()
    logger.info(f"--- [Gemini Single] Ответ:\n{result}")
    return result


def translate_batch_items(
    items: List[BatchTranslateItem],
    title_description: str = "",
    glossary_rows: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, str]:
    """Пакетный перевод реплик одной страницы с учетом синопсиса и глоссария."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    if not items:
        return {}

    lines = []
    for i, item in enumerate(items):
        speaker_prefix = f"[{item.speaker}]: " if item.speaker and item.speaker.strip() else ""
        lines.append(f"[{i + 1}] {speaker_prefix}{item.text}")

    dialogue_text = "\n".join(lines)

    synopsis_block = ""
    if title_description and title_description.strip():
        synopsis_block = (
            "\nСИНОПСИС И СТИЛЬ ПОВЕСТВОВАНИЯ (СТРОГО СОБЛЮДАЙ ЭТОТ ТОН И ХАРАКТЕРЫ):\n"
            f"{title_description.strip()}\n"
        )

    glossary_block = ""
    if glossary_rows:
        glossary_lines = [format_glossary_line(g) for g in glossary_rows]
        glossary_block = (
            "\nОБЯЗАТЕЛЬНЫЙ ГЛОССАРИЙ И СПИСОК ПЕРСОНАЖЕЙ (СТРОГО используй эти имена и стили речи):\n"
            + "\n".join(glossary_lines)
            + "\n"
        )

    prompt = (
        "Ты профессиональный литературный переводчик манги с японского на русский язык.\n"
        "Переведи следующие реплики страницы. Они идут в строгом порядке чтения (справа налево, сверху вниз).\n"
        f"{synopsis_block}"
        f"{glossary_block}"
        "Правила перевода:\n"
        "1. Сохраняй естественный диалоговый тон манги.\n"
        "2. Если в начале реплики указано имя персонажа в квадратных скобках (например, [Макима]:, [Дэндзи]: или [Толпа]:) — "
        "строго учитывай пол, статус и характер персонажа при выборе окончаний глаголов, местоимений (он/она) и стиля речи.\n"
        "3. Сам префикс с именем персонажа в перевод НЕ включай, возвращай только русский перевод самой фразы.\n\n"
        "Формат ответа СТРОГО такой:\n"
        "[1] Текст перевода первой реплики\n"
        "[2] Текст перевода второй реплики\n"
        "Никаких комментариев и примечаний, только [номер] и сам русский текст.\n\n"
        f"Оригинал:\n{dialogue_text}"
    )

    logger.info(f"=== [Gemini Page Batch] Отправка {len(items)} реплик на перевод ===")
    response = ml.gemini_model.generate_content(prompt)
    raw_text = response.text.strip()
    logger.info(f"=== [Gemini Page Batch] Ответ нейросети:\n{raw_text}")

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


def translate_chapter_dialogues(
    chapter_dialogue: List[Dict[str, Any]],
    glossary_rows: List[Dict[str, Any]],
    title_description: str = ""
) -> Dict[str, str]:
    """
    Перевод реплик всей главы с учетом общего контекста сцен,
    терминологического глоссария и описания/синопсиса тайтла.
    """
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    if not chapter_dialogue:
        return {}

    lines = []
    for i, item in enumerate(chapter_dialogue):
        spk = f"[{item['speaker']}]: " if item.get('speaker') else ""
        lines.append(f"[{i + 1}] (Стр. {item['page']}) {spk}{item['text']}")

    full_text = "\n".join(lines)

    synopsis_prompt = ""
    if title_description and title_description.strip():
        synopsis_prompt = (
            "\nСИНОПСИС И СТИЛЬ ПОВЕСТВОВАНИЯ (СТРОГО СОБЛЮДАЙ ЭТОТ ТОН И ХАРАКТЕРЫ):\n"
            f"{title_description.strip()}\n"
        )

    glossary_prompt = ""
    if glossary_rows:
        glossary_lines = [format_glossary_line(g) for g in glossary_rows]
        glossary_prompt = (
            "\nОБЯЗАТЕЛЬНЫЙ ГЛОССАРИЙ И СПИСОК ПЕРСОНАЖЕЙ (СТРОГО используй эти имена и правила речи):\n"
            + "\n".join(glossary_lines)
            + "\n"
        )

    prompt = (
        "Ты профессиональный литературный переводчик манги с японского на русский язык.\n"
        "Перед тобой полный текст всей главы манги по порядку чтения.\n"
        f"{synopsis_prompt}"
        f"{glossary_prompt}\n"
        "Правила перевода:\n"
        "1. Переводи естественно, сохраняя живой диалоговый тон и контекст сцен.\n"
        "2. Учитывай характер персонажей, их индивидуальную манеру речи и синопсис тайтла.\n"
        "3. Формат ответа СТРОГО:\n"
        "[1] Русский перевод первой реплики\n"
        "[2] Русский перевод второй реплики\n"
        "Никаких пояснений, префиксов персонажей или номеров страниц в тексте перевода. Только [номер] и сам русский текст."
        f"\n\nОригинал:\n{full_text}"
    )

    logger.info(f"========== [Gemini Chapter Batch] ЗАПРОС ПЕРЕВОДА ГЛАВЫ ==========")
    logger.info(f"Всего фраз: {len(chapter_dialogue)}, терминов глоссария: {len(glossary_rows)}, синопсис: {bool(title_description)}")

    response = ml.gemini_model.generate_content(prompt)
    raw_text = response.text.strip()

    logger.info(f"========== [Gemini Chapter Batch] СЫРОЙ ОТВЕТ НЕЙРОСЕТИ ==========\n{raw_text}")

    raw_lines = [line.strip() for line in raw_text.split("\n") if line.strip() and not line.strip().startswith("```")]

    result_map = {}
    for line in raw_lines:
        match = re.match(r"^\[(\d+)\]\s*(.*)$", line)
        if match:
            idx_str, trans = match.groups()
            idx = int(idx_str) - 1
            if 0 <= idx < len(chapter_dialogue):
                block_id = chapter_dialogue[idx]["id"]
                result_map[block_id] = trans.strip()

    logger.info(f"Успешно сопоставлено переводов: {len(result_map)} из {len(chapter_dialogue)}")
    return result_map