from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(deals)")).fetchall()
        names = {row[1] for row in rows}
        if "rating" not in names:
            conn.execute(text("ALTER TABLE deals ADD COLUMN rating FLOAT"))
        if "review_count" not in names:
            conn.execute(text("ALTER TABLE deals ADD COLUMN review_count INTEGER"))
        if "search_queries" not in names:
            conn.execute(
                text("ALTER TABLE deals ADD COLUMN search_queries TEXT NOT NULL DEFAULT ''")
            )
        if "affiliate_url" not in names:
            conn.execute(text("ALTER TABLE deals ADD COLUMN affiliate_url TEXT"))


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
