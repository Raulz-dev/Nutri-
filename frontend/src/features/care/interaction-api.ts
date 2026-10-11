import { apiRequest } from "../../lib/http-client";
import type { Page } from "./api";

export type AppointmentRecord = {
  id: string;
  patientId: string;
  patientName: string;
  nutritionistId: string;
  authorId: string;
  date: string;
  time: string;
  format: "Presencial" | "Online";
  location: string;
  guidance: string;
  status: "scheduled" | "completed" | "cancelled";
  revision: number;
};

type ApiAppointment = {
  id: string; patient_id: string; patient_name: string; nutritionist_id: string; author_id: string;
  appointment_on: string; appointment_at: string; format: AppointmentRecord["format"];
  location: string; guidance: string; status: AppointmentRecord["status"]; revision: number;
};

function appointmentFromApi(row: ApiAppointment): AppointmentRecord {
  return {
    id: row.id, patientId: row.patient_id, patientName: row.patient_name,
    nutritionistId: row.nutritionist_id, authorId: row.author_id,
    date: row.appointment_on, time: row.appointment_at.slice(0, 5),
    format: row.format, location: row.location, guidance: row.guidance,
    status: row.status, revision: row.revision,
  };
}

function appointmentContent(row: AppointmentRecord) {
  return {
    patient_id: row.patientId, appointment_on: row.date, appointment_at: row.time,
    format: row.format, location: row.location, guidance: row.guidance,
  };
}

export async function listAppointments(token: string, offset = 0, filters?: { patientId?: string; date?: string; status?: string; limit?: number; upcoming?: boolean }) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(filters?.limit ?? 10) });
  if (filters?.patientId) params.set("patient_id", filters.patientId);
  if (filters?.date) params.set("appointment_on", filters.date);
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.upcoming) params.set("upcoming", "true");
  const path = `/appointments?${params}`;
  const page = await apiRequest<Page<ApiAppointment>>(path, { token });
  return { ...page, items: page.items.map(appointmentFromApi) };
}

export async function getNextAppointment(token: string) {
  const row = await apiRequest<ApiAppointment | null>("/appointments/next", { token });
  return row ? appointmentFromApi(row) : null;
}

export async function createAppointment(token: string, row: AppointmentRecord) {
  const saved = await apiRequest<ApiAppointment>("/appointments", { method: "POST", token,
    body: JSON.stringify({ id: row.id, ...appointmentContent(row) }) });
  return appointmentFromApi(saved);
}

export async function updateAppointment(token: string, row: AppointmentRecord) {
  const saved = await apiRequest<ApiAppointment>(`/appointments/${row.id}`, { method: "PUT", token,
    body: JSON.stringify({ ...appointmentContent(row), expected_revision: row.revision }) });
  return appointmentFromApi(saved);
}

export async function changeAppointmentStatus(token: string, row: AppointmentRecord, status: "completed" | "cancelled") {
  const saved = await apiRequest<ApiAppointment>(`/appointments/${row.id}/status`, { method: "POST", token,
    body: JSON.stringify({ status, expected_revision: row.revision }) });
  return appointmentFromApi(saved);
}

export type ConversationRecord = {
  id: string; patient_id: string; patient_name: string;
  nutritionist_id: string; nutritionist_name: string;
  active: boolean; started_at: string; ended_at: string | null; unread: number;
};

export type MessageRecord = {
  id: string; assignment_id: string; sender_id: string; text: string;
  sent_at: string; read_at: string | null;
};

export type MessageCursor = { sent_at: string; id: string };
export type MessagePage = { items: MessageRecord[]; total: number; limit: number; next_cursor: MessageCursor | null };

export const listConversations = (token: string, offset = 0, limit = 20) =>
  apiRequest<Page<ConversationRecord>>(`/conversations?offset=${offset}&limit=${limit}`, { token });

export async function listAllConversations(token: string) {
  const items: ConversationRecord[] = [];
  for (;;) {
    const page = await listConversations(token, items.length, 100);
    items.push(...page.items);
    if (items.length >= page.total || !page.items.length) return items;
  }
}
export const listMessages = (token: string, conversationId: string, cursor?: MessageCursor) => {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) {
    params.set("before_sent_at", cursor.sent_at);
    params.set("before_id", cursor.id);
  }
  return apiRequest<MessagePage>(`/conversations/${conversationId}/messages?${params}`, { token });
};
export const sendMessage = (token: string, conversationId: string, id: string, text: string) =>
  apiRequest<MessageRecord>(`/conversations/${conversationId}/messages`, { method: "POST", token,
    body: JSON.stringify({ id, text }) });
export const markMessagesRead = (token: string, conversationId: string, ids: string[]) =>
  apiRequest<void>(`/conversations/${conversationId}/read`, { method: "POST", token,
    body: JSON.stringify({ ids }) });
