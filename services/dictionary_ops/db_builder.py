# services/dictionary_ops/db_builder.py
# Инициализация data/jp_dict.sqlite, импорт архивов Yomitan v3 (Warodai + JMdict RU) и автозагрузка

import json
import sqlite3
import threading
import urllib.request
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, List, Optional, Iterator

from config import JP_DICT_DB_PATH, DICT_SOURCES_DIR
from logger import logger

# Официальные релизные сборки словарей в формате Yomitan v3
DICT_DOWNLOAD_URLS: Dict[str, str] = {
    "jmdict_ru": "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_russian.zip",
    "warodai": "https://github.com/TrueBad0ur/warodai-yomitan-jp/releases/latest/download/warodai-yomitan.zip",
}

# Стартовый встроенный мини-словарь базовой манга-лексики (на случай полного офлайна до скачивания ZIP)
STARTER_MANGA_ENTRIES = [
    ("warodai", 1, "食べる", "たべる", "v1", "гл. II спр. переходн.", ["есть, кушать", "питаться, жить (чем-л.)"], 100, 100),
    ("warodai", 2, "見る", "みる", "v1", "гл. II спр.", ["смотреть, глядеть", "видеть", "пробовать (после деепр. на -тэ)"], 80, 100),
    ("warodai", 3, "行く", "いく", "v5k-s", "гл. I спр.", ["идти, ехать, направляться", "уходить"], 60, 100),
    ("warodai", 4, "来る", "くる", "vk", "гл. непр. спр.", ["приходить, прибывать", "наступать"], 70, 100),
    ("warodai", 5, "言う", "いう", "v5u", "гл. I спр.", ["говорить, сказать", "называть"], 50, 100),
    ("warodai", 6, "分かる", "わかる", "v5r", "гл. I спр.", ["понимать, быть понятным", "становиться известным"], 90, 100),
    ("warodai", 7, "知る", "しる", "v5r", "гл. I спр.", ["знать, ведать", "узнавать"], 95, 100),
    ("warodai", 8, "思う", "おもう", "v5u", "гл. I спр.", ["думать, полагать, считать", "чувствовать"], 85, 100),
    ("warodai", 9, "やる", "やる", "v5r", "гл. I спр.", ["делать, совершать (разг.)", "давать (младшему/равным)"], 110, 95),
    ("warodai", 10, "殺す", "ころす", "v5s", "гл. I спр.", ["убивать, лишать жизни"], 400, 90),
    ("warodai", 11, "死ぬ", "しぬ", "v5n", "гл. I спр.", ["умирать, погибать"], 380, 90),
    ("warodai", 12, "助ける", "たすける", "v1", "гл. II спр.", ["спасать, выручать, помогать"], 350, 90),
    ("warodai", 13, "待つ", "まつ", "v5t", "гл. I спр.", ["ждать, ожидать", "подожди! (в форме маттэ)"], 150, 95),
    ("warodai", 14, "違う", "ちがう", "v5u", "гл. I спр.", ["отличаться, быть другим", "нет! не так! ошибаешься!"], 160, 95),
    ("warodai", 15, "凄い", "すごい", "adj-i", "прил.", ["потрясающий, крутой, невероятный", "жуткий, страшный"], 200, 95),
    ("warodai", 16, "やばい", "やばい", "adj-i", "прил. сленг", ["опасный, скверный, дело дрянь", "обалденный, крутой (молод. сленг)"], 210, 95),
    ("warodai", 17, "嘘", "うそ", "n", "сущ.", ["ложь, неправда, враньё", "да ладно?! не может быть!"], 220, 95),
    ("warodai", 18, "本当", "ほんとう", "n adj-na", "сущ.", ["правда, истина, на самом деле"], 140, 95),
    ("warodai", 19, "俺", "おれ", "pn", "мест. муж.", ["я (мужское разговорное/грубоватое местоимение)"], 30, 100),
    ("warodai", 20, "僕", "ぼく", "pn", "мест. муж.", ["я (мужское мягкое местоимение)"], 40, 100),
    ("warodai", 21, "私", "わたし", "pn", "мест.", ["я (нейтральное/вежливое местоимение)"], 20, 100),
    ("warodai", 22, "お前", "おまえ", "pn", "мест. разг.", ["ты (фамильярное или грубое обращение)"], 45, 100),
    ("warodai", 23, "てめえ", "てめえ", "pn", "мест. бран.", ["ты, сволочь / ты, гад (крайне грубое обращение)"], 500, 90),
    ("warodai", 24, "貴様", "きさま", "pn", "мест. бран.", ["ты, мерзавец / негодяй (враждебное обращение в манге)"], 520, 90),
    ("warodai", 25, "悪魔", "あくま", "n", "сущ.", ["демон, дьявол, злой дух"], 600, 90),
    ("warodai", 26, "先生", "せんせい", "n", "сущ.", ["учитель, наставник, доктор, сэнсэй"], 180, 95),
    ("warodai", 27, "先輩", "せんぱい", "n", "сущ.", ["старший товарищ/коллега, сэмпай"], 250, 95),
    ("warodai", 28, "仲間", "なかま", "n", "сущ.", ["товарищ, компаньон, друг, соратник"], 260, 95),
    ("warodai", 29, "兆候", "ちょうこう", "n", "сущ.", ["признак, симптом, предзнаменование, примета"], 610, 90),
]

_build_lock = threading.Lock()
_schema_lock = threading.Lock()
_build_progress: Dict[str, Any] = {
    "is_building": False,
    "stage": "idle",
    "message": "",
    "error": None,
}


def get_dict_db_connection(db_path: Path = JP_DICT_DB_PATH) -> sqlite3.Connection:
    """Создаёт соединение с базой словаря с настроенными PRAGMA (WAL, mmap, кэш)."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA mmap_size = 268435456;")
    conn.execute("PRAGMA cache_size = -64000;")
    conn.execute("PRAGMA temp_store = 2;")
    return conn


@contextmanager
def dict_db_connection(db_path: Path = JP_DICT_DB_PATH) -> Iterator[sqlite3.Connection]:
    """Контекстный менеджер соединения с базой словаря: гарантированно закрывает его."""
    conn = get_dict_db_connection(db_path)
    try:
        yield conn
    finally:
        conn.close()


def ensure_jp_dict_schema(db_path: Path = JP_DICT_DB_PATH) -> None:
    """Создаёт таблицы и индексы в data/jp_dict.sqlite и засевает стартовый набор, если база пуста."""
    with _schema_lock:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with dict_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS dict_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    seq_id INTEGER,
                    kanji TEXT NOT NULL,
                    reading TEXT NOT NULL,
                    rules TEXT DEFAULT '',
                    pos_tags TEXT DEFAULT '',
                    senses_json TEXT NOT NULL,
                    freq_rank INTEGER DEFAULT 999999,
                    score INTEGER DEFAULT 0
                );
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_kanji ON dict_entries(kanji, freq_rank ASC, score DESC);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_reading ON dict_entries(reading, freq_rank ASC, score DESC);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_source ON dict_entries(source);")

            cur.execute("SELECT COUNT(*) FROM dict_entries")
            count = cur.fetchone()[0]
            if count == 0:
                seed_rows = [
                    (src, seq, k, r, rules, pos, json.dumps(senses, ensure_ascii=False), freq, sc)
                    for src, seq, k, r, rules, pos, senses, freq, sc in STARTER_MANGA_ENTRIES
                ]
                cur.executemany(
                    """
                    INSERT INTO dict_entries
                    (source, seq_id, kanji, reading, rules, pos_tags, senses_json, freq_rank, score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    seed_rows,
                )
                conn.commit()


def _extract_structured_text(node: Any) -> str:
    """Рекурсивно извлекает читаемый текст из structured-content узлов Yomitan v3."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        parts = [_extract_structured_text(child) for child in node]
        return " ".join(p for p in parts if p).strip()
    if isinstance(node, dict):
        # Пропускаем чисто служебные блоки ссылок, если нужно, или вытаскиваем content
        content = node.get("content")
        if content is not None:
            return _extract_structured_text(content)
        text = node.get("text")
        if isinstance(text, str):
            return text.strip()
    return ""


def extract_plain_senses(raw_glossary: list) -> List[str]:
    """Нормализует простые строки и structured-content объекты Yomitan v3 в чистые строки перевода."""
    result: List[str] = []
    for item in raw_glossary:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                result.append(cleaned)
        elif isinstance(item, dict):
            extracted = _extract_structured_text(item).strip()
            if extracted:
                result.append(extracted)
    return result


def import_yomitan_zip(
    zip_path: Path,
    source_label: str,
    base_freq: int = 50000,
    db_path: Path = JP_DICT_DB_PATH,
) -> int:
    """Импортирует ZIP-архив стандарта Yomitan v3 (term_bank_*.json) в data/jp_dict.sqlite."""
    zip_path = Path(zip_path)
    if not zip_path.exists() or not zipfile.is_zipfile(zip_path):
        raise ValueError(f"Файл '{zip_path}' не найден или не является корректным ZIP-архивом")

    ensure_jp_dict_schema(db_path)

    inserted = 0
    batch: List[tuple] = []

    with dict_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA synchronous = OFF;")

        # Удаляем старые записи этого источника перед переимпортом
        cur.execute("DELETE FROM dict_entries WHERE source = ?", (source_label,))
        # Фиксируем удаление сразу, чтобы не держать долгий write-lock во время импорта
        conn.commit()

        with zipfile.ZipFile(zip_path, "r") as zf:
            term_files = sorted(
                f for f in zf.namelist()
                if ("term_bank_" in f) and f.endswith(".json")
            )
            for tf in term_files:
                try:
                    rows = json.loads(zf.read(tf).decode("utf-8"))
                except Exception as e:
                    logger.warning(f"[Dictionary] Пропущен битый файл '{tf}' в '{zip_path.name}': {e}")
                    continue
                if not isinstance(rows, list):
                    continue

                for row in rows:
                    if not isinstance(row, list) or len(row) < 6:
                        continue
                    expr = str(row[0] or "").strip()
                    reading = str(row[1] or expr).strip()
                    def_tags = str(row[2] or "").strip()
                    rules = str(row[3] or "").strip()
                    try:
                        score = int(row[4] or 0)
                    except (TypeError, ValueError):
                        score = 0
                    raw_gloss = row[5] if isinstance(row[5], list) else []
                    seq = 0
                    if len(row) > 6 and row[6] is not None:
                        try:
                            seq = int(row[6])
                        except (TypeError, ValueError):
                            seq = 0
                    term_tags = str(row[7] or "").strip() if len(row) > 7 else ""

                    if not expr:
                        continue

                    senses = extract_plain_senses(raw_gloss)
                    if not senses:
                        continue

                    pos_combined = " ".join(filter(None, [def_tags, term_tags])).strip()
                    batch.append((
                        source_label,
                        seq,
                        expr,
                        reading,
                        rules,
                        pos_combined,
                        json.dumps(senses[:8], ensure_ascii=False),
                        base_freq,
                        score,
                    ))
                    if len(batch) >= 4000:
                        cur.executemany(
                            """
                            INSERT INTO dict_entries
                            (source, seq_id, kanji, reading, rules, pos_tags, senses_json, freq_rank, score)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            batch,
                        )
                        # Короткая транзакция на каждую пачку: база не держит write-lock долго
                        conn.commit()
                        inserted += len(batch)
                        batch.clear()

        if batch:
            cur.executemany(
                """
                INSERT INTO dict_entries
                (source, seq_id, kanji, reading, rules, pos_tags, senses_json, freq_rank, score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                batch,
            )
            inserted += len(batch)

        conn.commit()
        # Возвращаем WAL-режим после быстрой пакетной вставки
        cur.execute("PRAGMA synchronous = NORMAL;")

    logger.info(f"[Dictionary] Импортировано {inserted} статей из '{zip_path.name}' (source={source_label}).")
    return inserted


def get_dictionary_status(db_path: Path = JP_DICT_DB_PATH) -> Dict[str, Any]:
    ensure_jp_dict_schema(db_path)
    counts: Dict[str, int] = {}
    total = 0
    try:
        with dict_db_connection(db_path) as conn:
            rows = conn.execute(
                "SELECT source, COUNT(*) as cnt FROM dict_entries GROUP BY source"
            ).fetchall()
            for r in rows:
                counts[r["source"]] = int(r["cnt"])
                total += int(r["cnt"])
    except Exception as e:
        logger.warning(f"Ошибка проверки статуса словаря: {e}")

    local_zips = [f.name for f in DICT_SOURCES_DIR.glob("*.zip")]
    return {
        "db_path": str(db_path),
        "total_entries": total,
        "sources": counts,
        "is_full_dictionary_loaded": total > 5000,
        "local_zip_files": local_zips,
        "build_progress": dict(_build_progress),
    }


def _download_dictionary_zip(url: str, zip_path: Path) -> None:
    """Скачивает ZIP-архив словаря во временный файл и атомарно подменяет целевой."""
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = zip_path.with_suffix(zip_path.suffix + ".part")

    logger.info(f"[Dictionary] Скачивание {url} -> {zip_path}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "MangaTranslator/2.0 (Local Offline Dictionary Builder)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120.0) as resp, open(tmp_path, "wb") as out_f:
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                out_f.write(chunk)

        if not zipfile.is_zipfile(tmp_path):
            raise ValueError("Скачанный файл не является ZIP-архивом (возможно, ошибка сети или редирект на HTML)")
        tmp_path.replace(zip_path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def download_and_build_dictionaries(
    sources: Optional[List[str]] = None,
    force_download: bool = False,
) -> Dict[str, Any]:
    """
    Скачивает архивы Yomitan (JMdict_russian.zip, warodai-yomitan.zip) в data/dictionaries/
    и собирает индексированную базу data/jp_dict.sqlite.
    Если в папке data/dictionaries уже лежат локальные .zip архивы — использует их.
    """
    if not _build_lock.acquire(blocking=False):
        return {"success": False, "message": "Сборка словаря уже выполняется", "status": get_dictionary_status()}

    target_sources = sources or ["jmdict_ru", "warodai"]
    imported_stats: Dict[str, int] = {}

    try:
        _build_progress["is_building"] = True
        _build_progress["error"] = None
        _build_progress["stage"] = "starting"
        _build_progress["message"] = "Подготовка базы словаря..."

        ensure_jp_dict_schema(JP_DICT_DB_PATH)

        for src_key in target_sources:
            url = DICT_DOWNLOAD_URLS.get(src_key)
            if not url:
                logger.warning(f"[Dictionary] Неизвестный источник словаря: {src_key}")
                continue

            zip_filename = "JMdict_russian.zip" if src_key == "jmdict_ru" else f"{src_key}-yomitan.zip"
            zip_path = DICT_SOURCES_DIR / zip_filename

            if force_download or not zip_path.exists() or zip_path.stat().st_size < 10_000 or not zipfile.is_zipfile(zip_path):
                _build_progress["stage"] = f"downloading_{src_key}"
                _build_progress["message"] = f"Скачивание словаря {src_key} ({zip_filename})..."
                _download_dictionary_zip(url, zip_path)

            _build_progress["stage"] = f"importing_{src_key}"
            _build_progress["message"] = f"Индексация {zip_filename} в SQLite..."
            base_freq = 10000 if src_key == "warodai" else 20000
            cnt = import_yomitan_zip(zip_path, source_label=src_key, base_freq=base_freq)
            imported_stats[src_key] = cnt

        _build_progress["stage"] = "done"
        _build_progress["message"] = "Словарь успешно собран и проиндексирован!"
        _build_progress["is_building"] = False
        return {
            "success": True,
            "imported": imported_stats,
            "status": get_dictionary_status(),
        }
    except Exception as e:
        logger.error(f"[Dictionary] Ошибка сборки словаря: {e}")
        _build_progress["stage"] = "error"
        _build_progress["error"] = str(e)
        _build_progress["message"] = f"Ошибка: {e}"
        _build_progress["is_building"] = False
        return {
            "success": False,
            "error": str(e),
            "status": get_dictionary_status(),
        }
    finally:
        _build_progress["is_building"] = False
        _build_lock.release()
