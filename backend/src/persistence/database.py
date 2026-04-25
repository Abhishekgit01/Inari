"""Async SQLAlchemy engine + session factory for Postgres persistence."""

from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/athernex",
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables (only for dev — use Alembic in prod)."""
    async with engine.begin() as conn:
        from .models import ConnectorProfile, UrlReport, PollingHistory  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()
