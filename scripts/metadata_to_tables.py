#!/usr/bin/env python3
"""Convert MADB JSON-LD metadata into analysis-friendly CSV tables."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
MEDIAARTS_ID_PREFIX = "https://mediaarts-db.bunka.go.jp/id/"

DOMAIN_BY_ADDITIONAL_TYPE = {
    "class:AN": "anime",
    "class:CM": "manga",
    "class:CO": "curation",
    "class:GM": "game",
    "class:MA": "media_art",
}

NODE_FIELDS = [
    "id",
    "identifier",
    "rdf_type",
    "additional_type",
    "domain",
    "genre",
    "label",
    "date_published",
    "publisher",
    "source_file",
]

EDGE_FIELDS = ["source_id", "predicate", "target_id"]
NAME_FIELDS = ["node_id", "field", "value", "language"]

TITLE_LIKE_FIELDS = (
    "label",
    "name",
    "alternativeHeadline",
    "alternateName",
    "originalTitle",
    "seriesName",
    "variantTitle",
)


def clean_json_text(text: str) -> str:
    """Remove unescaped control characters that make one source JSON invalid."""
    return CONTROL_CHARS.sub(" ", text)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.loads(clean_json_text(handle.read()))


def scalar_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        if "@value" in value:
            return scalar_text(value["@value"])
        if "@id" in value:
            return scalar_text(value["@id"])
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    if isinstance(value, list):
        return " | ".join(filter(None, (scalar_text(item) for item in value)))
    return str(value)


def iter_name_values(value: Any) -> Iterable[tuple[str, str]]:
    if value is None:
        return
    if isinstance(value, str):
        yield value, ""
        return
    if isinstance(value, (int, float, bool)):
        yield str(value), ""
        return
    if isinstance(value, list):
        for item in value:
            yield from iter_name_values(item)
        return
    if isinstance(value, dict):
        if "@value" in value:
            yield scalar_text(value["@value"]), scalar_text(value.get("@language"))
        elif "@id" in value:
            yield scalar_text(value["@id"]), ""
        return


def is_node_reference(value: str) -> bool:
    return value.startswith(MEDIAARTS_ID_PREFIX) or value.startswith("_:")


def iter_edge_targets(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, str):
        if is_node_reference(value):
            yield value
        return
    if isinstance(value, list):
        for item in value:
            yield from iter_edge_targets(item)
        return
    if isinstance(value, dict):
        node_id = value.get("@id")
        if isinstance(node_id, str) and is_node_reference(node_id):
            yield node_id
        return


def node_row(node: dict[str, Any], source_file: str) -> dict[str, str]:
    additional_type = scalar_text(node.get("additionalType"))
    return {
        "id": scalar_text(node.get("@id")),
        "identifier": scalar_text(node.get("identifier")),
        "rdf_type": scalar_text(node.get("rdf:type")),
        "additional_type": additional_type,
        "domain": DOMAIN_BY_ADDITIONAL_TYPE.get(additional_type, ""),
        "genre": scalar_text(node.get("genre")),
        "label": scalar_text(node.get("label")),
        "date_published": scalar_text(node.get("datePublished")),
        "publisher": scalar_text(node.get("publisher") or node.get("schema:publisher")),
        "source_file": source_file,
    }


def convert(paths: list[Path], out_dir: Path, limit: int | None) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    node_count = 0

    with (
        (out_dir / "nodes.csv").open("w", encoding="utf-8", newline="") as nodes_file,
        (out_dir / "edges.csv").open("w", encoding="utf-8", newline="") as edges_file,
        (out_dir / "names.csv").open("w", encoding="utf-8", newline="") as names_file,
    ):
        nodes_writer = csv.DictWriter(nodes_file, fieldnames=NODE_FIELDS)
        edges_writer = csv.DictWriter(edges_file, fieldnames=EDGE_FIELDS)
        names_writer = csv.DictWriter(names_file, fieldnames=NAME_FIELDS)
        nodes_writer.writeheader()
        edges_writer.writeheader()
        names_writer.writeheader()

        for path in paths:
            data = load_json(path)
            graph = data.get("@graph", [])
            if not isinstance(graph, list):
                print(f"skip: {path} has no @graph list", file=sys.stderr)
                continue

            for node in graph:
                if not isinstance(node, dict):
                    continue

                source_id = scalar_text(node.get("@id"))
                if not source_id:
                    continue

                nodes_writer.writerow(node_row(node, path.name))

                for predicate, value in node.items():
                    if predicate == "@id":
                        continue
                    for target_id in iter_edge_targets(value):
                        edges_writer.writerow(
                            {
                                "source_id": source_id,
                                "predicate": predicate,
                                "target_id": target_id,
                            }
                        )

                for field in TITLE_LIKE_FIELDS:
                    for value, language in iter_name_values(node.get(field)):
                        if value:
                            names_writer.writerow(
                                {
                                    "node_id": source_id,
                                    "field": field,
                                    "value": value,
                                    "language": language,
                                }
                            )

                node_count += 1
                if limit is not None and node_count >= limit:
                    return node_count

    return node_count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert MADB JSON-LD metadata into nodes, edges, and names CSV files."
    )
    parser.add_argument(
        "--metadata-dir",
        type=Path,
        default=Path("metadata"),
        help="Directory containing metadata_all_*.json files.",
    )
    parser.add_argument(
        "--pattern",
        default="metadata_all_*.json",
        help="Glob pattern used inside --metadata-dir.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("converted/sample"),
        help="Directory where CSV files will be written.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5000,
        help="Maximum number of graph nodes to convert. Use 0 for all nodes.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = sorted(args.metadata_dir.glob(args.pattern))
    if not paths:
        print(f"no files matching {args.pattern} found in {args.metadata_dir}", file=sys.stderr)
        return 1

    limit = None if args.limit == 0 else args.limit
    count = convert(paths, args.output_dir, limit)
    print(f"converted {count} nodes into {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
