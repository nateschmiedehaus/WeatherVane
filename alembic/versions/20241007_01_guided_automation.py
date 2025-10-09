"""guided automation consent and privacy scaffolding

Revision ID: 20241007_01_guided_automation
Revises: 20240620_000001_initial_schema
Create Date: 2025-02-14 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241007_01_guided_automation"
down_revision = "20240620_000001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("guardrail_policy", sa.Column("pushes_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("guardrail_policy", sa.Column("push_cap_daily", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("guardrail_policy", sa.Column("push_window_start_utc", sa.String(length=8), nullable=True))
    op.add_column("guardrail_policy", sa.Column("push_window_end_utc", sa.String(length=8), nullable=True))
    op.add_column("guardrail_policy", sa.Column("consent_status", sa.String(length=16), nullable=False, server_default="pending"))
    op.add_column("guardrail_policy", sa.Column("consent_version", sa.String(length=16), nullable=False, server_default="1.0"))
    op.add_column("guardrail_policy", sa.Column("consent_recorded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("guardrail_policy", sa.Column("consent_actor", sa.String(length=80), nullable=True))
    op.add_column("guardrail_policy", sa.Column("retention_days", sa.Integer(), nullable=False, server_default="365"))
    op.add_column("guardrail_policy", sa.Column("last_export_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("guardrail_policy", sa.Column("last_delete_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("guardrail_policy", sa.Column("last_settings_update_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("guardrail_policy", sa.Column("last_settings_actor", sa.String(length=80), nullable=True))

    op.create_table(
        "data_request",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(length=50), sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("request_type", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("requested_by", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_data_request_tenant_id", "data_request", ["tenant_id"], unique=False)

    op.alter_column("guardrail_policy", "pushes_enabled", server_default=None)
    op.alter_column("guardrail_policy", "push_cap_daily", server_default=None)
    op.alter_column("guardrail_policy", "consent_status", server_default=None)
    op.alter_column("guardrail_policy", "consent_version", server_default=None)
    op.alter_column("guardrail_policy", "retention_days", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_data_request_tenant_id", table_name="data_request")
    op.drop_table("data_request")

    op.drop_column("guardrail_policy", "last_settings_actor")
    op.drop_column("guardrail_policy", "last_settings_update_at")
    op.drop_column("guardrail_policy", "last_delete_at")
    op.drop_column("guardrail_policy", "last_export_at")
    op.drop_column("guardrail_policy", "retention_days")
    op.drop_column("guardrail_policy", "consent_actor")
    op.drop_column("guardrail_policy", "consent_recorded_at")
    op.drop_column("guardrail_policy", "consent_version")
    op.drop_column("guardrail_policy", "consent_status")
    op.drop_column("guardrail_policy", "push_window_end_utc")
    op.drop_column("guardrail_policy", "push_window_start_utc")
    op.drop_column("guardrail_policy", "push_cap_daily")
    op.drop_column("guardrail_policy", "pushes_enabled")
