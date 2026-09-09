# +Saúde

Backend da plataforma de acompanhamento nutricional +Saúde.

O módulo inicial oferece CRUD de usuários, autenticação JWT, controle de perfis,
bloqueio de contas e recuperação de senha.

O projeto segue o mesmo modelo arquitetural do sistema de cinema:

```text
router -> caso de uso -> domínio -> repositório -> PostgreSQL
```

## Requisitos

- Python 3.14
- PostgreSQL
- uv

## Configuração

```bash
cd backend
cp .env.example .env
uv sync --dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --reload-dir app
```

Swagger: `http://127.0.0.1:8000/docs`

## Testes e qualidade

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

## Primeiro administrador

Defina `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente e execute:

```bash
cd backend
uv run python -m app.cli.create_admin
```
