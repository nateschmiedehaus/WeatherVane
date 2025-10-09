from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship, declarative_base


Base = declarative_base()


class Tenant(Base):
    __tablename__ = "tenant"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    connections: Mapped[list["Connection"]] = relationship("Connection", back_populates="tenant")
    guardrail_policy: Mapped[GuardrailPolicy | None] = relationship(
        "GuardrailPolicy", back_populates="tenant", uselist=False
    )


class Connection(Base):
    __tablename__ = "connection"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="disconnected")
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="connections")


class GuardrailPolicy(Base):
    __tablename__ = "guardrail_policy"

    tenant_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("tenant.id"), primary_key=True
    )
    max_daily_budget_delta_pct: Mapped[float] = mapped_column(default=15.0)
    min_daily_spend: Mapped[float] = mapped_column(default=0.0)
    roas_floor: Mapped[float | None] = mapped_column()
    cpa_ceiling: Mapped[float | None] = mapped_column()
    change_windows: Mapped[list[str]] = mapped_column(JSON, default=list)
    autopilot_mode: Mapped[str] = mapped_column(String(16), default="manual")
    pushes_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    push_cap_daily: Mapped[int] = mapped_column(Integer, default=0)
    push_window_start_utc: Mapped[str | None] = mapped_column(String(8))
    push_window_end_utc: Mapped[str | None] = mapped_column(String(8))
    consent_status: Mapped[str] = mapped_column(String(16), default="pending")
    consent_version: Mapped[str] = mapped_column(String(16), default="1.0")
    consent_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_actor: Mapped[str | None] = mapped_column(String(80))
    retention_days: Mapped[int] = mapped_column(Integer, default=365)
    last_export_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_delete_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_settings_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_settings_actor: Mapped[str | None] = mapped_column(String(80))
    alerts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="guardrail_policy")


class Plan(Base):
    __tablename__ = "plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    horizon_days: Mapped[int] = mapped_column(Integer, default=7)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_payload: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, default=dict)

    tenant: Mapped[Tenant] = relationship("Tenant")
    slices: Mapped[list["PlanSlice"]] = relationship("PlanSlice", back_populates="plan")


class PlanSlice(Base):
    __tablename__ = "plan_slice"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("plan.id"))
    plan_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geo_group_id: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    recommended_spend: Mapped[float] = mapped_column()
    expected_revenue_low: Mapped[float] = mapped_column()
    expected_revenue_mid: Mapped[float] = mapped_column()
    expected_revenue_high: Mapped[float] = mapped_column()
    expected_roas_low: Mapped[float] = mapped_column()
    expected_roas_mid: Mapped[float] = mapped_column()
    expected_roas_high: Mapped[float] = mapped_column()
    rationale: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    plan: Mapped[Plan] = relationship("Plan", back_populates="slices")


class Approval(Base):
    __tablename__ = "approval"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("plan.id"))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    approver_user_id: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[Plan] = relationship("Plan")


class DataRequest(Base):
    __tablename__ = "data_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False, index=True)
    request_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    requested_by: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tenant: Mapped[Tenant] = relationship("Tenant")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
