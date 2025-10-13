# models.py
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
import os

Base = declarative_base()

# Association table for many-to-many relationship between users and albums
user_album_access = Table('user_album_access', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('album_id', Integer, ForeignKey('albums.id'), primary_key=True),
    Column('granted_at', DateTime, default=func.now())
)

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=True, index=True)
    password = Column(String(255), nullable=True)  # Nullable for Google OAuth users
    role = Column(String(20), nullable=False, default='attendee')  # 'photographer', 'attendee', 'pending_photo'
    ref_photo_path = Column(String(500), nullable=True)  # Path to reference photo in R2
    google_id = Column(String(100), unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    albums = relationship("Album", back_populates="photographer")
    accessible_albums = relationship("Album", secondary=user_album_access, back_populates="accessible_users")
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'ref_photo_path': self.ref_photo_path,
            'google_id': self.google_id,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class Album(Base):
    __tablename__ = 'albums'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    album_id = Column(String(100), nullable=False, index=True)  # URL-friendly ID
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    photographer_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    cover_photo_path = Column(String(500), nullable=True)  # Path to cover photo in R2
    photo_count = Column(Integer, default=0)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    photographer = relationship("User", back_populates="albums")
    accessible_users = relationship("User", secondary=user_album_access, back_populates="accessible_albums")
    
    def __repr__(self):
        return f'<Album {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.album_id,
            'name': self.name,
            'description': self.description,
            'photographer': self.photographer.username if self.photographer else None,
            'cover': self.cover_photo_path,
            'photo_count': self.photo_count,
            'is_public': self.is_public,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

# Database configuration
class DatabaseConfig:
    def __init__(self):
        # Use SQLite for development, easily switchable to PostgreSQL/MySQL for production
        db_url = os.environ.get('DATABASE_URL', 'sqlite:///face_recognition_app.db')
        
        # Handle PostgreSQL URL format (for production)
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        
        self.engine = create_engine(
            db_url,
            echo=os.environ.get('DATABASE_ECHO', 'False').lower() == 'true',
            pool_pre_ping=True,
            pool_recycle=300
        )
        
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def create_tables(self):
        """Create all tables"""
        Base.metadata.create_all(bind=self.engine)
    
    def get_session(self):
        """Get database session"""
        return self.SessionLocal()

# Global database instance
db_config = DatabaseConfig()

def init_database():
    """Initialize database and create tables"""
    db_config.create_tables()
    print("✅ Database tables created successfully!")

def get_db_session():
    """Get database session with automatic cleanup"""
    session = db_config.get_session()
    try:
        return session
    except Exception:
        session.close()
        raise

# Context manager for database sessions
class DatabaseSession:
    def __enter__(self):
        self.session = get_db_session()
        return self.session
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.session.rollback()
        else:
            self.session.commit()
        self.session.close()

# Re-export commonly used items for convenience
__all__ = [
    "Base",
    "User",
    "Album",
    "user_album_access",
    "DatabaseConfig",
    "db_config",
    "init_database",
    "get_db_session",
    "DatabaseSession",
]
