import { useCallback, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/http-client";
import { useAuth } from "../auth/useAuth";
import { ErrorToast } from "../../components/ui/ErrorToast";
import { mergeMessages } from "./message-history";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";

export type SupportContact = {
  id: string;
  name: string;
  active: boolean;
  unread: number;
};
type Message = {
  id: string;
  sender_id: string;
  text: string;
  sent_at: string;
  read_at: string | null;
};
type Page = { items: Message[]; next_cursor: string | null };

export function SupportConversation({
  contact,
  onRead,
}: {
  contact: SupportContact;
  onRead: () => Promise<void>;
}) {
  const { session, currentUser } = useAuth();
  const token = session!.accessToken;
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initialized = useRef(false);
  const base = `/support/${contact.id}`;
  const load = useCallback(
    async (before?: string) => {
      const page = await apiRequest<Page>(
        `${base}/messages${before ? `?before=${before}` : ""}`,
        { token },
      );
      setMessages((current) => mergeMessages(current, page.items));
      if (before || !initialized.current) {
        initialized.current = true;
        setCursor(page.next_cursor);
      }
      const ids = page.items
        .filter((item) => item.sender_id !== currentUser!.id && !item.read_at)
        .map((item) => item.id);
      if (ids.length) {
        await apiRequest(`${base}/read`, {
          token,
          method: "POST",
          body: JSON.stringify({ ids }),
        });
        await onRead();
      }
    },
    [base, token, currentUser, onRead],
  );
  useVisiblePolling(
    load,
    (reason) => {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao atualizar mensagens.",
      );
    },
    true,
  );
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError("");
    const id = pendingId || crypto.randomUUID();
    setPendingId(id);
    try {
      await apiRequest(`${base}/messages`, {
        token,
        method: "POST",
        body: JSON.stringify({ id, text: draft }),
      });
      setDraft("");
      setPendingId("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="chat-panel shared-conversation">
      <ErrorToast message={error} />
      <header className="chat-header">
        <strong>{contact.name}</strong>
      </header>
      <div className="chat-history" aria-live="polite">
        {cursor && (
          <button
            onClick={() =>
              void load(cursor).catch((reason) => setError(reason.message))
            }
          >
            Carregar mensagens anteriores
          </button>
        )}
        {!messages.length && <p>Nenhuma mensagem.</p>}
        {messages.map((item) => (
          <div
            className={`chat-message ${item.sender_id === currentUser!.id ? "is-patient" : ""}`}
            key={item.id}
          >
            <div>
              <p>{item.text}</p>
              <time>{new Date(item.sent_at).toLocaleString("pt-BR")}</time>
            </div>
          </div>
        ))}
      </div>
      {contact.active && (
        <form className="chat-composer" onSubmit={send}>
          <label className="sr-only" htmlFor="support-draft">
            Mensagem
          </label>
          <textarea
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              )
                return;
              event.preventDefault();
              if (!event.repeat && !busy && draft.trim())
                event.currentTarget.form?.requestSubmit();
            }}
            id="support-draft"
            maxLength={4000}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setPendingId("");
            }}
            placeholder="Escreva uma mensagem..."
          />
          <button disabled={busy || !draft.trim()}>Enviar</button>
        </form>
      )}
    </article>
  );
}
