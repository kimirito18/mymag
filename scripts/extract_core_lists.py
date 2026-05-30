#!/usr/bin/env python3
"""Extract publisher, author, book, and magazine lists from MADB JSON-LD."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
ROLE_PREFIX = re.compile(r"^\s*\[([^\]]+)\]\s*")
SPACE = re.compile(r"\s+")
MEDIAARTS_ID_PREFIX = "https://mediaarts-db.bunka.go.jp/id/"

PUBLISHER_FIELDS = ("publisher", "schema:publisher", "dcterms:publisher", "ma:publisher")
AUTHOR_FIELDS = ("creator", "schema:creator", "ma:creator", "dcterms:creator")

COMMON_ITEM_FIELDS = [
    "id",
    "identifier",
    "rdf_type",
    "additional_type",
    "genre",
    "additional_genre",
    "label",
    "name",
    "name_reading",
    "alternate_name",
    "alternative_headline",
    "series_name",
    "series_name_reading",
    "publisher",
    "schema_publisher",
    "publisher_name",
    "publisher_reading",
    "author",
    "author_reading",
    "brand",
    "brand_reading",
    "brand_identifier",
    "date_published",
    "date_published_final",
    "location",
    "in_language",
    "keywords",
    "description",
    "note",
    "source",
    "source_file",
]

BOOK_FIELDS = COMMON_ITEM_FIELDS + [
    "isbn",
    "gtin",
    "jpno",
    "ndc",
    "volume_number",
    "total_volume_number",
    "number_of_pages",
    "number_of_items",
    "price",
    "size",
    "is_part_of",
    "related_collection",
    "related_item",
]

MAGAZINE_FIELDS = COMMON_ITEM_FIELDS + [
    "issn",
    "jpno",
    "ndc",
    "volume_number",
    "issue_number",
    "issue_number_displayed",
    "sub_issue_number",
    "year_displayed",
    "month_displayed",
    "day_displayed",
    "page_start",
    "page_end",
    "page_exclude",
    "position",
    "number_of_pages",
    "mode_issue",
    "is_part_of",
    "related_collection",
    "related_item",
]

MAGAZINE_TITLE_FIELDS = COMMON_ITEM_FIELDS + [
    "mtid",
    "issn",
    "jpno",
    "publication_periodicity",
    "volume_number_final",
    "issue_number_published",
    "issue_number_displayed_final",
    "day_published_final",
    "total_volume_number_final",
]

PUBLISHER_OUT_FIELDS = [
    "publisher_key",
    "publisher_name",
    "publisher_reading",
    "publisher_ids",
    "fields",
    "genres",
    "source_count",
    "sample_node_id",
    "address",
    "country_of_origin",
    "url",
    "related_link",
    "start_date",
    "end_date",
    "description",
]

AUTHOR_OUT_FIELDS = [
    "author_key",
    "author_name",
    "author_reading",
    "roles",
    "author_ids",
    "fields",
    "genres",
    "source_count",
    "sample_node_id",
]


def clean_json_text(text: str) -> str:
    return CONTROL_CHARS.sub(" ", text)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.loads(clean_json_text(handle.read()))


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        return scalar(value.get("@value") or value.get("@id") or "")
    if isinstance(value, list):
        return " | ".join(item for item in (scalar(v) for v in value) if item)
    return str(value)


def values(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, list):
        for item in value:
            yield from values(item)
        return
    if isinstance(value, dict):
        yield scalar(value)
        return
    yield scalar(value)


def entity_values(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, list):
        for item in value:
            yield from entity_values(item)
        return
    if isinstance(value, dict):
        node_id = scalar(value.get("@id"))
        if node_id:
            yield node_id
        return
    yield scalar(value)


def language_value(value: Any, language: str = "ja-hrkt") -> str:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("@language") == language:
                return scalar(item.get("@value"))
    if isinstance(value, dict) and value.get("@language") == language:
        return scalar(value.get("@value"))
    return ""


def plain_values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [scalar(item) for item in value if not isinstance(item, dict)]
    if isinstance(value, dict):
        return []
    text = scalar(value)
    return [text] if text else []


def normalize_key(value: str) -> str:
    return SPACE.sub(" ", value.replace("　", " ")).strip().lower()


def split_reading(value: str) -> tuple[str, str]:
    if "∥" not in value:
        return value.strip(), ""
    name, reading = value.split("∥", 1)
    return name.strip(), reading.strip()


def split_role(value: str) -> tuple[str, str]:
    match = ROLE_PREFIX.match(value)
    if not match:
        return "", value.strip()
    return match.group(1).strip(), value[match.end() :].strip()


def is_id(value: str) -> bool:
    return value.startswith(MEDIAARTS_ID_PREFIX) or value.startswith("_:")


def join_seen(values_: set[str]) -> str:
    return " | ".join(sorted(v for v in values_ if v))


def update_entity(
    entities: dict[str, dict[str, Any]],
    key: str,
    name: str,
    reading: str,
    entity_id: str,
    field: str,
    genre: str,
    sample_node_id: str,
    role: str = "",
) -> None:
    if not key:
        return
    entity = entities.setdefault(
        key,
        {
            "name": name,
            "reading": reading,
            "ids": set(),
            "fields": set(),
            "genres": set(),
            "roles": set(),
            "count": 0,
            "sample_node_id": sample_node_id,
        },
    )
    if name and (not entity["name"] or entity["name"].startswith(MEDIAARTS_ID_PREFIX)):
        entity["name"] = name
    if reading and not entity["reading"]:
        entity["reading"] = reading
    if entity_id:
        entity["ids"].add(entity_id)
    if field:
        entity["fields"].add(field)
    if genre:
        entity["genres"].add(genre)
    if role:
        entity["roles"].add(role)
    entity["count"] += 1


def add_responsible_body_info(
    info: dict[str, dict[str, str]], node: dict[str, Any]
) -> None:
    label = scalar(node.get("label") or node.get("name"))
    if not label:
        return
    info[normalize_key(label)] = {
        "address": scalar(node.get("address")),
        "country_of_origin": scalar(node.get("countryOfOrigin")),
        "url": scalar(node.get("url") or node.get("schema:url")),
        "related_link": scalar(node.get("relatedLink") or node.get("schema:relatedLink")),
        "start_date": scalar(node.get("startDate")),
        "end_date": scalar(node.get("endDate")),
        "description": scalar(node.get("description")),
    }


def names_for_field(node: dict[str, Any], field: str) -> tuple[str, str]:
    value = node.get(field)
    plain = " | ".join(plain_values(value))
    return plain, language_value(value)


def compact_people(node: dict[str, Any], fields: Iterable[str], label_by_id: dict[str, str]) -> tuple[str, str]:
    names: list[str] = []
    readings: list[str] = []
    for field in fields:
        field_reading = language_value(node.get(field))
        for raw in entity_values(node.get(field)):
            role, without_role = split_role(raw)
            name, reading = split_reading(without_role)
            if is_id(name):
                name = label_by_id.get(name, name)
            if field_reading and not reading:
                reading = field_reading
            if role and name:
                name = f"[{role}]{name}"
            if name:
                names.append(name)
            if reading:
                readings.append(reading)
    return " | ".join(names), " | ".join(readings)


def publisher_name_for_node(node: dict[str, Any]) -> tuple[str, str]:
    for field in ("schema:publisher", "publisher", "dcterms:publisher", "ma:publisher"):
        for raw in values(node.get(field)):
            name, reading = split_reading(raw)
            if name and not normalize_key(name).startswith("p"):
                return name, reading
    return "", ""


def common_row(node: dict[str, Any], source_file: str, label_by_id: dict[str, str]) -> dict[str, str]:
    name, name_reading = names_for_field(node, "name")
    series_name, series_name_reading = names_for_field(node, "seriesName")
    brand, brand_reading = names_for_field(node, "brand")
    author, author_reading = compact_people(node, AUTHOR_FIELDS, label_by_id)
    publisher_name, publisher_reading = publisher_name_for_node(node)
    return {
        "id": scalar(node.get("@id")),
        "identifier": scalar(node.get("identifier")),
        "rdf_type": scalar(node.get("rdf:type")),
        "additional_type": scalar(node.get("additionalType")),
        "genre": scalar(node.get("genre")),
        "additional_genre": scalar(node.get("additionalGenre")),
        "label": scalar(node.get("label")),
        "name": name,
        "name_reading": name_reading,
        "alternate_name": scalar(node.get("alternateName")),
        "alternative_headline": scalar(node.get("alternativeHeadline")),
        "series_name": series_name,
        "series_name_reading": series_name_reading,
        "publisher": scalar(node.get("publisher")),
        "schema_publisher": scalar(node.get("schema:publisher")),
        "publisher_name": publisher_name,
        "publisher_reading": publisher_reading,
        "author": author,
        "author_reading": author_reading,
        "brand": brand,
        "brand_reading": brand_reading,
        "brand_identifier": scalar(node.get("brandIdentifier")),
        "date_published": scalar(node.get("datePublished")),
        "date_published_final": scalar(node.get("datePublishedFinal")),
        "location": scalar(node.get("location") or node.get("locationPublished")),
        "in_language": scalar(node.get("inLanguage")),
        "keywords": scalar(node.get("keywords")),
        "description": scalar(node.get("description")),
        "note": scalar(node.get("note")),
        "source": scalar(node.get("source")),
        "source_file": source_file,
    }


def book_row(node: dict[str, Any], source_file: str, label_by_id: dict[str, str]) -> dict[str, str]:
    row = common_row(node, source_file, label_by_id)
    row.update(
        {
            "isbn": scalar(node.get("isbn")),
            "gtin": scalar(node.get("gtin")),
            "jpno": scalar(node.get("jpno")),
            "ndc": scalar(node.get("ndc")),
            "volume_number": scalar(node.get("volumeNumber")),
            "total_volume_number": scalar(node.get("totalVolumeNumber")),
            "number_of_pages": scalar(node.get("numberOfPages")),
            "number_of_items": scalar(node.get("numberOfItems")),
            "price": scalar(node.get("price")),
            "size": scalar(node.get("size")),
            "is_part_of": scalar(node.get("isPartOf")),
            "related_collection": scalar(node.get("relatedCollection")),
            "related_item": scalar(node.get("relatedItem")),
        }
    )
    return row


def magazine_row(node: dict[str, Any], source_file: str, label_by_id: dict[str, str]) -> dict[str, str]:
    row = common_row(node, source_file, label_by_id)
    row.update(
        {
            "issn": scalar(node.get("issn")),
            "jpno": scalar(node.get("jpno")),
            "ndc": scalar(node.get("ndc")),
            "volume_number": scalar(node.get("volumeNumber")),
            "issue_number": scalar(node.get("issueNumber")),
            "issue_number_displayed": scalar(node.get("issueNumberDisplayed")),
            "sub_issue_number": scalar(node.get("subIssueNumber")),
            "year_displayed": scalar(node.get("yearDisplayed")),
            "month_displayed": scalar(node.get("monthDisplayed")),
            "day_displayed": scalar(node.get("dayDisplayed")),
            "page_start": scalar(node.get("pageStart")),
            "page_end": scalar(node.get("pageEnd")),
            "page_exclude": scalar(node.get("pageExclude")),
            "position": scalar(node.get("position")),
            "number_of_pages": scalar(node.get("numberOfPages")),
            "mode_issue": scalar(node.get("modeIssue")),
            "is_part_of": scalar(node.get("isPartOf")),
            "related_collection": scalar(node.get("relatedCollection")),
            "related_item": scalar(node.get("relatedItem")),
        }
    )
    return row


def magazine_title_row(
    node: dict[str, Any], source_file: str, label_by_id: dict[str, str]
) -> dict[str, str]:
    row = common_row(node, source_file, label_by_id)
    row.update(
        {
            "mtid": scalar(node.get("mtid")),
            "issn": scalar(node.get("issn")),
            "jpno": scalar(node.get("jpno")),
            "publication_periodicity": scalar(node.get("publicationPeriodicity")),
            "volume_number_final": scalar(node.get("volumeNumberFinal")),
            "issue_number_published": scalar(node.get("issueNumberPublished")),
            "issue_number_displayed_final": scalar(node.get("issueNumberDisplayedFinal")),
            "day_published_final": scalar(node.get("dayPublishedFinal")),
            "total_volume_number_final": scalar(node.get("totalVolumeNumberFinal")),
        }
    )
    return row


def should_write_book(node: dict[str, Any]) -> bool:
    genre = scalar(node.get("genre"))
    return genre in {"単行本", "単行本全巻"}


def should_write_magazine(node: dict[str, Any]) -> bool:
    genre = scalar(node.get("genre"))
    return "雑誌" in genre


def should_write_magazine_title(node: dict[str, Any]) -> bool:
    return scalar(node.get("genre")) == "雑誌全号"


def build_indexes(paths: list[Path], scan_limit: int | None) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    label_by_id: dict[str, str] = {}
    responsible_body_info: dict[str, dict[str, str]] = {}
    scanned = 0
    for path in paths:
        for node in load_json(path).get("@graph", []):
            if not isinstance(node, dict):
                continue
            node_id = scalar(node.get("@id"))
            label = scalar(node.get("label") or node.get("name"))
            if node_id and label:
                label_by_id[node_id] = label
            if node.get("additionalType") == "class:CO" or node.get("genre") == "責任主体":
                add_responsible_body_info(responsible_body_info, node)
            scanned += 1
            if scan_limit is not None and scanned >= scan_limit:
                return label_by_id, responsible_body_info
    return label_by_id, responsible_body_info


def collect_entities(
    node: dict[str, Any],
    publishers: dict[str, dict[str, Any]],
    authors: dict[str, dict[str, Any]],
    label_by_id: dict[str, str],
) -> None:
    node_id = scalar(node.get("@id"))
    genre = scalar(node.get("genre"))

    for field in PUBLISHER_FIELDS:
        field_reading = language_value(node.get(field))
        for raw in entity_values(node.get(field)):
            name, reading = split_reading(raw)
            if field_reading and not reading:
                reading = field_reading
            entity_id = name if is_id(name) or normalize_key(name).startswith("p") else ""
            if is_id(name):
                name = label_by_id.get(name, name)
            key = normalize_key(name)
            update_entity(publishers, key, name, reading, entity_id, field, genre, node_id)

    for field in AUTHOR_FIELDS:
        field_reading = language_value(node.get(field))
        for raw in entity_values(node.get(field)):
            role, without_role = split_role(raw)
            name, reading = split_reading(without_role)
            if field_reading and not reading:
                reading = field_reading
            entity_id = name if is_id(name) else ""
            if is_id(name):
                name = label_by_id.get(name, name)
            key = normalize_key(name)
            update_entity(authors, key, name, reading, entity_id, field, genre, node_id, role)


def write_entity_outputs(
    out_dir: Path,
    publishers: dict[str, dict[str, Any]],
    authors: dict[str, dict[str, Any]],
    responsible_body_info: dict[str, dict[str, str]],
) -> None:
    with (out_dir / "publishers.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=PUBLISHER_OUT_FIELDS)
        writer.writeheader()
        for key, entity in sorted(publishers.items(), key=lambda item: (-item[1]["count"], item[0])):
            extra = responsible_body_info.get(key, {})
            writer.writerow(
                {
                    "publisher_key": key,
                    "publisher_name": entity["name"],
                    "publisher_reading": entity["reading"],
                    "publisher_ids": join_seen(entity["ids"]),
                    "fields": join_seen(entity["fields"]),
                    "genres": join_seen(entity["genres"]),
                    "source_count": entity["count"],
                    "sample_node_id": entity["sample_node_id"],
                    "address": extra.get("address", ""),
                    "country_of_origin": extra.get("country_of_origin", ""),
                    "url": extra.get("url", ""),
                    "related_link": extra.get("related_link", ""),
                    "start_date": extra.get("start_date", ""),
                    "end_date": extra.get("end_date", ""),
                    "description": extra.get("description", ""),
                }
            )

    with (out_dir / "authors.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=AUTHOR_OUT_FIELDS)
        writer.writeheader()
        for key, entity in sorted(authors.items(), key=lambda item: (-item[1]["count"], item[0])):
            writer.writerow(
                {
                    "author_key": key,
                    "author_name": entity["name"],
                    "author_reading": entity["reading"],
                    "roles": join_seen(entity["roles"]),
                    "author_ids": join_seen(entity["ids"]),
                    "fields": join_seen(entity["fields"]),
                    "genres": join_seen(entity["genres"]),
                    "source_count": entity["count"],
                    "sample_node_id": entity["sample_node_id"],
                }
            )


def extract(paths: list[Path], out_dir: Path, scan_limit: int | None) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    label_by_id, responsible_body_info = build_indexes(paths, scan_limit)
    publishers: dict[str, dict[str, Any]] = {}
    authors: dict[str, dict[str, Any]] = {}
    scanned = 0

    with (
        (out_dir / "books.csv").open("w", encoding="utf-8", newline="") as books_file,
        (out_dir / "magazines.csv").open("w", encoding="utf-8", newline="") as magazines_file,
        (out_dir / "magazine_titles.csv").open("w", encoding="utf-8", newline="") as magazine_titles_file,
    ):
        books_writer = csv.DictWriter(books_file, fieldnames=BOOK_FIELDS)
        magazines_writer = csv.DictWriter(magazines_file, fieldnames=MAGAZINE_FIELDS)
        magazine_titles_writer = csv.DictWriter(
            magazine_titles_file, fieldnames=MAGAZINE_TITLE_FIELDS
        )
        books_writer.writeheader()
        magazines_writer.writeheader()
        magazine_titles_writer.writeheader()

        for path in paths:
            for node in load_json(path).get("@graph", []):
                if not isinstance(node, dict):
                    continue
                collect_entities(node, publishers, authors, label_by_id)
                if should_write_book(node):
                    books_writer.writerow(book_row(node, path.name, label_by_id))
                if should_write_magazine(node):
                    magazines_writer.writerow(magazine_row(node, path.name, label_by_id))
                if should_write_magazine_title(node):
                    magazine_titles_writer.writerow(
                        magazine_title_row(node, path.name, label_by_id)
                    )
                scanned += 1
                if scan_limit is not None and scanned >= scan_limit:
                    write_entity_outputs(out_dir, publishers, authors, responsible_body_info)
                    return scanned

    write_entity_outputs(out_dir, publishers, authors, responsible_body_info)
    return scanned


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract publisher, author, book, and magazine CSV lists from MADB JSON-LD."
    )
    parser.add_argument("--metadata-dir", type=Path, default=Path("metadata"))
    parser.add_argument("--pattern", default="metadata_all_*.json")
    parser.add_argument("--output-dir", type=Path, default=Path("converted/core_lists"))
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum graph nodes to scan. Use 0 for all nodes.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = sorted(args.metadata_dir.glob(args.pattern))
    if not paths:
        print(f"no files matching {args.pattern} found in {args.metadata_dir}")
        return 1
    limit = None if args.limit == 0 else args.limit
    scanned = extract(paths, args.output_dir, limit)
    print(f"scanned {scanned} nodes into {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
