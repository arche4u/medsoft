import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.core.config import settings
from app.core.base import Base
import app.modules.platform.projects.model       # noqa: F401
import app.modules.compliance.dev.requirements.model   # noqa: F401
import app.modules.compliance.risk.risks.model          # noqa: F401
import app.modules.compliance.dev.design.model         # noqa: F401
import app.modules.compliance.dev.validation.model     # noqa: F401
import app.modules.platform.audit.model          # noqa: F401
import app.modules.compliance.change_control.model # noqa: F401
import app.modules.platform.approval.model       # noqa: F401
import app.modules.compliance.release.model        # noqa: F401
import app.modules.compliance.dhf.model            # noqa: F401
import app.modules.platform.roles.model          # noqa: F401
import app.modules.platform.users.model          # noqa: F401
import app.modules.platform.esign.model          # noqa: F401
import app.modules.platform.training.model       # noqa: F401
import app.modules.platform.documents.model      # noqa: F401
import app.modules.platform.knowledge.model      # noqa: F401
import app.modules.compliance.dev.software_items.model # noqa: F401
import app.modules.compliance.dev.sdp.model            # noqa: F401
import app.modules.compliance.dev.architecture.model   # noqa: F401
import app.modules.platform.attachments.model     # noqa: F401
import app.modules.compliance.dev.units.model                   # noqa: F401
import app.modules.compliance.dev.integration_tests.model       # noqa: F401
import app.modules.compliance.dev.system_testing.model          # noqa: F401
import app.modules.compliance.config.config_mgmt.model            # noqa: F401
import app.modules.compliance.problems.capa.model                  # noqa: F401
import app.modules.compliance.plans.model                 # noqa: F401
import app.modules.compliance.maintenance.feedback.model              # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
