import { apiRequest } from "../../lib/http-client";
import type { Page } from "../care/api";

export type WhatsAppContact = {
  id: string;
  patient_id: string;
  patient_name: string;
  phone: string;
  active: boolean;
  window_open: boolean;
  unread: number;
};
export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  status:
    | "received"
    | "queued"
    | "sending"
    | "unknown"
    | "sent"
    | "delivered"
    | "read"
    | "failed";
  occurred_at: string;
  read_at: string | null;
  error_code: string | null;
};
export type WhatsAppConnection = {
  configured: boolean;
  active: boolean;
  sends_enabled: boolean;
};
export const whatsappAvailable = (token: string) =>
  apiRequest<{ enabled: boolean }>("/whatsapp/availability", { token });
export const whatsappConnection = (token: string) =>
  apiRequest<WhatsAppConnection>("/whatsapp/connection", { token });
export const whatsappContacts = (token: string, offset = 0) =>
  apiRequest<Page<WhatsAppContact>>(
    `/whatsapp/contacts?offset=${offset}&limit=50`,
    { token },
  );
export const associateWhatsAppContact = (
  token: string,
  patient_id: string,
  phone: string,
) =>
  apiRequest<{ id: string }>("/whatsapp/contacts", {
    token,
    method: "POST",
    body: JSON.stringify({ patient_id, phone }),
  });
export const whatsappMessages = (
  token: string,
  contact: string,
  before?: string,
) =>
  apiRequest<{ items: WhatsAppMessage[]; next_cursor: string | null }>(
    `/whatsapp/contacts/${contact}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    { token },
  );
export const sendWhatsAppMessage = (
  token: string,
  contact: string,
  id: string,
  text: string,
) =>
  apiRequest<WhatsAppMessage>(`/whatsapp/contacts/${contact}/messages`, {
    token,
    method: "POST",
    body: JSON.stringify({ id, text }),
  });
export const readWhatsAppMessages = (
  token: string,
  contact: string,
  ids: string[],
) =>
  apiRequest<void>(`/whatsapp/contacts/${contact}/read`, {
    token,
    method: "POST",
    body: JSON.stringify({ ids }),
  });
