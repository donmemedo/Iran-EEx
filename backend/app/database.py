"""Engine and session management."""
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args, pool_pre_ping=True)


def init_db() -> None:
    from . import models  # noqa: F401  - ensure models are registered

    SQLModel.metadata.create_all(engine)
    # create_all skips tables that already exist, so indexes added to an existing
    # table (no migration tool yet) are created here.
    for table in SQLModel.metadata.sorted_tables:
        for index in table.indexes:
            index.create(engine, checkfirst=True)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
