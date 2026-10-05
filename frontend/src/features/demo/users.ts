import type { User, UserRole, UserStatus } from "../users/types";
import { recordAudit } from "../admin/admin-audit";

const STORAGE_KEY = "mais-saude-admin-users-v1";

export type AdminUser = User & {
  createdAt: string;
  lastAccessAt: string | null;
};

const initialUsers: AdminUser[] = [
  demoUser(
    "demo-01",
    "Marina Costa",
    "marina@nutrimais.demo",
    "nutritionist",
    "active",
    5,
    1,
  ),
  demoUser(
    "demo-02",
    "Paulo Mendes",
    "paulo@nutrimais.demo",
    "nutritionist",
    "active",
    4,
    3,
  ),
  demoUser(
    "demo-03",
    "Camila Ferreira",
    "camila@nutrimais.demo",
    "patient",
    "active",
    4,
    0,
  ),
  demoUser(
    "demo-04",
    "Lucas Rocha",
    "lucas@nutrimais.demo",
    "patient",
    "active",
    3,
    2,
  ),
  demoUser(
    "demo-05",
    "Beatriz Lima",
    "beatriz@nutrimais.demo",
    "patient",
    "blocked",
    3,
    null,
  ),
  demoUser(
    "demo-06",
    "Ana Souza",
    "ana@nutrimais.demo",
    "nutritionist",
    "active",
    2,
    4,
  ),
  demoUser(
    "demo-07",
    "Rafael Alves",
    "rafael@nutrimais.demo",
    "patient",
    "active",
    2,
    1,
  ),
  demoUser(
    "demo-08",
    "Juliana Martins",
    "juliana@nutrimais.demo",
    "patient",
    "active",
    1,
    6,
  ),
  demoUser(
    "demo-09",
    "Bruno Carvalho",
    "bruno@nutrimais.demo",
    "patient",
    "blocked",
    1,
    null,
  ),
  demoUser(
    "demo-10",
    "Fernanda Nunes",
    "fernanda@nutrimais.demo",
    "nutritionist",
    "active",
    1,
    2,
  ),
  demoUser(
    "demo-11",
    "Diego Ramos",
    "diego@nutrimais.demo",
    "patient",
    "active",
    0,
    3,
  ),
  demoUser(
    "demo-12",
    "Larissa Gomes",
    "larissa@nutrimais.demo",
    "patient",
    "active",
    0,
    0,
  ),
  demoUser(
    "demo-13",
    "Renata Freitas",
    "renata.admin@nutrimais.demo",
    "admin",
    "active",
    0,
    1,
  ),
];

export type AdminUserInput = {
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

export function readAdminUsers(): AdminUser[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialUsers.map((user) => ({ ...user }));

  try {
    const users = JSON.parse(stored) as unknown;
    if (!Array.isArray(users) || !users.every(isUser))
      return initialUsers.map((user) => ({ ...user }));
    const migrated = users.map((user, index) => migrateUser(user, index));
    return migrated;
  } catch {
    return initialUsers.map((user) => ({ ...user }));
  }
}

export function createAdminUser(users: AdminUser[], input: AdminUserInput) {
  const created = {
    id: crypto.randomUUID(),
    ...normalizeInput(input),
    createdAt: new Date().toISOString(),
    lastAccessAt: null,
  };
  recordAudit(
    "create",
    created.name,
    created.role === "nutritionist"
      ? "Nutricionista cadastrada"
      : "Usuário cadastrado",
  );
  return persist([...users, created]);
}

export function updateAdminUser(
  users: AdminUser[],
  userId: string,
  input: AdminUserInput,
) {
  const user = users.find((item) => item.id === userId);
  if (user) recordAudit("update", user.name, "Dados do usuário atualizados");
  return persist(
    users.map((item) =>
      item.id === userId ? { ...item, ...normalizeInput(input) } : item,
    ),
  );
}

export function toggleAdminUserStatus(users: AdminUser[], userId: string) {
  const user = users.find((item) => item.id === userId);
  if (user)
    recordAudit(
      "status",
      user.name,
      `Usuário ${user.status === "active" ? "bloqueado" : "ativado"}`,
    );
  return persist(
    users.map((user) =>
      user.id === userId
        ? { ...user, status: user.status === "active" ? "blocked" : "active" }
        : user,
    ),
  );
}

export function deleteAdminUser(users: AdminUser[], userId: string) {
  const user = users.find((item) => item.id === userId);
  if (user) recordAudit("delete", user.name, "Usuário excluído");
  return persist(users.filter((user) => user.id !== userId));
}

function normalizeInput(input: AdminUserInput): AdminUserInput {
  return {
    ...input,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
  };
}

function persist(users: AdminUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event("nutri-demo-change"));
  return users;
}

function isUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<User>;
  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    ["admin", "nutritionist", "patient"].includes(user.role ?? "") &&
    ["active", "blocked"].includes(user.status ?? "")
  );
}

function migrateUser(user: User | AdminUser, index: number): AdminUser {
  const enriched = user as Partial<AdminUser>;
  return {
    ...user,
    createdAt: isValidDate(enriched.createdAt)
      ? enriched.createdAt
      : relativeDate(index % 6, (index * 3) % 24),
    lastAccessAt:
      enriched.lastAccessAt === null || isValidDate(enriched.lastAccessAt)
        ? (enriched.lastAccessAt ?? null)
        : relativeAccess((index * 2) % 9),
  };
}

function demoUser(
  id: string,
  name: string,
  email: string,
  role: UserRole,
  status: UserStatus,
  monthsAgo: number,
  accessDaysAgo: number | null,
): AdminUser {
  return {
    id,
    name,
    email,
    role,
    status,
    createdAt: relativeDate(monthsAgo, Number(id.slice(-2)) % 24),
    lastAccessAt: accessDaysAgo === null ? null : relativeAccess(accessDaysAgo),
  };
}

function relativeDate(monthsAgo: number, dayOffset: number) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(Math.max(1, Math.min(25, date.getDate() - dayOffset)));
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString();
}

function relativeAccess(daysAgo: number) {
  const date = new Date();
  date.setHours(9 + (daysAgo % 8), 20, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
