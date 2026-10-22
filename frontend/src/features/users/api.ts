import { apiRequest } from "../../lib/http-client";
import type { Page } from "../care/api";
import type { User } from "./types";

export function getCurrentUser(accessToken: string) {
  return apiRequest<User>("/users/me", { token: accessToken });
}

export const listUsers = (token: string, offset = 0, limit = 100) =>
  apiRequest<Page<User>>(`/users?offset=${offset}&limit=${limit}`, { token });
export const updateUser = (token: string, id: string, data: { name?: string; email?: string; status?: "active" | "blocked" }) =>
  apiRequest<User>(`/users/${id}`, { method: "PATCH", token, body: JSON.stringify(data) });
export const deactivateUser = (token: string, id: string) =>
  apiRequest<void>(`/users/${id}`, { method: "DELETE", token });
export async function listAllUsers(token: string) {
  const users: User[] = [];
  for (let offset = 0;; offset += 100) {
    const page = await listUsers(token, offset, 100);
    users.push(...page.items);
    if (users.length >= page.total || page.items.length === 0) return users;
  }
}

export const completeCpf = (token: string, cpf: string, current_password: string) =>
  apiRequest<{ cpf: string }>("/account/cpf", { token, method: "PUT", body: JSON.stringify({ cpf, current_password }) });
