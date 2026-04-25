"""SQLAlchemy ORM models for multi-tenant persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Float, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class ConnectorProfile(Base):
    """Tenant-scoped SIEM connector configuration."""

    __tablename__ = "connector_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(256))
    vendor: Mapped[str] = mapped_column(String(64), default="generic")
    feed_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_header: Mapped[str | None] = mapped_column(Text, nullable=True)
    polling_interval_seconds: Mapped[int] = mapped_column(Integer, default=300)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    polling_history: Mapped[list["PollingHistory"]] = relationship(back_populates="connector", cascade="all, delete-orphan")


class UrlReport(Base):
    """Persisted URL security scan result."""

    __tablename__ = "url_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    url: Mapped[str] = mapped_column(Text)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_label: Mapped[str] = mapped_column(String(32), default="unknown")
    findings_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PollingHistory(Base):
    """Timestamped record of a connector polling attempt."""

    __tablename__ = "polling_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    connector_id: Mapped[str] = mapped_column(String(36), ForeignKey("connector_profiles.id"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    events_ingested: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    polled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    connector: Mapped["ConnectorProfile"] = relationship(back_populates="polling_history")
