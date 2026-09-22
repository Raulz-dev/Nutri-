# Nutri +

Plataforma de acompanhamento nutricional Nutri +, com backend FastAPI e frontend React.

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

## Frontend

Em outro terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Aplicação: `http://127.0.0.1:5173/login`

Após o login, o usuário é direcionado para `/app/paciente`, que atualmente funciona
como protótipo com dados fictícios. Cadastro público aceita apenas pacientes.
Recuperação de senha depende de SMTP configurado.

O link de demonstração abre `/app/paciente`, um protótipo com dados fictícios.
Plano alimentar, substituições, evolução, consultas e mensagens ainda não possuem
integração com o backend ou persistência. As quantidades são exemplos do protótipo,
não uma prescrição nutricional validada. Botões de notificações, detalhes de consulta
e mensagens ainda não executam ações.

O frontend tem verificação de tipos e build, mas ainda não possui scripts de lint
ou testes automatizados. Use uma combinação compatível de Node.js e npm; o npm 11
instalado requer Node.js 20.17+ ou 22.9+.

Validação do frontend:

```bash
cd frontend
npm run typecheck
npm run build
npm audit
```

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
