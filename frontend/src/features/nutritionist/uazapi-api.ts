import { apiRequest } from "../../lib/http-client";

export type UazapiPairing = {
  connected: boolean;
  logged_in: boolean;
  state: string;
  qr_code: string | null;
};

export const getUazapiPairing = (token: string) =>
  apiRequest<UazapiPairing>("/whatsapp/uazapi/pairing", { token });

export const connectUazapi = (token: string) =>
  apiRequest<UazapiPairing>("/whatsapp/uazapi/connect", {
    token,
    method: "POST",
  });

export type UazapiConversation = {
  id: string;
  title: string;
  last_message_at: string | null;
};

export type UazapiMessage = {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  media_available?: boolean;
  text: string | null;
  occurred_at: string;
  delivery_status:
    | "sending"
    | "unknown"
    | "failed"
    | "sent"
    | "delivered"
    | "read"
    | "played"
    | null;
};

const conversationsPath = "/whatsapp/uazapi/conversations";
export const uazapiConversations = (token: string, limit: number, offset = 0) =>
  apiRequest<UazapiConversation[]>(
    `${conversationsPath}?limit=${limit}&offset=${offset}`,
    { token },
  );

export const startUazapiConversation = (
  token: string,
  patient_id: string,
  phone: string,
) =>
  apiRequest<UazapiConversation>(conversationsPath, {
    token,
    method: "POST",
    body: JSON.stringify({ patient_id, phone }),
  });

export const recoverUazapiMessages = (token: string, offset: number) =>
  apiRequest<{ next_offset: number | null; skipped: number }>(
    `/whatsapp/uazapi/recover?offset=${offset}`,
    { token, method: "POST" },
  );

export const uazapiHistory = (token: string, chatId: string, before?: string) =>
  apiRequest<{
    items: UazapiMessage[];
    next_before: string | null;
    phone?: string | null;
    patient_id?: string | null;
  }>(
    `${conversationsPath}/${chatId}/messages${before ? `?before=${before}` : ""}`,
    { token },
  );

export type UazapiUpload = { name: string; mime_type: string; base64: string };

export const uazapiSend = (
  token: string,
  chatId: string,
  requestId: string,
  text: string,
  attachment?: UazapiUpload,
) =>
  apiRequest<UazapiMessage>(`${conversationsPath}/${chatId}/messages`, {
    token,
    method: "POST",
    body: JSON.stringify({ request_id: requestId, text, attachment }),
  });

export const uazapiMedia = (token: string, chatId: string, messageId: string) =>
  apiRequest<{ mime_type: string; base64: string }>(
    `${conversationsPath}/${chatId}/messages/${messageId}/media`,
    { token },
  );

export type UazapiPatientInput = { name: string; email: string; cpf: string };

export const addUazapiPatient = (
  token: string,
  chatId: string,
  data: UazapiPatientInput,
) =>
  apiRequest<{ patient_id: string }>(`${conversationsPath}/${chatId}/patient`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const uazapiAvatar = (token: string, chatId: string) =>
  apiRequest<{ url: string | null }>(`${conversationsPath}/${chatId}/avatar`, {
    token,
  });
