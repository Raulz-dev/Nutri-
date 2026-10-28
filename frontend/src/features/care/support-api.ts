import { apiRequest } from "../../lib/http-client";

export type SupportContact = {
  id: string;
  name: string;
  active: boolean;
  unread: number;
};
export type SupportMessage = {
  id: string;
  sender_id: string;
  text: string;
  sent_at: string;
  read_at: string | null;
};
type SupportMessagePage = {
  items: SupportMessage[];
  next_cursor: string | null;
};

export const listSupportContacts = (
  token: string,
  offset: number,
  search: string,
) =>
  apiRequest<{ items: SupportContact[]; total: number }>(
    `/support/contacts?offset=${offset}&search=${encodeURIComponent(search)}`,
    { token },
  );

export const listSupportMessages = (
  token: string,
  contactId: string,
  before?: string,
) =>
  apiRequest<SupportMessagePage>(
    `/support/${contactId}/messages${before ? `?before=${before}` : ""}`,
    { token },
  );

export const markSupportMessagesRead = (
  token: string,
  contactId: string,
  ids: string[],
) =>
  apiRequest<void>(`/support/${contactId}/read`, {
    token,
    method: "POST",
    body: JSON.stringify({ ids }),
  });

export const sendSupportMessage = (
  token: string,
  contactId: string,
  id: string,
  text: string,
) =>
  apiRequest<SupportMessage>(`/support/${contactId}/messages`, {
    token,
    method: "POST",
    body: JSON.stringify({ id, text }),
  });
