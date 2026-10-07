import { apiRequest } from "../../lib/http-client";
import type { User } from "../users/types";

export type Page<T> = { items: T[]; total: number; offset: number; limit: number };
export type PatientRow = { id: string; name: string; email: string; status: "active" | "blocked"; deactivated_at: string | null; nutritionist_id: string | null; nutritionist_name: string | null };
export type Assignment = { patient_id: string; nutritionist_id: string; started_at: string };
export type LinkInvitation = { id: string; patient_id: string; patient_name: string; nutritionist_id: string; nutritionist_name: string; expires_at: string };
export type InvitationDeliveryStatus = { user_id: string; status: "pending" | "sent" | "failed" | "expired"; resend_available_at: string | null };

export const listUsers = (token: string, offset = 0, limit = 100) =>
  apiRequest<Page<User>>(`/users?offset=${offset}&limit=${limit}`, { token });
export const listPatients = (token: string, offset = 0, q = "", includeDeactivated = false) =>
  apiRequest<Page<PatientRow>>(`/patients?offset=${offset}&limit=10&q=${encodeURIComponent(q)}${includeDeactivated ? "&include_deactivated=true" : ""}`, { token });
export const getPatient = (token: string, id: string) =>
  apiRequest<PatientRow>(`/patients/${id}`, { token });
export const assignPatient = (token: string, patientId: string, nutritionistId: string) =>
  apiRequest<Assignment>(`/patients/${patientId}/assignment`, { method: "PUT", token,
    body: JSON.stringify({ nutritionist_id: nutritionistId }) });
export const unassignPatient = (token: string, patientId: string) =>
  apiRequest<void>(`/patients/${patientId}/assignment`, { method: "DELETE", token });
export const listLinkInvitations = (token: string) =>
  apiRequest<LinkInvitation[]>("/care-link-invitations", { token });
export const invitePatient = (token: string, email: string) =>
  apiRequest<LinkInvitation>("/care-link-invitations", { method: "POST", token,
    body: JSON.stringify({ patient_email: email }) });
export const acceptLinkInvitation = (token: string, id: string) =>
  apiRequest<Assignment>(`/care-link-invitations/${id}/accept`, { method: "POST", token });
export const declineLinkInvitation = (token: string, id: string) =>
  apiRequest<void>(`/care-link-invitations/${id}/decline`, { method: "POST", token });
export const cancelLinkInvitation = (token: string, id: string) =>
  apiRequest<void>(`/care-link-invitations/${id}`, { method: "DELETE", token });
export const inviteNutritionist = (token: string, name: string, email: string) =>
  apiRequest<User>("/admin/invitations", { method: "POST", token, body: JSON.stringify({ name, email }) });
export const resendInvitation = (token: string, userId: string) =>
  apiRequest<User>(`/admin/invitations/${userId}/resend`, { method: "POST", token });
export const listInvitationStatuses = (token: string) =>
  apiRequest<InvitationDeliveryStatus[]>("/admin/invitations/statuses", { token });
export const acceptInvitation = (token: string, password: string, passwordConfirmation: string) =>
  apiRequest<User>("/auth/invitations/accept", { method: "POST",
    body: JSON.stringify({ token, password, password_confirmation: passwordConfirmation }) });
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
export type AuditEvent = { id: string; action: string; entity_type: string; entity_id: string | null; target_name: string | null; actor_name: string | null; event_data: Record<string,string>; created_at: string };
export const listAudit = (token: string, offset = 0, action = "") =>
  apiRequest<Page<AuditEvent>>(`/admin/audit-events?offset=${offset}&limit=10${action ? `&action=${encodeURIComponent(action)}` : ""}`, { token });
