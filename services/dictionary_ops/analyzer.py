# services/dictionary_ops/analyzer.py
# Морфологический анализатор баблов (GiNZA bert-large / electra / SudachiPy) + Aho-Corasick Глоссарий + SQLite
# Включает:
# - Потокобезопасную блокировку Rust RefCell (фикс RuntimeError: Already borrowed)
# - Иерархический поиск подслов, продуктивных суффиксов (-的, -化, -性, -感 и др.) и глаголов (化する / 化す) в стиле Rikaikun/Yomitan
# - Корректную обработку конструкций [Сущ] + 化して + 来てる (отделение глагольного суффикса 化する при наличии окуриганы и склейка вспомогательных глаголов)
# - Склейку составных союзов и разговорных выражений (でも, だけど, だから, なのに, かもしれない и др.)

import json
import re
import threading
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from config import JP_DICT_DB_PATH
from database import get_db
from logger import logger
from services.dictionary_ops.deinflector import (
    POS_MAP_RU,
    kata_to_hira,
    deinflect_candidates,
)
from services.dictionary_ops.db_builder import (
    ensure_jp_dict_schema,
    dict_db_connection,
)

try:
    import ahocorasick  # type: ignore
    HAS_AHOCORASICK = True
except ImportError:
    ahocorasick = None
    HAS_AHOCORASICK = False


# Продуктивные японские суффиксы и префиксы, которые часто склеиваются с корнем в манге
PRODUCTIVE_SUFFIXES_RU: Dict[str, Tuple[str, str, List[str]]] = {
    "的": ("てき", "суффикс прилаг. (-тэки)", [
        "-ческий, -ный, носящий характер чего-л. (превращает существительное в na-прилагательное, напр. 暴力的 — насильственный, жестокий)"
    ]),
    "化": ("か", "суффикс / гл. (-ка / -касуру)", [
        "превращение в..., -изация, -фикация; с глаголом する (化する / 化す) — превращаться в..., становиться кем-л."
    ]),
    "性": ("せい", "суффикс (-сэй)", [
        "свойство, природа, -ость, характер (напр. 人間性 — человечность, опасность — 危険性)"
    ]),
    "感": ("かん", "суффикс (-кан)", [
        "чувство, ощущение, впечатление чего-л."
    ]),
    "力": ("りょく", "суффикс (-рёку / -тикара)", [
        "сила, способность, мощь"
    ]),
    "者": ("しゃ", "суффикс (-ся / -моно)", [
        "человек, деятель, лицо (обладающее качеством или профессией)"
    ]),
    "たち": ("たち", "суффикс мн. ч. (-тати)", [
        "множественное число (и др., и компания)"
    ]),
    "達": ("たち", "суффикс мн. ч. (-тати)", [
        "множественное число (и др., и компания)"
    ]),
    "ら": ("ら", "суффикс мн. ч. (-ра)", [
        "множественное число (разг.: они, эти и др.)"
    ]),
    "さん": ("さん", "именной суффикс (-сан)", [
        "вежливое обращение к человеку (-сан)"
    ]),
    "ちゃん": ("ちゃん", "именной суффикс (-тян)", [
        "ласкательное обращение (-тян)"
    ]),
    "くん": ("くん", "именной суффикс (-кун)", [
        "товарищеское обращение (-кун)"
    ]),
    "君": ("くん", "именной суффикс (-кун)", [
        "товарищеское обращение (-кун)"
    ]),
    "様": ("さま", "именной суффикс (-сама)", [
        "почтительное обращение: господин, владыка (-сама)"
    ]),
    "さま": ("さま", "именной суффикс (-сама)", [
        "почтительное обращение: господин, владыка (-сама)"
    ]),
    "先輩": ("せんぱい", "обращение (-сэмпай)", [
        "старший товарищ / наставник (-сэмпай)"
    ]),
    "先生": ("せんせい", "обращение (-сэнсэй)", [
        "учитель, наставник, доктор (-сэнсэй)"
    ]),
    "殿": ("どの", "именной суффикс (-доно)", [
        "официальное или архаичное обращение (-доно)"
    ]),
    "風": ("ふう", "суффикс (-фу:)", [
        "в стиле..., на манер..., похожий на..."
    ]),
    "用": ("よう", "суффикс (-ё:)", [
        "предназначенный для..., для использования..."
    ]),
    "中": ("ちゅう", "суффикс (-тю: / -нака)", [
        "в процессе..., во время..., среди..."
    ]),
    "後": ("ご", "суффикс (-го / -ато)", [
        "после..., спустя..."
    ]),
    "前": ("まえ", "суффикс (-маэ / -дзэн)", [
        "перед..., до..., порция"
    ]),
    "目": ("め", "суффикс числит. (-мэ)", [
        "образует порядковое числительное (-й по счёту)"
    ]),
    "っぽい": ("っぽい", "суффикс прил. (-ппой)", [
        "похожий на..., склонный к..., -оватый (разг.)"
    ]),
    "らしい": ("らしい", "суффикс прил. (-расий)", [
        "типичный для..., настоящий..., по-видимому / говорят, что..."
    ]),
    "みたい": ("みたい", "суффикс (-митай)", [
        "похожий на..., словно, как будто"
    ]),
    "すぎる": ("すぎる", "суффикс гл. (-сугиру)", [
        "слишком..., чересчур..."
    ]),
    "過ぎる": ("すぎる", "суффикс гл. (-сугиру)", [
        "слишком..., чересчур..."
    ]),
}

# Дополнительные глагольные леммы для суффиксов (чтобы при разборе -化 подтягивались статьи 化する и 化す)
SUFFIX_EXTRA_LEMMAS: Dict[str, List[str]] = {
    "化": ["化する", "化す", "化"],
    "視": ["視する", "視"],
    "的": ["的"],
}

# Составные союзы, частицы и разговорные связки, которые UniDic дробит на атомарные морфемы
COMPOUND_EXPRESSIONS_SET = {
    "でも", "だけど", "だから", "なのに", "けれど", "けれども", "しかし",
    "しかも", "それに", "それで", "すると", "または", "および", "ならびに",
    "かも", "かもしれない", "かもしれん", "かしら", "じゃない", "じゃねえ",
    "じゃん", "ってば", "ったら", "なんて", "なんか", "ばかり", "ばっか",
    "ばっかり", "くらい", "ぐらい", "ながら", "として", "について", "にとって",
    "によって", "に対して", "に関して", "という", "といった", "ていうか",
    "っていうか", "というか", "やっぱり", "やっぱ", "つまり", "とにかく",
    "とりあえず", "まさか", "さすが", "せっかく", "わざわざ",
}

# Вспомогательные глаголы движения/аспекта, идущие после -て / -で формы
COLLOQUIAL_AUX_VERB_LEMMAS = {
    "ちゃう", "ちまう", "しまう", "いる", "おく", "ある",
    "みる", "いく", "くる", "계시다", "行く", "来る", "居る", "見る", "置く",
}

SURU_SURFACE_PREFIXES = (
    "して", "した", "しろ", "せよ", "せず", "せぬ", "すりゃ", "すれ",
    "しない", "しねえ", "しなく", "します", "しました", "しません",
    "しよう", "しちゃう", "しちゃった", "しちまう", "しちまった",
    "してる", "してた", "しといて", "しとく", "される", "された", "시키는", "させる", "させた", "する",
)


@dataclass
class DictSense:
    source: str
    kanji: str
    reading: str
    pos: str
    meanings: List[str]


@dataclass
class GlossaryHit:
    id: int
    jap_word: str
    rus_word: str
    context: str


@dataclass
class TokenSpanOut:
    surface: str
    lemma: str
    reading: str
    pos_ru: str
    inflection_chain: List[str] = field(default_factory=list)
    is_punct_or_particle: bool = False
    ner_label: Optional[str] = None  # "PERSON" | "LOC" | "ORG" от GiNZA bert-large/electra
    glossary_match: Optional[GlossaryHit] = None
    dict_entries: List[DictSense] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MangaDictionaryEngine:
    def __init__(self, dict_db_path: Path = JP_DICT_DB_PATH):
        self.dict_db_path = dict_db_path
        self._lock = threading.RLock()
        # Отдельный лок для сериализации вызовов Rust-ядра SudachiPy и пайплайна spaCy/GiNZA
        # (предотвращает RuntimeError: Already borrowed в многопоточном FastAPI)
        self._nlp_lock = threading.RLock()
        self._sudachi_tokenizer = None
        self._sudachi_split_mode = None
        self._sudachi_mode_a = None
        self._spacy_nlp_map: Dict[str, Any] = {}
        self._active_nlp_backend: str = "uninitialized"
        self._glossary_cache: Dict[int, List[GlossaryHit]] = {}
        self._glossary_automatons: Dict[int, Any] = {}

        ensure_jp_dict_schema(self.dict_db_path)

    def _init_sudachi(self) -> bool:
        with self._nlp_lock:
            if self._sudachi_tokenizer is not None:
                return True
            try:
                from sudachipy import dictionary, tokenizer  # type: ignore
                for dict_type in ("full", "core", "small"):
                    try:
                        sudachi_dict = dictionary.Dictionary(dict=dict_type)
                        self._sudachi_tokenizer = sudachi_dict.create()
                        self._sudachi_split_mode = tokenizer.Tokenizer.SplitMode.B
                        self._sudachi_mode_a = tokenizer.Tokenizer.SplitMode.A
                        if self._active_nlp_backend == "uninitialized":
                            self._active_nlp_backend = f"sudachipy ({dict_type})"
                        logger.info(f"[Dictionary NLP] SudachiPy инициализирован (dict={dict_type}).")
                        return True
                    except Exception:
                        continue
            except Exception as e:
                logger.debug(f"[Dictionary NLP] SudachiPy недоступен: {e}")
            return False

    def _get_spacy_ginza(self, preferred: str = "auto") -> Optional[Any]:
        """
        Загружает GiNZA v5.3+ (ja_ginza_bert_large -> ja_ginza_electra -> ja_ginza)
        под потокобезопасной блокировкой.
        """
        if preferred == "sudachi":
            return None

        if preferred == "bert_large":
            candidates = ["ja_ginza_bert_large"]
        elif preferred == "electra":
            candidates = ["ja_ginza_electra"]
        else:
            candidates = ["ja_ginza_bert_large", "ja_ginza_electra", "ja_ginza"]

        with self._nlp_lock:
            for model_name in candidates:
                if model_name in self._spacy_nlp_map:
                    self._active_nlp_backend = model_name
                    return self._spacy_nlp_map[model_name]

                try:
                    import spacy  # type: ignore
                    try:
                        spacy.prefer_gpu()
                    except Exception:
                        pass
                    nlp = spacy.load(model_name)
                    self._spacy_nlp_map[model_name] = nlp
                    self._active_nlp_backend = model_name
                    logger.info(f"[Dictionary NLP] Загружена модель GiNZA: {model_name}")
                    return nlp
                except Exception as e:
                    logger.debug(f"[Dictionary NLP] Модель {model_name} не загружена: {e}")
                    continue

        return None

    def get_nlp_info(self) -> Dict[str, Any]:
        if self._active_nlp_backend == "uninitialized":
            self._init_sudachi()
        return {
            "active_backend": self._active_nlp_backend,
            "has_ahocorasick": HAS_AHOCORASICK,
            "loaded_ginza_models": list(self._spacy_nlp_map.keys()),
        }

    # ---- Работа с Глоссарием тайтла (из основной БД manga_db.sqlite) ----

    def invalidate_glossary_cache(self, title_id: Optional[int] = None) -> None:
        with self._lock:
            if title_id is None:
                self._glossary_cache.clear()
                self._glossary_automatons.clear()
            else:
                self._glossary_cache.pop(title_id, None)
                self._glossary_automatons.pop(title_id, None)

    def _load_title_glossary(self, title_id: int) -> List[GlossaryHit]:
        with self._lock:
            if title_id in self._glossary_cache:
                return self._glossary_cache[title_id]

        items: List[GlossaryHit] = []
        try:
            with get_db() as conn:
                rows = conn.execute(
                    "SELECT id, jap_word, rus_word, context FROM glossary WHERE title_id = ? AND TRIM(jap_word) != ''",
                    (title_id,),
                ).fetchall()
                for r in rows:
                    jp = (r["jap_word"] or "").strip()
                    if jp:
                        items.append(
                            GlossaryHit(
                                id=int(r["id"]),
                                jap_word=jp,
                                rus_word=(r["rus_word"] or "").strip(),
                                context=(r["context"] or "").strip(),
                            )
                        )
        except Exception as e:
            logger.warning(f"Не удалось прочитать глоссарий для title_id={title_id}: {e}")

        with self._lock:
            self._glossary_cache[title_id] = items
            if HAS_AHOCORASICK and items:
                automaton = ahocorasick.Automaton()
                for hit in items:
                    automaton.add_word(hit.jap_word, (len(hit.jap_word), hit))
                automaton.make_automaton()
                self._glossary_automatons[title_id] = automaton

        return items

    def find_glossary_intervals(self, text: str, title_id: Optional[int]) -> List[Tuple[int, int, GlossaryHit]]:
        """Находит непересекающиеся вхождения терминов глоссария тайтла (приоритет длинным фразам)."""
        if not title_id or not text:
            return []

        items = self._load_title_glossary(title_id)
        if not items:
            return []

        raw_matches: List[Tuple[int, int, GlossaryHit]] = []
        automaton = self._glossary_automatons.get(title_id)

        if HAS_AHOCORASICK and automaton is not None:
            for end_idx, (term_len, hit) in automaton.iter(text):
                start_idx = end_idx - term_len + 1
                raw_matches.append((start_idx, end_idx + 1, hit))
        else:
            for hit in items:
                term = hit.jap_word
                start_pos = 0
                while True:
                    idx = text.find(term, start_pos)
                    if idx == -1:
                        break
                    raw_matches.append((idx, idx + len(term), hit))
                    start_pos = idx + 1

        if not raw_matches:
            return []

        raw_matches.sort(key=lambda x: (x[0], -(x[1] - x[0])))
        selected: List[Tuple[int, int, GlossaryHit]] = []
        last_end = -1
        for start, end, hit in raw_matches:
            if start >= last_end:
                selected.append((start, end, hit))
                last_end = end
        return selected

    # ---- Поиск в SQLite (Warodai -> JMdict RU -> JMdict EN) + Декомпозиция в стиле Rikaikun ----

    def _query_exact_terms(self, candidates: List[Tuple[str, List[str], List[str]]]) -> Tuple[Optional[str], List[str], List[DictSense]]:
        query_terms = [c[0] for c in candidates if c[0]]
        if not query_terms:
            return None, [], []

        unique_terms = list(dict.fromkeys(query_terms))
        placeholders = ",".join("?" for _ in unique_terms)
        sql = f"""
            SELECT source, kanji, reading, rules, pos_tags, senses_json, freq_rank, score
            FROM dict_entries
            WHERE kanji IN ({placeholders}) OR reading IN ({placeholders})
            ORDER BY
                CASE source
                    WHEN 'warodai' THEN 1
                    WHEN 'jmdict_ru' THEN 2
                    WHEN 'jmdict_en' THEN 3
                    ELSE 4
                END ASC,
                freq_rank ASC,
                score DESC
            LIMIT 16
        """

        try:
            with dict_db_connection(self.dict_db_path) as conn:
                rows = conn.execute(sql, unique_terms + unique_terms).fetchall()
        except Exception as e:
            logger.debug(f"Ошибка SQL-поиска словаря: {e}")
            rows = []

        matched_senses: List[DictSense] = []
        resolved_lemma: Optional[str] = None
        resolved_chain: List[str] = []
        seen_source_kanji = set()

        candidate_groups: Dict[str, List[Tuple[str, List[str], List[str]]]] = {}
        for candidate in candidates:
            candidate_groups.setdefault(candidate[0], []).append(candidate)

        for r in rows:
            db_kanji = r["kanji"]
            db_reading = r["reading"]
            db_rules = set((r["rules"] or "").split())

            matched_candidate: Optional[Tuple[str, List[str], List[str]]] = None
            fallback_candidate: Optional[Tuple[str, List[str], List[str]]] = None

            for cand_word in (db_kanji, db_reading):
                for candidate in candidate_groups.get(cand_word, []):
                    _, reasons, req_rules = candidate
                    if reasons and fallback_candidate is None:
                        fallback_candidate = candidate
                    if req_rules and db_rules and not db_rules.intersection(req_rules):
                        continue
                    matched_candidate = candidate
                    break
                if matched_candidate is not None:
                    break

            if matched_candidate is None:
                matched_candidate = fallback_candidate
            if matched_candidate is None:
                continue

            _, reasons, _ = matched_candidate
            if not reasons and fallback_candidate is not None and fallback_candidate[0] == matched_candidate[0]:
                reasons = fallback_candidate[1]
            if reasons and not resolved_chain:
                resolved_chain = reasons
                resolved_lemma = db_kanji
            elif resolved_lemma is None:
                resolved_lemma = db_kanji

            dedup_key = (r["source"], db_kanji, db_reading, r["senses_json"])
            if dedup_key in seen_source_kanji:
                continue
            seen_source_kanji.add(dedup_key)

            try:
                meanings = json.loads(r["senses_json"])
            except Exception:
                meanings = [str(r["senses_json"])]

            matched_senses.append(
                DictSense(
                    source=r["source"],
                    kanji=db_kanji,
                    reading=db_reading,
                    pos=r["pos_tags"] or "",
                    meanings=meanings,
                )
            )

        return resolved_lemma, resolved_chain, matched_senses[:6]

    def _decompose_subwords_and_suffixes(self, surface: str, sudachi_lemma: str) -> Tuple[List[str], List[DictSense]]:
        """
        Если составное слово (например, 暴力的, 悪魔化, マキマさん, 人間性) не найдено целиком:
        1) Проверяет продуктивные суффиксы (-的, -化, -性, -感, -たち, -さん и др.), ищет корень
           и подтягивает реальные словарные статьи для суффиксальных глаголов (например, 化する / 化す).
        2) Ищет самое длинное совпадающее подслово-префикс (как Rikaikun: 暴力的 -> 暴力 -> 暴)
           и оставшийся компонент.
        """
        target = sudachi_lemma or surface
        extra_chain: List[str] = []
        combined_senses: List[DictSense] = []

        # 1. Проверяем известные продуктивные суффиксы (например, 暴力 + 的, 悪魔 + 化)
        for sfx, (sfx_reading, sfx_pos, sfx_meanings) in sorted(
            PRODUCTIVE_SUFFIXES_RU.items(), key=lambda x: -len(x[0])
        ):
            for word_variant in dict.fromkeys([surface, target]):
                if word_variant.endswith(sfx) and len(word_variant) > len(sfx):
                    stem = word_variant[:-len(sfx)]
                    stem_cands = deinflect_candidates(stem)
                    stem_hira = kata_to_hira(stem)
                    if stem_hira and stem_hira != stem:
                        stem_cands.append((stem_hira, [], []))

                    _, stem_reasons, stem_senses = self._query_exact_terms(stem_cands)
                    if stem_senses:
                        extra_chain = stem_reasons + [f"+ {sfx} ({sfx_pos})"]
                        combined_senses.extend(stem_senses[:3])

                        # Подтягиваем реальные словарные статьи для самого суффикса/глагола (например, 化する / 化す)
                        extra_lemmas = SUFFIX_EXTRA_LEMMAS.get(sfx, [])
                        if extra_lemmas:
                            sfx_cands = [(lem, [], []) for lem in extra_lemmas]
                            _, _, db_sfx_senses = self._query_exact_terms(sfx_cands)
                            combined_senses.extend(db_sfx_senses[:2])

                        combined_senses.append(
                            DictSense(
                                source="warodai",
                                kanji=f"-{sfx}",
                                reading=sfx_reading,
                                pos=sfx_pos,
                                meanings=sfx_meanings,
                            )
                        )
                        return extra_chain, combined_senses[:7]

        # 2. Если токен длинный (составное слово из 2+ корней, например через Sudachi SplitMode.A или префиксы Rikaikun)
        sub_parts: List[str] = []
        if self._init_sudachi() and self._sudachi_tokenizer is not None and self._sudachi_mode_a is not None:
            with self._nlp_lock:
                a_morphs = list(self._sudachi_tokenizer.tokenize(surface, self._sudachi_mode_a))
            if len(a_morphs) > 1:
                for am in a_morphs:
                    part_form = am.dictionary_form() or am.surface()
                    if part_form and part_form != surface and part_form not in sub_parts:
                        sub_parts.append(part_form)

        # Также добавляем префиксы по убыванию длины (как Rikaikun: от N-1 до 1 символа)
        if len(surface) >= 2:
            for length in range(len(surface) - 1, 0, -1):
                prefix = surface[:length]
                if prefix not in sub_parts:
                    sub_parts.append(prefix)

        seen_kanji = set()
        for part in sub_parts[:6]:
            part_cands = deinflect_candidates(part)
            _, _, part_senses = self._query_exact_terms(part_cands)
            for ps in part_senses[:2]:
                key = (ps.source, ps.kanji, ps.reading)
                if key not in seen_kanji:
                    seen_kanji.add(key)
                    combined_senses.append(ps)
            if len(combined_senses) >= 5:
                break

        return extra_chain, combined_senses[:6]

    def lookup_sql_cascade(
        self,
        surface: str,
        sudachi_lemma: str = "",
        sudachi_norm: str = "",
        reading_hira: str = "",
    ) -> Tuple[str, List[str], List[DictSense]]:
        candidates = deinflect_candidates(surface)

        for extra_form in (sudachi_lemma, sudachi_norm):
            if extra_form:
                candidates.append((extra_form, [], []))
                for dec_cand in deinflect_candidates(extra_form):
                    if dec_cand not in candidates:
                        candidates.append(dec_cand)

        # Если глагольная форма начинается с 化 + форма する (например, 化して来てる или 化した),
        # добавляем кандидаты 化する и 化す, как это делает Rikaikun
        if surface.startswith("化") and len(surface) > 1:
            tail = surface[1:]
            if tail.startswith(SURU_SURFACE_PREFIXES):
                chain_hint = ["длительный вид (-teru)"] if ("てる" in tail or "ている" in tail) else ["деепричастие (-te)"]
                candidates.insert(0, ("化する", chain_hint, []))
                candidates.insert(1, ("化す", chain_hint, []))

        if reading_hira:
            candidates.append((reading_hira, [], []))

        resolved_lemma, resolved_chain, matched_senses = self._query_exact_terms(candidates)

        # Если это составной глагол с補助動詞 (например, して来てる / 化して来てる),
        # дополнительно подтягиваем статью для основного глагола в хвосте (来る / くる), если она не попала
        if ("来てる" in surface or "きてる" in surface or "来ている" in surface) and len(matched_senses) < 5:
            _, _, kuru_senses = self._query_exact_terms([("来る", [], []), ("くる", [], [])])
            for ks in kuru_senses[:2]:
                if all(ks.kanji != m.kanji or ks.source != m.source for m in matched_senses):
                    matched_senses.append(ks)

        # Если точного совпадения для составного слова нет (например, 暴力的 или 悪魔化) —
        # включаем декомпозицию корня и суффикса в стиле Rikaikun!
        if not matched_senses and len(surface) >= 2:
            decomp_chain, decomp_senses = self._decompose_subwords_and_suffixes(surface, sudachi_lemma)
            if decomp_senses:
                matched_senses = decomp_senses
                if decomp_chain and not resolved_chain:
                    resolved_chain = decomp_chain

        return resolved_lemma or sudachi_lemma or surface, resolved_chain, matched_senses

    # ---- Пост-обработка: отделение глагольного суффикса 化 перед して и склейка союзов ----

    def _split_verbalized_ka_before_suru(self, raw_spans: List[TokenSpanOut]) -> List[TokenSpanOut]:
        """
        Исправляет классический случай манги вроде 『悪魔化して来てる』:
        Если анализатор склеил [Сущ + 化] (напр. 悪魔化) в один токен, а сразу за ним идёт
        глагольная связка с する (напр. して来てる / した / する), и при этом само слово 『悪魔化』
        не является отдельным словарным словом или термином глоссария —
        разделяет его на:
          1) 『悪魔』 (Существительное)
          2) 『化して来てる』 (Глагол: лемма 化する / 化す + 来る)
        В точности как это делает Rikaikun / Yomitan!
        """
        if len(raw_spans) < 2:
            return raw_spans

        out: List[TokenSpanOut] = []
        i = 0
        n = len(raw_spans)

        while i < n:
            cur = raw_spans[i]
            if (
                i + 1 < n
                and cur.glossary_match is None
                and len(cur.surface) >= 3
                and cur.surface.endswith("化")
                and raw_spans[i + 1].glossary_match is None
                and raw_spans[i + 1].surface.startswith(SURU_SURFACE_PREFIXES)
            ):
                # Проверяем, есть ли точное словарное вхождение для X化 целиком
                exact_cands = [(cur.surface, [], [])]
                _, _, exact_senses = self._query_exact_terms(exact_cands)

                if not exact_senses:
                    noun_surf = cur.surface[:-1]
                    verb_surf = "化" + raw_spans[i + 1].surface

                    noun_reading = cur.reading[:-1] if cur.reading.endswith("か") else ""
                    verb_reading = "か" + (raw_spans[i + 1].reading or kata_to_hira(raw_spans[i + 1].surface))

                    n_lemma, n_chain, n_senses = self.lookup_sql_cascade(
                        surface=noun_surf,
                        sudachi_lemma=noun_surf,
                        sudachi_norm=noun_surf,
                        reading_hira=noun_reading,
                    )
                    v_lemma, v_chain, v_senses = self.lookup_sql_cascade(
                        surface=verb_surf,
                        sudachi_lemma="化する",
                        sudachi_norm="化する",
                        reading_hira=verb_reading,
                    )

                    out.append(
                        TokenSpanOut(
                            surface=noun_surf,
                            lemma=n_lemma,
                            reading=n_senses[0].reading if n_senses else noun_reading,
                            pos_ru="Существительное",
                            inflection_chain=n_chain,
                            is_punct_or_particle=False,
                            ner_label=cur.ner_label,
                            dict_entries=n_senses,
                        )
                    )
                    out.append(
                        TokenSpanOut(
                            surface=verb_surf,
                            lemma=v_lemma,
                            reading=verb_reading,
                            pos_ru="Глагол (суру)",
                            inflection_chain=v_chain or raw_spans[i + 1].inflection_chain,
                            is_punct_or_particle=False,
                            dict_entries=v_senses,
                        )
                    )
                    i += 2
                    continue

            out.append(cur)
            i += 1

        return out

    def _coalesce_compound_spans(self, raw_spans: List[TokenSpanOut]) -> List[TokenSpanOut]:
        """
        1) Отделяет глагольный суффикс 化 от существительного, если следом идёт して/する (『悪魔』 + 『化して来てる』).
        2) Объединяет соседние короткие морфемы, если вместе они образуют составной союз
           или устойчивое выражение манги (например, で + も -> でも, だ + から -> だから,
           か + も + しれ + ない -> かもしれない).
        """
        raw_spans = self._split_verbalized_ka_before_suru(raw_spans)
        if len(raw_spans) <= 1:
            return raw_spans

        result: List[TokenSpanOut] = []
        i = 0
        n = len(raw_spans)

        while i < n:
            merged_done = False
            # Проверяем окно от 4 до 2 соседних токенов
            for window in (4, 3, 2):
                if i + window > n:
                    continue
                slice_spans = raw_spans[i:i + window]
                if any(s.glossary_match is not None for s in slice_spans):
                    continue

                combined_surf = "".join(s.surface for s in slice_spans)
                combined_hira = kata_to_hira(combined_surf)

                if combined_surf in COMPOUND_EXPRESSIONS_SET or combined_hira in COMPOUND_EXPRESSIONS_SET:
                    combined_reading = "".join(s.reading or kata_to_hira(s.surface) for s in slice_spans)
                    lemma, chain, senses = self.lookup_sql_cascade(
                        surface=combined_surf,
                        sudachi_lemma=combined_surf,
                        sudachi_norm=combined_hira,
                        reading_hira=combined_reading,
                    )
                    result.append(
                        TokenSpanOut(
                            surface=combined_surf,
                            lemma=lemma,
                            reading=combined_reading,
                            pos_ru="Союз / Выражение",
                            inflection_chain=chain,
                            is_punct_or_particle=False,
                            dict_entries=senses,
                        )
                    )
                    i += window
                    merged_done = True
                    break

            if not merged_done:
                result.append(raw_spans[i])
                i += 1

        return result

    # ---- Токенизация и склейка предикатов (GiNZA / SudachiPy / Fallback) ----

    def _tokenize_with_sudachi(self, segment: str) -> List[TokenSpanOut]:
        if self._sudachi_tokenizer is None:
            return self._tokenize_fallback_regex(segment)

        with self._nlp_lock:
            morphemes = list(self._sudachi_tokenizer.tokenize(segment, self._sudachi_split_mode))

        spans: List[TokenSpanOut] = []
        i = 0
        n = len(morphemes)

        while i < n:
            m = morphemes[i]
            pos_tuple = m.part_of_speech()
            pos_major = pos_tuple[0] if len(pos_tuple) > 0 else ""
            pos_sub = pos_tuple[1] if len(pos_tuple) > 1 else ""
            pos_detail = pos_tuple[2] if len(pos_tuple) > 2 else ""

            surface = m.surface()
            base_lemma = m.dictionary_form() or surface
            norm_form = m.normalized_form() or base_lemma
            reading_kata = m.reading_form() or ""

            ner_label = None
            if pos_sub == "固有名詞":
                if pos_detail == "人名":
                    ner_label = "PERSON"
                elif pos_detail in ("地名", "国"):
                    ner_label = "LOC"
                else:
                    ner_label = "PROPN"

            # Если морфема — суффикс 化, а сразу за ней идёт глагол する (して, した и т.д.),
            # превращаем её в начало глагольного предиката 化する!
            is_ka_before_suru = (
                surface == "化"
                and i + 1 < n
                and (morphemes[i + 1].dictionary_form() in ("する", "為る") or morphemes[i + 1].surface().startswith(SURU_SURFACE_PREFIXES))
            )
            if is_ka_before_suru:
                pos_major = "動詞"
                base_lemma = "化する"
                norm_form = "化する"

            if pos_major in ("動詞", "形容詞"):
                j = i + 1
                while j < n:
                    next_m = morphemes[j]
                    next_pos_tuple = next_m.part_of_speech()
                    next_pos = next_pos_tuple[0] if len(next_pos_tuple) > 0 else ""
                    next_sub = next_pos_tuple[1] if len(next_pos_tuple) > 1 else ""
                    next_surf = next_m.surface()
                    next_dict = next_m.dictionary_form() or next_surf
                    next_norm = next_m.normalized_form() or next_dict

                    is_aux = next_pos == "助動詞"
                    is_conj_particle = next_pos == "助詞" and next_sub == "接続助詞" and next_surf in (
                        "て", "で", "ちゃ", "じゃ", "ば", "たら", "ても", "なきゃ", "なくちゃ"
                    )
                    is_colloquial_aux_verb = next_pos == "動詞" and (
                        next_dict in COLLOQUIAL_AUX_VERB_LEMMAS
                        or next_norm in COLLOQUIAL_AUX_VERB_LEMMAS
                        or next_sub == "非自立可能"
                        or (is_ka_before_suru and j == i + 1)
                    )
                    is_neg_adj = next_pos == "形容詞" and next_dict in ("ない", "ねえ")

                    if is_aux or is_conj_particle or is_colloquial_aux_verb or is_neg_adj:
                        surface += next_surf
                        reading_kata += next_m.reading_form() or ""
                        j += 1
                    else:
                        break
                i = j
            else:
                i += 1

            reading_hira = kata_to_hira(reading_kata)
            pos_label = POS_MAP_RU.get(pos_sub) or POS_MAP_RU.get(pos_major, pos_major or "Слово")
            is_trivial = pos_major in ("補助記号", "記号", "空白") or (pos_major == "助詞" and len(surface) <= 1)

            if pos_major in ("補助記号", "記号", "空白"):
                spans.append(
                    TokenSpanOut(
                        surface=surface,
                        lemma=surface,
                        reading="",
                        pos_ru="Пунктуация",
                        is_punct_or_particle=True,
                    )
                )
            else:
                resolved_lemma, chain, senses = self.lookup_sql_cascade(
                    surface=surface,
                    sudachi_lemma=base_lemma,
                    sudachi_norm=norm_form,
                    reading_hira=reading_hira,
                )
                spans.append(
                    TokenSpanOut(
                        surface=surface,
                        lemma=resolved_lemma,
                        reading=reading_hira,
                        pos_ru=pos_label,
                        inflection_chain=chain,
                        is_punct_or_particle=(is_trivial and len(senses) == 0),
                        ner_label=ner_label,
                        dict_entries=senses,
                    )
                )

        return self._coalesce_compound_spans(spans)

    def _tokenize_with_spacy_ginza(self, nlp: Any, segment: str) -> List[TokenSpanOut]:
        # КРИТИЧЕСКИ ВАЖНО: сериализуем вызов nlp(segment), так как внутри spaCy JapaneseTokenizer
        # дергает Rust SudachiPy RefCell, который падает с RuntimeError: Already borrowed при параллельном вызове!
        with self._nlp_lock:
            doc = nlp(segment)

        spans: List[TokenSpanOut] = []
        i = 0
        n = len(doc)

        while i < n:
            tok = doc[i]
            tag_parts = (tok.tag_ or "").split("-")
            pos_major = tag_parts[0] if tag_parts else tok.pos_
            pos_sub = tag_parts[1] if len(tag_parts) > 1 else ""

            surface = tok.text
            base_lemma = tok.lemma_ or surface
            norm_form = tok.norm_ or base_lemma
            morph_reading = tok.morph.get("Reading")
            reading_kata = morph_reading[0] if morph_reading else ""
            ner_label = tok.ent_type_ or None

            is_ka_before_suru = (
                surface == "化"
                and i + 1 < n
                and (doc[i + 1].lemma_ in ("する", "為る") or doc[i + 1].text.startswith(SURU_SURFACE_PREFIXES))
            )
            if is_ka_before_suru:
                pos_major = "動詞"
                base_lemma = "化する"
                norm_form = "化する"

            if pos_major in ("動詞", "形容詞") or tok.pos_ in ("VERB", "ADJ"):
                j = i + 1
                while j < n:
                    next_tok = doc[j]
                    nt_parts = (next_tok.tag_ or "").split("-")
                    nt_major = nt_parts[0] if nt_parts else next_tok.pos_
                    nt_sub = nt_parts[1] if len(nt_parts) > 1 else ""
                    nt_surf = next_tok.text
                    nt_lemma = next_tok.lemma_ or nt_surf
                    nt_norm = next_tok.norm_ or nt_lemma

                    is_aux = nt_major == "助動詞" or next_tok.pos_ == "AUX"
                    is_conj_particle = (nt_major == "助詞" or next_tok.pos_ == "SCONJ" or next_tok.pos_ == "PART") and nt_surf in (
                        "て", "で", "ちゃ", "じゃ", "ば", "たら", "ても", "なきゃ", "なくちゃ"
                    )
                    is_colloquial_aux = (nt_major == "動詞" or next_tok.pos_ in ("VERB", "AUX")) and (
                        nt_lemma in COLLOQUIAL_AUX_VERB_LEMMAS
                        or nt_norm in COLLOQUIAL_AUX_VERB_LEMMAS
                        or nt_sub == "非自立可能"
                        or (is_ka_before_suru and j == i + 1)
                    )
                    is_neg_adj = (nt_major == "形容詞" or next_tok.pos_ == "ADJ") and nt_lemma in ("ない", "ねえ")

                    if is_aux or is_conj_particle or is_colloquial_aux or is_neg_adj:
                        surface += nt_surf
                        nr = next_tok.morph.get("Reading")
                        if nr:
                            reading_kata += nr[0]
                        j += 1
                    else:
                        break
                i = j
            else:
                i += 1

            reading_hira = kata_to_hira(reading_kata)
            pos_label = POS_MAP_RU.get(pos_sub) or POS_MAP_RU.get(pos_major, pos_major or "Слово")
            is_punct = pos_major in ("補助記号", "記号") or tok.pos_ == "PUNCT"

            if is_punct:
                spans.append(
                    TokenSpanOut(
                        surface=surface,
                        lemma=surface,
                        reading="",
                        pos_ru="Пунктуация",
                        is_punct_or_particle=True,
                    )
                )
            else:
                resolved_lemma, chain, senses = self.lookup_sql_cascade(
                    surface=surface,
                    sudachi_lemma=base_lemma,
                    sudachi_norm=norm_form,
                    reading_hira=reading_hira,
                )
                spans.append(
                    TokenSpanOut(
                        surface=surface,
                        lemma=resolved_lemma,
                        reading=reading_hira,
                        pos_ru=pos_label,
                        inflection_chain=chain,
                        is_punct_or_particle=(pos_major == "助詞" and len(surface) <= 1 and len(senses) == 0),
                        ner_label=ner_label,
                        dict_entries=senses,
                    )
                )

        return self._coalesce_compound_spans(spans)

    def _tokenize_fallback_regex(self, segment: str) -> List[TokenSpanOut]:
        """
        Умный фоллбэк-токенизатор (если SudachiPy/GiNZA ещё не установлены):
        - отделяет японские падежные/конечные частицы от кандзи;
        - проверяет суффикс кандзи + окуригану по словарю (чтобы в 悪魔化して отделить 悪魔 от 化して,
          как это делает Rikaikun).
        """
        raw_chunks = re.findall(r"[一-龥々〆ヵヶ]+[ぁ-ん]*|[ァ-ヴー]+|[ぁ-ん]+|[^\s]", segment)
        PARTICLES = {
            "の", "が", "は", "を", "に", "へ", "と", "で", "も", "か", "や",
            "よ", "ね", "わ", "ぞ", "ぜ", "な", "さ",
        }
        spans: List[TokenSpanOut] = []

        for ch in raw_chunks:
            if re.match(r"^[、。！？…・「」『』（）()!?,.\s]+$", ch):
                spans.append(
                    TokenSpanOut(
                        surface=ch,
                        lemma=ch,
                        reading="",
                        pos_ru="Пунктуация",
                        is_punct_or_particle=True,
                    )
                )
                continue

            m_kanji_hira = re.match(r"^([一-龥々〆ヵヶ]+)([ぁ-ん]+)$", ch)
            if m_kanji_hira:
                kanji_part, hira_tail = m_kanji_hira.group(1), m_kanji_hira.group(2)
                full_cands = deinflect_candidates(ch)
                full_lemma, full_chain, full_senses = self._query_exact_terms(full_cands)
                if full_senses:
                    spans.append(
                        TokenSpanOut(
                            surface=ch,
                            lemma=full_lemma or ch,
                            reading=full_senses[0].reading if full_senses else "",
                            pos_ru="Глагол / Прил." if full_chain else "Слово",
                            inflection_chain=full_chain,
                            dict_entries=full_senses,
                        )
                    )
                    continue

                # Проверяем, не образует ли хвост кандзи + хирагана отдельный глагол
                # (например, в 悪魔化して: 悪魔 + 化して -> 化する / 化す)
                split_found = False
                if len(kanji_part) >= 2:
                    for split_idx in range(1, len(kanji_part)):
                        left_kanji = kanji_part[:split_idx]
                        right_verb_surf = kanji_part[split_idx:] + hira_tail
                        rv_cands = deinflect_candidates(right_verb_surf)
                        if right_verb_surf.startswith("化") and hira_tail.startswith(SURU_SURFACE_PREFIXES):
                            rv_cands.insert(0, ("化する", ["деепричастие (-te)"], []))
                            rv_cands.insert(1, ("化す", ["деепричастие (-te)"], []))
                        rv_lemma, rv_chain, rv_senses = self._query_exact_terms(rv_cands)
                        if rv_senses and (rv_chain or hira_tail.startswith(SURU_SURFACE_PREFIXES)):
                            lk_lemma, lk_chain, lk_senses = self.lookup_sql_cascade(
                                surface=left_kanji,
                                sudachi_lemma=left_kanji,
                                sudachi_norm=left_kanji,
                            )
                            spans.append(
                                TokenSpanOut(
                                    surface=left_kanji,
                                    lemma=lk_lemma,
                                    reading=lk_senses[0].reading if lk_senses else "",
                                    pos_ru="Существительное",
                                    inflection_chain=lk_chain,
                                    dict_entries=lk_senses,
                                )
                            )
                            spans.append(
                                TokenSpanOut(
                                    surface=right_verb_surf,
                                    lemma=rv_lemma or right_verb_surf,
                                    reading=rv_senses[0].reading if rv_senses else "",
                                    pos_ru="Глагол",
                                    inflection_chain=rv_chain,
                                    dict_entries=rv_senses,
                                )
                            )
                            split_found = True
                            break

                if split_found:
                    continue

                k_lemma, k_chain, k_senses = self.lookup_sql_cascade(
                    surface=kanji_part,
                    sudachi_lemma=kanji_part,
                    sudachi_norm=kanji_part,
                )
                spans.append(
                    TokenSpanOut(
                        surface=kanji_part,
                        lemma=k_lemma,
                        reading=k_senses[0].reading if k_senses else "",
                        pos_ru="Существительное",
                        inflection_chain=k_chain,
                        dict_entries=k_senses,
                    )
                )
                spans.extend(self._tokenize_fallback_regex(hira_tail))
                continue

            if re.match(r"^[ぁ-ん]+$", ch) and ch in PARTICLES:
                spans.append(
                    TokenSpanOut(
                        surface=ch,
                        lemma=ch,
                        reading=ch,
                        pos_ru="Частица",
                        is_punct_or_particle=True,
                    )
                )
                continue

            reading_hira = kata_to_hira(ch) if re.match(r"^[ァ-ヴーぁ-ん]+$", ch) else ""
            resolved_lemma, chain, senses = self.lookup_sql_cascade(
                surface=ch,
                sudachi_lemma=ch,
                sudachi_norm=ch,
                reading_hira=reading_hira,
            )
            spans.append(
                TokenSpanOut(
                    surface=ch,
                    lemma=resolved_lemma,
                    reading=senses[0].reading if senses else reading_hira,
                    pos_ru="Слово",
                    inflection_chain=chain,
                    dict_entries=senses,
                )
            )
        return self._coalesce_compound_spans(spans)

    def _tokenize_segment(self, segment: str, nlp_mode: str = "auto") -> List[TokenSpanOut]:
        if not segment:
            return []

        if nlp_mode in ("bert_large", "electra"):
            nlp = self._get_spacy_ginza(nlp_mode)
            if nlp is not None:
                return self._tokenize_with_spacy_ginza(nlp, segment)

        if nlp_mode == "auto" and self._spacy_nlp_map:
            # Если модель GiNZA уже загружена в память — используем её в режиме Auto
            first_loaded = next(iter(self._spacy_nlp_map.values()))
            return self._tokenize_with_spacy_ginza(first_loaded, segment)

        if self._init_sudachi():
            return self._tokenize_with_sudachi(segment)

        nlp = self._get_spacy_ginza("auto")
        if nlp is not None:
            return self._tokenize_with_spacy_ginza(nlp, segment)

        return self._tokenize_fallback_regex(segment)

    def analyze_bubble(
        self,
        text: str,
        title_id: Optional[int] = None,
        nlp_mode: str = "auto",
    ) -> List[Dict[str, Any]]:
        """Полный разбор текста бабла с приоритетным выделением терминов глоссария тайтла."""
        if not text:
            return []

        glossary_intervals = self.find_glossary_intervals(text, title_id)
        final_tokens: List[TokenSpanOut] = []
        cursor = 0

        for start, end, g_hit in glossary_intervals:
            if start > cursor:
                final_tokens.extend(self._tokenize_segment(text[cursor:start], nlp_mode=nlp_mode))

            _, _, dict_senses = self.lookup_sql_cascade(
                surface=g_hit.jap_word,
                sudachi_lemma=g_hit.jap_word,
                sudachi_norm=g_hit.jap_word,
                reading_hira=kata_to_hira(g_hit.jap_word),
            )
            final_tokens.append(
                TokenSpanOut(
                    surface=text[start:end],
                    lemma=g_hit.jap_word,
                    reading=kata_to_hira(g_hit.jap_word) if g_hit.jap_word != kata_to_hira(g_hit.jap_word) else "",
                    pos_ru="Глоссарий тайтла",
                    glossary_match=g_hit,
                    dict_entries=dict_senses,
                )
            )
            cursor = end

        if cursor < len(text):
            final_tokens.extend(self._tokenize_segment(text[cursor:], nlp_mode=nlp_mode))

        return [t.to_dict() for t in final_tokens]


# Глобальный синглтон движка словаря
dict_engine = MangaDictionaryEngine()