from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config.settings import get_settings

settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.sql_echo,
    pool_pre_ping=True,
)
