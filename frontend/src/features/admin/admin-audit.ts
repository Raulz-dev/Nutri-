const STORAGE_KEY = "mais-saude-admin-audit-v1";

export type AuditAction = "create" | "update" | "status" | "delete" | "link" | "unlink" | "settings" | "password";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  target: string;
  detail: string;
  occurredAt: string;
};

const initialEntries: AuditEntry[] = [
  seed("status", "Beatriz Lima", "Usuário bloqueado", 3),
  seed("link", "Camila Ferreira", "Vinculada à nutricionista Marina Costa", 18),
  seed("create", "Fernanda Nunes", "Nutricionista cadastrada", 52),
];

export function readAuditEntries(): AuditEntry[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(initialEntries);
  try {
    const entries = JSON.parse(stored) as unknown;
    return Array.isArray(entries) ? entries as AuditEntry[] : structuredClone(initialEntries);
  } catch {
    return structuredClone(initialEntries);
  }
}

export function recordAudit(action: AuditAction, target: string, detail: string) {
  const entries = readAuditEntries();
  const latest = entries[0];
  if (latest?.action === action && latest.target === target && latest.detail === detail && Date.now() - Date.parse(latest.occurredAt) < 1_500) return;
  persist([{ id: crypto.randomUUID(), action, target, detail, occurredAt: new Date().toISOString() }, ...entries].slice(0, 100));
}

function persist(entries: AuditEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries;
}

function seed(action: AuditAction, target: string, detail: string, hoursAgo: number): AuditEntry {
  return { id: `audit-${action}-${hoursAgo}`, action, target, detail, occurredAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString() };
}
