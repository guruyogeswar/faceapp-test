"""Utility script to inspect Cloudflare R2 storage contents.

Usage examples (PowerShell):
    # List everything in the bucket
    python scripts/list_r2_contents.py

    # List items under a specific prefix/folder
    python scripts/list_r2_contents.py --prefix event_albums/demo/

    # Limit the number of results returned
    python scripts/list_r2_contents.py --limit 50

The script relies on the credentials defined in config.R2_CONFIG.
"""

import argparse
from typing import Iterable

from r2_storage import list_objects, R2_CONFIG


def _print_header(title: str) -> None:
    separator = "=" * len(title)
    print(f"{title}\n{separator}")


def _display_config() -> None:
    masked_key = R2_CONFIG.get("aws_access_key_id", "")[:4] + "***"
    print("Using bucket:", R2_CONFIG.get("bucket_name", "<unknown>"))
    print("Endpoint:", R2_CONFIG.get("endpoint_url", "<unknown>"))
    print("Access key prefix:", masked_key)
    print()


def _display_objects(objects: Iterable[str]) -> None:
    count = 0
    for key in objects:
        print(key)
        count += 1
    if count == 0:
        print("(no objects found)")
    print(f"\nTotal objects listed: {count}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect Cloudflare R2 object listings.")
    parser.add_argument(
        "--prefix",
        default="",
        help="Optional prefix to filter objects (e.g., 'event_albums/demo/').",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of objects to return (default: 100).",
    )
    parser.add_argument(
        "--delimiter",
        default="",
        help=(
            "Optional delimiter to group keys (e.g., '/' to emulate folder listings). "
            "When provided, the result includes both objects and common prefixes."
        ),
    )
    args = parser.parse_args()

    _print_header("Cloudflare R2 Listing")
    _display_config()

    objects = list_objects(prefix=args.prefix, delimiter=args.delimiter, limit=args.limit)
    _display_objects(objects)


if __name__ == "__main__":
    main()
