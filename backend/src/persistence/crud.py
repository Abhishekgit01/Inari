"""CRUD helpers for Postgres persistence layer."""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ConnectorProfile, UrlReport, PollingHistory


# ── ConnectorProfile ────────────────────────────────────────────────────────

async def create_connector(
    session: AsyncSession,
    tenant_id: str,
    name: str,
    vendor: str = "generic",
    feed_url: str | None = None,
    auth_header: str | None = None,
    polling_interval_seconds: int = 300,
) -> ConnectorProfile:
    profile = ConnectorProfile(
        tenant_id=tenant_id,
        name=name,
        vendor=vendor,
        feed_url=feed_url,
        auth_header=auth_header,
        polling_interval_seconds=polling_interval_seconds,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def list_connectors(session: AsyncSession, tenant_id: str) -> Sequence[ConnectorProfile]:
    result = await session.execute(
        select(ConnectorProfile)
        .where(ConnectorProfile.tenant_id == tenant_id)
        .order_by(ConnectorProfile.created_at.desc())
    )
    return result.scalars().all()


async def get_connector(session: AsyncSession, connector_id: str) -> ConnectorProfile | None:
    return await session.get(ConnectorProfile, connector_id)


async def delete_connector(session: AsyncSession, connector_id: str) -> bool:
    obj = await session.get(ConnectorProfile, connector_id)
    if obj:
        await session.delete(obj)
        await session.commit()
        return True
    return False


# ── UrlReport ───────────────────────────────────────────────────────────────

async def upsert_url_report(
    session: AsyncSession,
    tenant_id: str,
    url: str,
    risk_score: float,
    risk_label: str,
    findings_json: str | None = None,
) -> UrlReport:
    """Insert or update a URL report (keyed by tenant + url)."""
    result = await session.execute(
        select(UrlReport)
        .where(UrlReport.tenant_id == tenant_id, UrlReport.url == url)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.risk_score = risk_score
        existing.risk_label = risk_label
        existing.findings_json = findings_json
        await session.commit()
        return existing

    report = UrlReport(
        tenant_id=tenant_id,
        url=url,
        risk_score=risk_score,
        risk_label=risk_label,
        findings_json=findings_json,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def list_url_reports(session: AsyncSession, tenant_id: str, limit: int = 50) -> Sequence[UrlReport]:
    result = await session.execute(
        select(UrlReport)
        .where(UrlReport.tenant_id == tenant_id)
        .order_by(UrlReport.scanned_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ── PollingHistory ──────────────────────────────────────────────────────────

async def record_poll(
    session: AsyncSession,
    connector_id: str,
    tenant_id: str,
    status: str = "success",
    events_ingested: int = 0,
    error: str | None = None,
) -> PollingHistory:
    entry = PollingHistory(
        connector_id=connector_id,
        tenant_id=tenant_id,
        status=status,
        events_ingested=events_ingested,
        error=error,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def get_polling_history(
    session: AsyncSession,
    connector_id: str,
    limit: int = 50,
) -> Sequence[PollingHistory]:
    result = await session.execute(
        select(PollingHistory)
        .where(PollingHistory.connector_id == connector_id)
        .order_by(PollingHistory.polled_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
