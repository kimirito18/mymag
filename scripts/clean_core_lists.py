#!/usr/bin/env python3
"""Create compact, deduplicated CSVs from converted/core_lists."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


SOURCE_DIR = Path("converted/core_lists")
OUTPUT_DIR = Path("converted/cleaned")
MEDIAARTS_ID_PREFIX = "https://mediaarts-db.bunka.go.jp/id/"

PUBLISHER_ID = re.compile(r"^P\d+$", re.IGNORECASE)
SPACE = re.compile(r"\s+")
ROLE_PREFIX = re.compile(r"^\[([^\]]+)\](.+)$")
READING_SPLIT = re.compile(r"[|,，、／/]+")
AUTHOR_ID = re.compile(r"https://mediaarts-db\.bunka\.go\.jp/id/(C\d+)")
ROLE_NAME = re.compile(r"\[([^\]]+)\]\s*([^,\|]+)")
NAME_SPLIT = re.compile(r"[,，、／/|]+")
PARENS = re.compile(r"[（(][^（）()]*[）)]")


def norm(value: str) -> str:
    return SPACE.sub("", value.replace("　", "").replace("，", "").replace(",", "")).lower()


def display(value: str) -> str:
    return SPACE.sub(" ", value.replace("　", " ")).strip()


def compact_madb_id(value: str) -> str:
    value = value.strip()
    if value.startswith(MEDIAARTS_ID_PREFIX):
        return value.rsplit("/", 1)[-1]
    return value


def katakana_to_hiragana(value: str) -> str:
    chars = []
    for char in value:
        code = ord(char)
        if 0x30A1 <= code <= 0x30F6:
            chars.append(chr(code - 0x60))
        else:
            chars.append(char)
    return "".join(chars)


def clean_reading(value: str) -> str:
    cleaned = []
    for part in READING_SPLIT.split(katakana_to_hiragana(value)):
        chars = []
        for char in part:
            if "\u3041" <= char <= "\u3096" or char in "ーゝゞ":
                chars.append(char)
        text = "".join(chars).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return "".join(cleaned)


def clean_repeated_name(value: str) -> str:
    value = display(value)
    parts = [display(part) for part in NAME_SPLIT.split(value) if display(part)]
    if len(parts) > 1 and len({norm(part) for part in parts}) == 1:
        return parts[0]
    return value


def clean_publication_frequency(value: str) -> str:
    value = PARENS.sub("", value)
    parts = []
    for raw in re.split(r"[／/]+|　+|\\s+", value):
        text = display(raw)
        if text and text not in parts:
            parts.append(text)
    return json.dumps(parts, ensure_ascii=False) if parts else ""


def split_multi(value: str) -> list[str]:
    return [part.strip() for part in value.split("|") if part.strip()]


def join_sorted(values: Iterable[str]) -> str:
    return " | ".join(sorted(v for v in set(values) if v))


def split_reading(value: str) -> tuple[str, str]:
    if "∥" not in value:
        return value.strip(), ""
    name, reading = value.split("∥", 1)
    return name.strip(), reading.strip()


def choose_longest(values: Iterable[str]) -> str:
    clean = [v for v in set(values) if v]
    if not clean:
        return ""
    return sorted(clean, key=lambda v: (len(v), v), reverse=True)[0]


def choose_shortest_name(values: Iterable[str]) -> str:
    clean = [v for v in set(values) if v and not v.startswith(MEDIAARTS_ID_PREFIX)]
    if not clean:
        return ""
    return sorted(clean, key=lambda v: (len(v), v))[0]


def read_csv(path: Path):
    with path.open(encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle)


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, str]]) -> int:
    count = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})
            count += 1
    return count


def build_publisher_code_map() -> dict[str, tuple[str, str]]:
    """Map P-codes to the most common publisher name/readings seen on the same row."""
    votes: dict[str, Counter[tuple[str, str]]] = defaultdict(Counter)
    for filename in ("books.csv", "magazines.csv", "magazine_titles.csv"):
        path = SOURCE_DIR / filename
        if not path.exists():
            continue
        for row in read_csv(path):
            code = display(row.get("publisher", ""))
            name = display(row.get("publisher_name", ""))
            reading = display(row.get("publisher_reading", ""))
            if PUBLISHER_ID.fullmatch(code) and name and not PUBLISHER_ID.fullmatch(name):
                votes[code.upper()][(name, reading)] += 1
    return {code: counter.most_common(1)[0][0] for code, counter in votes.items()}


def build_publisher_name_code_map() -> dict[str, str]:
    votes: dict[str, Counter[str]] = defaultdict(Counter)
    for filename in ("books.csv", "magazines.csv", "magazine_titles.csv"):
        path = SOURCE_DIR / filename
        if not path.exists():
            continue
        for row in read_csv(path):
            code = display(row.get("publisher", ""))
            name = clean_repeated_name(display(row.get("publisher_name", "")))
            if PUBLISHER_ID.fullmatch(code) and name:
                votes[norm(name)][code.upper()] += 1
    return {name_key: counter.most_common(1)[0][0] for name_key, counter in votes.items()}


def clean_people(value: str, reading_value: str = "") -> tuple[str, str, str]:
    names: dict[str, str] = {}
    readings = set(split_multi(reading_value))
    roles = set()
    for part in split_multi(value):
        if part.startswith(MEDIAARTS_ID_PREFIX):
            continue
        match = ROLE_PREFIX.match(part)
        if match:
            roles.add(match.group(1).strip())
            part = match.group(2).strip()
        name, reading = split_reading(part)
        if reading:
            readings.add(reading)
        key = norm(name)
        if key:
            names.setdefault(key, display(name))
    return join_sorted(names.values()), join_sorted(readings), join_sorted(roles)


def unique_ordered(values: Iterable[str]) -> list[str]:
    seen = set()
    ordered = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def parse_book_authors(value: str) -> tuple[str, str]:
    ids = unique_ordered(AUTHOR_ID.findall(value))
    role_names = [(role.strip(), display(name)) for role, name in ROLE_NAME.findall(value)]

    authors = []
    for role, name in role_names:
        if name and not name.startswith(MEDIAARTS_ID_PREFIX):
            authors.append(f"{role}: {name}")

    if not authors:
        authors_text, _, _ = clean_people(value)
        authors = split_multi(authors_text)

    role_ids: dict[str, list[str]] = defaultdict(list)
    if ids and len(ids) == len(role_names):
        for author_id, (role, _) in zip(ids, role_names):
            role_ids[role].append(author_id)
    elif len(ids) == 1 and role_names:
        for role, _ in role_names:
            role_ids[role].append(ids[0])
    elif ids:
        role_ids["著者"].extend(ids)

    normalized_role_ids = {
        role: unique_ordered(author_ids) for role, author_ids in role_ids.items() if author_ids
    }
    author_ids_json = (
        json.dumps(normalized_role_ids, ensure_ascii=False, sort_keys=True)
        if normalized_role_ids
        else ""
    )
    return join_sorted(authors), author_ids_json


def clean_publisher_cell(row: dict[str, str], code_map: dict[str, tuple[str, str]]) -> tuple[str, str, str]:
    code = display(row.get("publisher", ""))
    name = display(row.get("publisher_name", ""))
    reading = display(row.get("publisher_reading", ""))
    schema = display(row.get("schema_publisher", ""))

    if PUBLISHER_ID.fullmatch(code):
        mapped = code_map.get(code.upper())
        if mapped:
            name = name or mapped[0]
            reading = reading or mapped[1]
        return code.upper(), name, reading

    if not name and schema:
        name, schema_reading = split_reading(schema)
        reading = reading or schema_reading
    if not name and code and not PUBLISHER_ID.fullmatch(code):
        name, code_reading = split_reading(code)
        reading = reading or code_reading
        code = ""
    return code.upper() if PUBLISHER_ID.fullmatch(code) else "", name, reading


def parse_publisher_parts(value: str) -> list[tuple[str, str]]:
    parts = []
    for raw in NAME_SPLIT.split(value):
        text = display(raw)
        if not text:
            continue
        role = "発行"
        match = ROLE_PREFIX.match(text)
        if match:
            role = match.group(1).strip()
            text = display(match.group(2))
        name, _ = split_reading(text)
        name = clean_repeated_name(name)
        if name:
            parts.append((role, name))
    return parts


def clean_book_publishers(
    row: dict[str, str],
    code_map: dict[str, tuple[str, str]],
    name_code_map: dict[str, str],
) -> tuple[str, str]:
    publisher_id, publisher_name, _ = clean_publisher_cell(row, code_map)
    parts = parse_publisher_parts(row.get("publisher", ""))
    if not parts and publisher_name:
        parts = [("発行", publisher_name)]

    role_names: dict[str, list[str]] = defaultdict(list)
    for role, name in parts:
        if norm(name) not in {norm(existing) for existing in role_names[role]}:
            role_names[role].append(name)

    role_ids: dict[str, list[str]] = defaultdict(list)
    fallback_names = []
    for role, names in role_names.items():
        for name in names:
            code = name_code_map.get(norm(name))
            if code and code not in role_ids[role]:
                role_ids[role].append(code)
            else:
                fallback_names.append(f"{role}: {name}" if role != "発行" else name)

    if publisher_id and not role_ids and publisher_id not in role_ids["発行"]:
        role_ids["発行"].append(publisher_id)

    id_to_roles: dict[str, list[str]] = defaultdict(list)
    for role, publisher_ids in role_ids.items():
        for publisher_id in publisher_ids:
            id_to_roles[publisher_id].append(role)
    for publisher_id, roles in id_to_roles.items():
        if "発行" in roles and len(roles) > 1:
            for role in roles:
                if role != "発行" and publisher_id in role_ids[role]:
                    role_ids[role].remove(publisher_id)
    role_ids = defaultdict(
        list, {role: publisher_ids for role, publisher_ids in role_ids.items() if publisher_ids}
    )

    publisher_ids_json = (
        json.dumps(dict(role_ids), ensure_ascii=False, sort_keys=True) if role_ids else ""
    )
    normalized_by_name: dict[str, tuple[str, str]] = {}
    for role, names in role_names.items():
        for name in names:
            key = norm(name)
            if key not in normalized_by_name or normalized_by_name[key][0] != "発行":
                normalized_by_name[key] = (role, name)
            if role == "発行":
                normalized_by_name[key] = (role, name)
    publisher_names = []
    for role, name in normalized_by_name.values():
        text = f"{role}: {name}" if role != "発行" else name
        if text not in publisher_names:
            publisher_names.append(text)
    if not publisher_names and publisher_name:
        publisher_names.append(clean_repeated_name(publisher_name))
    return " | ".join(publisher_names), publisher_ids_json


def clean_publishers(code_map: dict[str, tuple[str, str]]) -> list[dict[str, str]]:
    grouped: dict[str, dict[str, object]] = {}
    for row in read_csv(SOURCE_DIR / "publishers.csv"):
        name = display(row["publisher_name"])
        reading = display(row["publisher_reading"])
        ids = split_multi(row["publisher_ids"])

        if PUBLISHER_ID.fullmatch(name):
            mapped = code_map.get(name.upper())
            if mapped:
                ids.append(name.upper())
                name, reading = mapped[0], reading or mapped[1]

        key = norm(name)
        if not key:
            continue

        item = grouped.setdefault(
            key,
            {
                "publisher_name": [],
                "publisher_reading": [],
                "publisher_ids": set(),
                "fields": set(),
                "genres": set(),
                "source_count": 0,
                "sample_node_id": row["sample_node_id"],
                "address": [],
                "country_of_origin": [],
                "url": [],
                "related_link": [],
                "start_date": [],
                "end_date": [],
                "description": [],
            },
        )
        item["publisher_name"].append(name)
        item["publisher_reading"].append(reading)
        item["publisher_ids"].update(ids)
        item["fields"].update(split_multi(row["fields"]))
        item["genres"].update(split_multi(row["genres"]))
        item["source_count"] += int(row["source_count"] or 0)
        for field in ("address", "country_of_origin", "url", "related_link", "start_date", "end_date", "description"):
            if row[field]:
                item[field].append(row[field])

    rows = []
    for key, item in grouped.items():
        publisher_ids = sorted(
            publisher_id
            for publisher_id in item["publisher_ids"]
            if PUBLISHER_ID.fullmatch(publisher_id)
        )
        if not publisher_ids:
            continue
        publisher_name = clean_repeated_name(choose_shortest_name(item["publisher_name"]))
        if not publisher_name or PUBLISHER_ID.fullmatch(publisher_name):
            continue
        rows.append(
            {
                "publisher_name": publisher_name,
                "publisher_reading": clean_reading(choose_longest(item["publisher_reading"])),
                "publisher_id": publisher_ids[0],
                "address": choose_longest(item["address"]),
                "url": choose_longest(item["url"]),
                "related_link": choose_longest(item["related_link"]),
                "start_date": choose_longest(item["start_date"]),
                "end_date": choose_longest(item["end_date"]),
                "description": choose_longest(item["description"]),
            }
        )
    return sorted(rows, key=lambda row: row["publisher_id"])


def clean_authors() -> list[dict[str, str]]:
    grouped: dict[str, dict[str, object]] = {}
    for row in read_csv(SOURCE_DIR / "authors.csv"):
        ids = split_multi(row["author_ids"])
        if not ids:
            continue
        for author_id in ids:
            key = compact_madb_id(author_id)
            if not key:
                continue
            item = grouped.setdefault(
                key,
                {
                    "author_name": [],
                    "author_reading": [],
                },
            )
            item["author_name"].append(display(row["author_name"]))
            item["author_reading"].append(display(row["author_reading"]))

    rows = []
    for key, item in grouped.items():
        author_name = choose_shortest_name(item["author_name"])
        if not author_name:
            continue
        rows.append(
            {
                "author_id": key,
                "author_name": author_name,
                "author_reading": clean_reading(choose_longest(item["author_reading"])),
            }
        )
    return sorted(rows, key=lambda row: row["author_id"])


def build_author_name_id_map() -> dict[str, str]:
    candidates: dict[str, set[str]] = defaultdict(set)
    for row in clean_authors():
        candidates[norm(row["author_name"])].add(row["author_id"])
    return {
        name_key: next(iter(author_ids))
        for name_key, author_ids in candidates.items()
        if len(author_ids) == 1
    }


def fill_book_author_ids_from_names(authors: str) -> str:
    role_ids: dict[str, list[str]] = defaultdict(list)
    for part in split_multi(authors):
        if ":" in part:
            role, name = part.split(":", 1)
            role = role.strip() or "著者"
            name = name.strip()
        else:
            role = "著者"
            name = part.strip()
        author_id = AUTHOR_NAME_ID_MAP.get(norm(name))
        if author_id and author_id not in role_ids[role]:
            role_ids[role].append(author_id)
    return json.dumps(dict(role_ids), ensure_ascii=False, sort_keys=True) if role_ids else ""


AUTHOR_NAME_ID_MAP: dict[str, str] = {}


def clean_books(
    code_map: dict[str, tuple[str, str]], name_code_map: dict[str, str]
) -> Iterable[dict[str, str]]:
    seen = set()
    for row in read_csv(SOURCE_DIR / "books.csv"):
        if row["genre"] != "単行本" or row["id"] in seen:
            continue
        seen.add(row["id"])
        publisher_name, publisher_ids = clean_book_publishers(row, code_map, name_code_map)
        author_names, author_ids = parse_book_authors(row["author"])
        if not author_ids:
            author_ids = fill_book_author_ids_from_names(author_names)
        yield {
            "book_id": compact_madb_id(row["id"]),
            "title": row["label"] or row["name"],
            "title_reading": clean_reading(row["name_reading"]),
            "publisher_ids": publisher_ids,
            "publisher_name": clean_repeated_name(publisher_name),
            "authors": author_names,
            "author_ids": author_ids,
            "brand": row["brand"],
            "brand_reading": clean_reading(row["brand_reading"]),
            "published_date": row["date_published"] or row["date_published_final"],
            "isbn": row["isbn"],
            "jpno": row["jpno"],
            "ndc": row["ndc"],
            "volume_number": row["volume_number"],
            "number_of_pages": row["number_of_pages"],
            "number_of_items": row["number_of_items"],
            "price": row["price"],
            "size": row["size"],
            "series_or_parent_id": compact_madb_id(row["is_part_of"]),
            "description": row["description"],
            "note": row["note"],
        }


def clean_magazine_titles(
    code_map: dict[str, tuple[str, str]], name_code_map: dict[str, str]
) -> Iterable[dict[str, str]]:
    seen = set()
    for row in read_csv(SOURCE_DIR / "magazine_titles.csv"):
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        publisher_name, publisher_ids = clean_book_publishers(row, code_map, name_code_map)
        yield {
            "magazine_id": compact_madb_id(row["id"]),
            "title": row["label"] or row["name"],
            "title_reading": clean_reading(row["name_reading"]),
            "publisher_ids": publisher_ids,
            "publisher_name": clean_repeated_name(publisher_name),
            "first_published_date": row["date_published"],
            "publication_frequency": clean_publication_frequency(row["publication_periodicity"]),
            "issn": row["issn"],
            "jpno": row["jpno"],
            "mtid": row["mtid"],
            "last_published_date": row["day_published_final"],
            "final_volume_number": row["volume_number_final"],
            "final_issue_number": row["issue_number_displayed_final"] or row["issue_number_published"],
            "total_volume_number_final": row["total_volume_number_final"],
            "description": row["description"],
            "note": row["note"],
        }


def clean_magazine_issues(
    code_map: dict[str, tuple[str, str]], name_code_map: dict[str, str]
) -> Iterable[dict[str, str]]:
    seen = set()
    for row in read_csv(SOURCE_DIR / "magazines.csv"):
        if row["genre"] != "雑誌巻号" or row["id"] in seen:
            continue
        seen.add(row["id"])
        publisher_name, publisher_ids = clean_book_publishers(row, code_map, name_code_map)
        yield {
            "issue_id": compact_madb_id(row["id"]),
            "magazine_title": row["name"] or row["label"],
            "magazine_title_reading": clean_reading(row["name_reading"]),
            "issue_label": row["label"],
            "publisher_ids": publisher_ids,
            "publisher_name": clean_repeated_name(publisher_name),
            "published_date": row["date_published"],
            "year": row["year_displayed"],
            "month": row["month_displayed"],
            "day": row["day_displayed"],
            "volume_number": row["volume_number"],
            "issue_number": row["issue_number"],
            "issue_number_displayed": row["issue_number_displayed"],
            "sub_issue_number": row["sub_issue_number"],
            "number_of_pages": row["number_of_pages"],
            "binding_or_mode": row["mode_issue"],
            "magazine_id": compact_madb_id(row["is_part_of"]),
            "note": row["note"],
        }


def main() -> int:
    global AUTHOR_NAME_ID_MAP
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    code_map = build_publisher_code_map()
    name_code_map = build_publisher_name_code_map()
    AUTHOR_NAME_ID_MAP = build_author_name_id_map()

    counts = {}
    counts["publishers_clean.csv"] = write_csv(
        OUTPUT_DIR / "publishers_clean.csv",
        [
            "publisher_id",
            "publisher_name",
            "publisher_reading",
            "address",
            "url",
            "related_link",
            "start_date",
            "end_date",
            "description",
        ],
        clean_publishers(code_map),
    )
    counts["authors_clean.csv"] = write_csv(
        OUTPUT_DIR / "authors_clean.csv",
        [
            "author_id",
            "author_name",
            "author_reading",
        ],
        clean_authors(),
    )
    counts["books_clean.csv"] = write_csv(
        OUTPUT_DIR / "books_clean.csv",
        [
            "book_id",
            "title",
            "title_reading",
            "publisher_ids",
            "publisher_name",
            "authors",
            "author_ids",
            "brand",
            "brand_reading",
            "published_date",
            "isbn",
            "jpno",
            "ndc",
            "volume_number",
            "number_of_pages",
            "number_of_items",
            "price",
            "size",
            "series_or_parent_id",
            "description",
            "note",
        ],
        clean_books(code_map, name_code_map),
    )
    counts["magazine_titles_clean.csv"] = write_csv(
        OUTPUT_DIR / "magazine_titles_clean.csv",
        [
            "magazine_id",
            "title",
            "title_reading",
            "publisher_ids",
            "publisher_name",
            "first_published_date",
            "publication_frequency",
            "issn",
            "jpno",
            "mtid",
            "last_published_date",
            "final_volume_number",
            "final_issue_number",
            "total_volume_number_final",
            "description",
            "note",
        ],
        clean_magazine_titles(code_map, name_code_map),
    )
    counts["magazine_issues_clean.csv"] = write_csv(
        OUTPUT_DIR / "magazine_issues_clean.csv",
        [
            "issue_id",
            "magazine_title",
            "magazine_title_reading",
            "issue_label",
            "publisher_ids",
            "publisher_name",
            "published_date",
            "year",
            "month",
            "day",
            "volume_number",
            "issue_number",
            "issue_number_displayed",
            "sub_issue_number",
            "number_of_pages",
            "binding_or_mode",
            "magazine_id",
            "note",
        ],
        clean_magazine_issues(code_map, name_code_map),
    )

    for filename, count in counts.items():
        print(f"{filename}\t{count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
