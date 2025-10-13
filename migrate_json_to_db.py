"""One-off script to migrate legacy JSON data into the SQL database."""

import json
import os
from pathlib import Path
from typing import Dict, List, Tuple

from sqlalchemy.orm import joinedload

from db import init_db
from models import Album, DatabaseSession, User

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_CANDIDATES = [SCRIPT_DIR / "database.json", SCRIPT_DIR.parent / "database.json"]


def _load_legacy_data() -> Dict[str, Dict[str, Dict[str, str]]]:
    legacy_path = next((path for path in LEGACY_CANDIDATES if path.exists()), None)
    if not legacy_path:
        joined = " or ".join(str(path) for path in LEGACY_CANDIDATES)
        raise FileNotFoundError(f"Legacy database file not found. Looked in: {joined}")

    with legacy_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _migrate_users(session, users: Dict[str, Dict[str, str]]) -> Tuple[int, int]:
    created = 0
    updated = 0

    for username, payload in users.items():
        user = session.query(User).filter_by(username=username).first()
        if user:
            user.password = payload.get("password")
            user.role = payload.get("role", user.role)
            user.ref_photo_path = payload.get("ref_photo_path")
            user.google_id = payload.get("google_id")
            user.email = payload.get("email")
            updated += 1
        else:
            session.add(
                User(
                    username=username,
                    password=payload.get("password"),
                    role=payload.get("role", "attendee"),
                    ref_photo_path=payload.get("ref_photo_path"),
                    google_id=payload.get("google_id"),
                    email=payload.get("email"),
                )
            )
            created += 1
    return created, updated


def _migrate_albums(session, albums: Dict[str, Dict[str, Dict[str, List[str]]]]) -> Tuple[int, int]:
    created = 0
    updated = 0

    for photographer_username, album_dict in albums.items():
        photographer = session.query(User).filter_by(username=photographer_username).first()
        if not photographer:
            print(f"Skipping albums for unknown photographer: {photographer_username}")
            continue

        for album_slug, album_payload in album_dict.items():
            album = (
                session.query(Album)
                .filter_by(photographer_id=photographer.id, album_id=album_slug)
                .first()
            )
            if album:
                album.name = album_payload.get("name", album.name)
                album.photo_count = len(album_payload.get("photos", []) or [])
                updated += 1
            else:
                session.add(
                    Album(
                        album_id=album_slug,
                        name=album_payload.get("name", album_slug.replace("-", " ").title()),
                        photographer=photographer,
                        photo_count=len(album_payload.get("photos", []) or []),
                    )
                )
                created += 1
    return created, updated


def _migrate_album_access(session, access_map: Dict[str, List[str]]) -> int:
    linked = 0

    for attendee_username, entries in access_map.items():
        attendee = session.query(User).filter_by(username=attendee_username).first()
        if not attendee:
            print(f"Skipping access entries for unknown attendee: {attendee_username}")
            continue

        for entry in entries:
            try:
                photographer_username, album_slug = entry.split("/", 1)
            except ValueError:
                print(f"Skipping malformed access entry '{entry}' for user {attendee_username}")
                continue

            album = (
                session.query(Album)
                .options(joinedload(Album.photographer))
                .join(User, Album.photographer)
                .filter(User.username == photographer_username, Album.album_id == album_slug)
                .first()
            )
            if not album:
                print(
                    f"Skipping access entry '{entry}' for user {attendee_username}: album not found"
                )
                continue

            if attendee in album.accessible_users:
                continue

            album.accessible_users.append(attendee)
            linked += 1
    return linked


def migrate() -> None:
    init_db()
    legacy_data = _load_legacy_data()

    users = legacy_data.get("users", {})
    albums = legacy_data.get("albums", {})
    access_map = legacy_data.get("user_album_access", {})

    with DatabaseSession() as session:
        user_created, user_updated = _migrate_users(session, users)
        album_created, album_updated = _migrate_albums(session, albums)
        access_linked = _migrate_album_access(session, access_map)

    print(
        "Migration complete!"
        f" Users created: {user_created}, updated: {user_updated}."
        f" Albums created: {album_created}, updated: {album_updated}."
        f" Access links added: {access_linked}."
    )


if __name__ == "__main__":
    migrate()
