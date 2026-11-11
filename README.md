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

## Vincular WhatsApp UazAPI

Cada nutricionista usa uma instância existente. Após aplicar as migrações do
backend, configure `UAZAPI_BASE_URL` e `OUTBOX_ENCRYPTION_KEY` no backend.
Mantenha uma cópia protegida da chave: ela é necessária para ler os tokens
armazenados.

```bash
cd backend
uv run python -m app.cli.link_uazapi UUID_DO_NUTRICIONISTA
```

O comando pede o token sem exibi-lo e consulta apenas o status da instância
para confirmar seu ID. Para importar a instância do piloto já configurada no
ambiente, acrescente `--from-env`. Repita para cada profissional com o token
da respectiva instância. O nutricionista usa **Mensagens → WhatsApp** para
parear. O QR e o status usam o vínculo salvo no banco.

### Vincular automaticamente pelo QR Code

Para habilitar a criação automática, configure `UAZAPI_ADMIN_TOKEN` com o
token administrativo do mesmo servidor de `UAZAPI_BASE_URL`. Mantenha essa
credencial no backend. Depois, cada nutricionista abre **Mensagens → WhatsApp**,
clica em **Conectar WhatsApp** e escaneia o QR Code. O botão usa a instância
salva quando já existe vínculo.

Para configurar automaticamente o webhook nas instâncias novas, preencha
`UAZAPI_WEBHOOK_BASE_URL` com a URL HTTPS pública do backend, sem `/api/v1`.
Se a criação expirar, a próxima tentativa consulta a instância reservada.
Se a consulta ainda não encontrar a instância, o backend aguarda pelo menos
cinco minutos desde a última tentativa antes de solicitar uma nova criação.

### Receber mensagens

O comando de vínculo exibe o caminho do webhook para a conexão. Acrescente-o
ao domínio HTTPS do backend e configure essa URL no webhook da instância UazAPI.
Selecione os eventos `messages` e `messages_update` e mantenha
`addUrlEvents` e `addUrlTypesMessages` desativados. Use o webhook por instância
e inclua eventos de mensagens enviadas pela API para que o backend possa
reconciliar envios sem confirmação.

O backend confere o token do evento com o token criptografado do vínculo.
Cada mensagem recebida é gravada com sua conversa e remetente. Repetições
do mesmo ID na mesma conexão recebem sucesso sem criar novos registros.
Mensagens recebidas exibem imagens, áudio e prévia de PDF na conversa.
O PDF também pode ser aberto ou baixado. A mídia é solicitada à UazAPI
quando a conversa é aberta.
O envio aceita arquivos de até 10 MiB, com limite próprio para o JSON em
base64 nessa rota; não é necessário aumentar `MAX_REQUEST_BYTES` globalmente.
O download aceita até 20 MiB e interrompe respostas excessivas durante a
transferência, antes de interpretar o JSON.

Em **Mensagens → WhatsApp**, abra uma conversa recebida para consultar o
histórico e responder com texto. A tela consulta atualizações a cada 10
segundos enquanto está visível. O histórico começa com as mensagens recebidas
pelo webhook e as enviadas pelo +Saúde.

Cada envio tem um identificador reservado no banco antes da chamada à
UazAPI. Se o resultado da chamada for incerto, o sistema exibe **Envio sem
confirmação** e aguarda a confirmação do provedor sem reenviar
automaticamente. O mesmo identificador sempre consulta a tentativa já
registrada.

A UazAPI informa que falhas de entrega HTTP não são reenviadas automaticamente.
Acompanhe os erros de entrega no provedor.
