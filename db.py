"""Database helpers using SQLAlchemy models."""

import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from models import Album, User, db_config


def init_db() -> None:
    """Ensure that all database tables exist."""
    db_config.create_tables()


def get_user(username: str) -> Optional[User]:
    """Return a detached user object for the given username."""
    session = db_config.get_session()
    try:
        user = session.query(User).filter_by(username=username).first()
        if user:
            session.expunge(user)
        return user
    finally:
        session.close()


def get_user_by_email(email: str) -> Optional[User]:
    """Return a detached user object for the given email address."""
    session = db_config.get_session()
    try:
        user = session.query(User).filter_by(email=email).first()
        if user:
            session.expunge(user)
        return user
    finally:
        session.close()


def add_user(
    username: str,
    password: Optional[str],
    role: str,
    ref_photo_path: Optional[str],
    google_id: Optional[str] = None,
    email: Optional[str] = None,
) -> Tuple[bool, str]:
    """Create a new user in the database."""
    session = db_config.get_session()
    try:
        new_user = User(
            username=username,
            password=password,
            role=role,
            ref_photo_path=ref_photo_path,
            google_id=google_id,
            email=email,
        )
        session.add(new_user)
        session.commit()
        return True, "User added successfully."
    except IntegrityError:
        session.rollback()
        return False, "Username or email already exists."
    finally:
        session.close()


def create_or_get_google_user(google_id: str, name: str, email: Optional[str]):
    """Return an existing Google user or create one with a pending role."""
    session = db_config.get_session()
    try:
        existing_user = session.query(User).filter_by(google_id=google_id).first()
        if existing_user:
            session.expunge(existing_user)
            return existing_user, False

        base_username = name.lower().replace(" ", "_") or f"user_{uuid.uuid4().hex[:6]}"
        candidate_username = base_username

        counter = 1
        while session.query(User).filter_by(username=candidate_username).first():
            suffix = uuid.uuid4().hex[:4]
            candidate_username = f"{base_username}_{suffix}" if counter == 1 else f"{base_username}_{counter}_{suffix}"
            counter += 1

        new_user = User(
            username=candidate_username,
            email=email,
            password=None,
            role="pending_photo",
            google_id=google_id,
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        session.expunge(new_user)
        return new_user, True
    finally:
        session.close()


def add_album(photographer_username: str, album_slug: str, album_name: str) -> Tuple[bool, str]:
    """Create a new album for a photographer."""
    session = db_config.get_session()
    try:
        photographer = session.query(User).filter_by(username=photographer_username).first()
        if not photographer:
            return False, "Photographer not found."

        existing = (
            session.query(Album)
            .filter_by(photographer_id=photographer.id, album_id=album_slug)
            .first()
        )
        if existing:
            return False, "Album ID already exists for this photographer."

        album = Album(
            album_id=album_slug,
            name=album_name,
            photographer=photographer,
        )
        session.add(album)
        session.commit()
        return True, "Album created successfully."
    finally:
        session.close()


def delete_album(photographer_username: str, album_slug: str) -> Tuple[bool, str]:
    """Delete an album from the database."""
    session = db_config.get_session()
    try:
        photographer = session.query(User).filter_by(username=photographer_username).first()
        if not photographer:
            return False, "Photographer not found."

        album = (
            session.query(Album)
            .filter_by(photographer_id=photographer.id, album_id=album_slug)
            .first()
        )
        if not album:
            return False, "Album not found."

        session.delete(album)
        session.commit()
        return True, "Album deleted successfully."
    except Exception as e:
        session.rollback()
        return False, str(e)
    finally:
        session.close()


def grant_album_access(
    attendee_username: str, photographer_username: str, album_slug: str
) -> Tuple[bool, str]:
    """Grant an attendee access to a specific album."""
    session = db_config.get_session()
    try:
        attendee = session.query(User).filter_by(username=attendee_username).first()
        if not attendee:
            return False, "Attendee not found."

        album = (
            session.query(Album)
            .join(User, Album.photographer)
            .options(joinedload(Album.photographer))
            .filter(User.username == photographer_username, Album.album_id == album_slug)
            .first()
        )
        if not album:
            return False, "Album not found."

        if attendee in album.accessible_users:
            return False, "Access already granted."

        album.accessible_users.append(attendee)
        session.commit()
        return True, "Access granted."
    finally:
        session.close()


def get_accessible_albums_for_user(username: str) -> List[Dict[str, Optional[str]]]:
    """Return metadata for albums that a user can access."""
    session = db_config.get_session()
    try:
        user = (
            session.query(User)
            .options(joinedload(User.accessible_albums).joinedload(Album.photographer))
            .filter_by(username=username)
            .first()
        )
        if not user:
            return []

        albums = []
        for album in user.accessible_albums:
            albums.append(
                {
                    "album_id": album.album_id,
                    "name": album.name,
                    "photographer": album.photographer.username if album.photographer else None,
                }
            )
        return albums
    finally:
        session.close()


def get_albums_for_photographer(username: str) -> List[Dict[str, Optional[str]]]:
    """Return album metadata for the given photographer."""
    session = db_config.get_session()
    try:
        photographer = session.query(User).filter_by(username=username).first()
        if not photographer:
            return []

        albums = (
            session.query(Album)
            .filter_by(photographer_id=photographer.id)
            .all()
        )

        result = []
        for album in albums:
            session.expunge(album)
            result.append(
                {
                    "album_id": album.album_id,
                    "name": album.name,
                    "photo_count": album.photo_count,
                    "cover": album.cover_photo_path,
                }
            )
        return result
    finally:
        session.close()


def update_user_reference_photo(
    username: str, ref_photo_path: str, role: Optional[str] = None
) -> bool:
    """Update a user's reference photo path and optionally their role."""
    session = db_config.get_session()
    try:
        user = session.query(User).filter_by(username=username).first()
        if not user:
            return False

        user.ref_photo_path = ref_photo_path
        if role:
            user.role = role
        session.commit()
        return True
    finally:
        session.close()


def update_user_password(username: str, new_password: str) -> bool:
    """Persist a new password for the given user."""
    session = db_config.get_session()
    try:
        user = session.query(User).filter_by(username=username).first()
        if not user:
            return False

        user.password = new_password
        session.commit()
        return True
    finally:
        session.close()
