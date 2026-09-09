import asyncio
import os

from app.database.session import AsyncSessionLocal
from app.security.password import PasswordHasher
from app.users.domain.enums import UserRole
from app.users.domain.user import User
from app.users.infrastructure.repository import SQLAlchemyUserRepository


async def create_admin() -> None:
    name = os.environ.get("ADMIN_NAME")
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not name or not email or not password:
        raise RuntimeError("Defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD.")

    async with AsyncSessionLocal() as db:
        repository = SQLAlchemyUserRepository(db)
        if await repository.find_by_email(email) is not None:
            print("Administrador já cadastrado.")
            return

        user = User(
            name=name,
            email=email,
            password_hash=PasswordHasher().hash(password),
            role=UserRole.ADMIN,
        )
        await repository.create(user)
        await db.commit()
        print("Administrador criado com sucesso.")


if __name__ == "__main__":
    asyncio.run(create_admin())
