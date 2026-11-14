# routers/dictionary_impl.py
# Обработчики эндпоинтов локального японско-русского словаря и быстрого сохранения в глоссарий тайтла

from fastapi import HTTPException
from database import db_session
from schemas.dictionary import (
    DictAnalyzeRequest,
    DictLookupRequest,
    DictGlossaryUpsertRequest,
    DictBuildRequest,
)
from services.dictionary import (
    analyze_bubble_text,
    invalidate_glossary_cache,
    get_dictionary_status,
    download_and_build_dictionaries,
    dict_engine,
)
from services.page_service import get_active_global_settings


def get_dict_status_endpoint():
    return {"success": True, **get_dictionary_status()}


def build_dict_endpoint(req: DictBuildRequest):
    return download_and_build_dictionaries(
        sources=req.sources,
        force_download=bool(req.force_rebuild),
    )


def analyze_bubble_endpoint(req: DictAnalyzeRequest):
    mode = req.nlp_mode or "auto"
    if mode == "auto":
        cfg = get_active_global_settings()
        mode = cfg.get("dict_nlp_mode") or "auto"

    tokens = analyze_bubble_text(
        jap_text=req.jap_text or "",
        title_id=req.title_id,
        nlp_mode=mode,
    )
    return {
        "success": True,
        "title_id": req.title_id,
        "tokens": tokens,
    }


def lookup_word_endpoint(req: DictLookupRequest):
    q = (req.query or "").strip()
    if not q:
        return {"success": True, "lemma": "", "chain": [], "entries": []}
    lemma, chain, entries = dict_engine.lookup_sql_cascade(surface=q, sudachi_lemma=q, sudachi_norm=q)
    return {
        "success": True,
        "lemma": lemma,
        "chain": chain,
        "entries": [
            {
                "source": e.source,
                "kanji": e.kanji,
                "reading": e.reading,
                "pos": e.pos,
                "meanings": e.meanings,
            }
            for e in entries
        ],
    }


def upsert_glossary_from_dict_endpoint(req: DictGlossaryUpsertRequest):
    jap_clean = (req.jap_word or "").strip()
    rus_clean = (req.rus_word or "").strip()
    ctx_clean = (req.context or "").strip()

    if not jap_clean or not rus_clean:
        raise HTTPException(status_code=400, detail="Поля jap_word и rus_word обязательны")

    with db_session() as cur:
        cur.execute(
            "SELECT id FROM glossary WHERE title_id = ? AND jap_word = ?",
            (req.title_id, jap_clean),
        )
        existing = cur.fetchone()
        if existing:
            item_id = int(existing["id"])
            cur.execute(
                "UPDATE glossary SET rus_word = ?, context = ? WHERE id = ?",
                (rus_clean, ctx_clean, item_id),
            )
        else:
            cur.execute(
                "INSERT INTO glossary (title_id, jap_word, rus_word, context) VALUES (?, ?, ?, ?)",
                (req.title_id, jap_clean, rus_clean, ctx_clean),
            )
            item_id = int(cur.lastrowid)

    invalidate_glossary_cache(req.title_id)

    return {
        "success": True,
        "item": {
            "id": item_id,
            "title_id": req.title_id,
            "jap_word": jap_clean,
            "rus_word": rus_clean,
            "context": ctx_clean,
        },
    }
