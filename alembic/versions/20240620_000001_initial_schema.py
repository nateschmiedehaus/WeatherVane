"""initial schema

Revision ID: 20240620_000001
Revises: 
Create Date: 2024-06-20 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20240620_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant",
        sa.Column("id", sa.String(length=50), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=8), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "connection",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(length=50), sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'disconnected'")),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_connection_tenant_id", "connection", ["tenant_id"])

    op.create_table(
        "guardrail_policy",
        sa.Column("tenant_id", sa.String(length=50), sa.ForeignKey("tenant.id"), primary_key=True),
        sa.Column("max_daily_budget_delta_pct", sa.Float(), nullable=False, server_default=sa.text("15")),
        sa.Column("min_daily_spend", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("roas_floor", sa.Float(), nullable=True),
        sa.Column("cpa_ceiling", sa.Float(), nullable=True),
        sa.Column("change_windows", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("autopilot_mode", sa.String(length=16), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("alerts", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "plan",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(length=50), sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column(
            "generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("horizon_days", sa.Integer(), nullable=False, server_default=sa.text("7")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "plan_slice",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id"), nullable=False),
        sa.Column("plan_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("geo_group_id", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("recommended_spend", sa.Float(), nullable=False),
        sa.Column("expected_revenue_low", sa.Float(), nullable=False),
        sa.Column("expected_revenue_mid", sa.Float(), nullable=False),
        sa.Column("expected_revenue_high", sa.Float(), nullable=False),
        sa.Column("expected_roas_low", sa.Float(), nullable=False),
        sa.Column("expected_roas_mid", sa.Float(), nullable=False),
        sa.Column("expected_roas_high", sa.Float(), nullable=False),
        sa.Column("rationale", sa.JSON(), nullable=True),
    )

    op.create_table(
        "approval",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("approver_user_id", sa.String(length=50), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(length=50), nullable=False),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=50), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("approval")
    op.drop_table("plan_slice")
    op.drop_table("plan")
    op.drop_table("guardrail_policy")
    op.drop_index("ix_connection_tenant_id", table_name="connection")
    op.drop_table("connection")
    op.drop_table("tenant")
