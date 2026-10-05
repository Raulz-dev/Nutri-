import { recordAudit } from "./admin-audit";

const STORAGE_KEY = "mais-saude-admin-settings-v1";

export type AdminSettings = { name: string; email: string; emailNotifications: boolean };

export function readAdminSettings(fallback: AdminSettings): AdminSettings {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return fallback;
  try {
    const value = JSON.parse(stored) as Partial<AdminSettings>;
    return typeof value.name === "string" && typeof value.email === "string" && typeof value.emailNotifications === "boolean" ? value as AdminSettings : fallback;
  } catch {
    return fallback;
  }
}

export function saveAdminSettings(settings: AdminSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("admin-settings-changed", { detail: settings }));
  recordAudit("settings", settings.name, "Configurações da conta atualizadas");
  return settings;
}

export function recordPasswordChange(name: string) {
  recordAudit("password", name, "Senha demonstrativa alterada");
}
