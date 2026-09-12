# services/translator.py
# Взаимодействие с Google Gemini SDK, санитизация и разбор ответов

import re
from typing import List, Dict, Any, Optional
from ml.models import ml
from schemas import BatchTranslateItem
from logger import logger
from services.prompts import (
    build_single_translate_prompt,
    build_page_batch_prompt,
    build_chapter_batch_prompt,
)


def sanitize_translation(text: str) -> str:
    """
    Удаляет случайные артефакты от нейросети в начале реплики:
    - Префиксы спикеров: '[デンジ]:', '[Макима]:', '[Speaker 1]:', 'Дэндзи:'
    - Лишние кавычки в начале и конце
    """
    clean = text.strip()

    # 1. Срезаем префиксы вида [Имя в любых символах]: или [Имя]:
    clean = re.sub(r"^\[[^\]]+\]\s*:?\s*", "", clean)

    # 2. Срезаем префиксы вида "Имя:" без скобок в начале строки (до 20 символов)
    clean = re.sub(r"^[A-Za-zА-Яа-яЁёぁ-んァ-ヶ一-龥]{2,20}\s*:\s*", "", clean)

    # 3. Убираем обрамляющие кавычки, если LLM обернула фразу целиком
    if (clean.startswith('"') and clean.endswith('"')) or (clean.startswith('«') and clean.endswith('»')):
        clean = clean[1:-1].strip()

    return clean.strip()


def translate_single_text(text: str, title_description: str = "") -> str:
    """Перевод одиночной реплики."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")

    prompt = build_single_translate_prompt(text, title_description)
    logger.info(f"--- [Gemini Single] Запрос:\n{text}")
    response = ml.gemini_model.generate_content(prompt)
    result = sanitize_translation(response.text.strip())
    logger.info(f"--- [Gemini Single] Ответ:\n{result}")
    return result


def translate_batch_items(
    items: List[BatchTranslateItem],
    title_description: str = "",
    glossary_rows: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, str]:
    """Пакетный перевод реплик одной страницы."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")
    if not items:
        return {}

    lines = []
    for i, item in enumerate(items):
        speaker_prefix = f"[{item.speaker}]: " if item.speaker and item.speaker.strip() else ""
        lines.append(f"[{i + 1}] {speaker_prefix}{item.text}")

    dialogue_text = "\n".join(lines)
    prompt = build_page_batch_prompt(dialogue_text, title_description, glossary_rows)

    logger.info(f"=== [Gemini Page Batch] Отправка {len(items)} реплик на перевод ===")
    response = ml.gemini_model.generate_content(prompt)
    raw_text = response.text.strip()
    logger.info(f"=== [Gemini Page Batch] Ответ нейросети:\n{raw_text}")

    result_map = {}
    for line in raw_text.split("\n"):
        line = line.strip()
        match = re.match(r"^\[(\d+)\]\s*(.*)$", line)
        if match:
            idx_str, translated = match.groups()
            idx = int(idx_str) - 1
            if 0 <= idx < len(items):
                item_id = items[idx].id
                result_map[item_id] = sanitize_translation(translated)

    return result_map


def translate_chapter_dialogues(
    chapter_dialogue: List[Dict[str, Any]],
    glossary_rows: List[Dict[str, Any]],
    title_description: str = ""
) -> Dict[str, str]:
    """Перевод реплик всей главы манги."""
    if not ml.gemini_model:
        raise RuntimeError("Gemini API не сконфигурирован")
    if not chapter_dialogue:
        return {}

    lines = []
    for i, item in enumerate(chapter_dialogue):
        spk = f"[{item['speaker']}]: " if item.get("speaker") else ""
        lines.append(f"[{i + 1}] (Стр. {item['page']}) {spk}{item['text']}")

    full_text = "\n".join(lines)
    prompt = build_chapter_batch_prompt(full_text, title_description, glossary_rows)

    logger.info(f"========== [Gemini Chapter Batch] ЗАПРОС ПЕРЕВОДА ГЛАВЫ ==========")
    logger.info(f"Фраз: {len(chapter_dialogue)}, глоссарий: {len(glossary_rows)}, синопсис: {bool(title_description)}")

    response = ml.gemini_model.generate_content(prompt)
    raw_text = response.text.strip()
    logger.info(f"========== [Gemini Chapter Batch] ОТВЕТ ==========\n{raw_text}")

    raw_lines = [line.strip() for line in raw_text.split("\n") if line.strip() and not line.strip().startswith("```")]
    result_map = {}
    for line in raw_lines:
        match = re.match(r"^\[(\d+)\]\s*(.*)$", line)
        if match:
            idx_str, trans = match.groups()
            idx = int(idx_str) - 1
            if 0 <= idx < len(chapter_dialogue):
                block_id = chapter_dialogue[idx]["id"]
                result_map[block_id] = sanitize_translation(trans)

    logger.info(f"Успешно сопоставлено: {len(result_map)} из {len(chapter_dialogue)}")
    return result_map