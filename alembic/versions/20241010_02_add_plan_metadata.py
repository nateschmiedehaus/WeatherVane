"""Add metadata column to plan table."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20241010_02_add_plan_metadata"
down_revision = "20241007_01_guided_automation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan", sa.Column("metadata", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("plan", "metadata")
