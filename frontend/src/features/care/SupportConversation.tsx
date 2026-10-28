import "./conversation.css";
import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  listSupportMessages,
  markSupportMessagesRead,
  sendSupportMessage,
  type SupportContact,
  type SupportMessage,
} from "./support-api";
import { MessageBubble, MessageComposer } from "./ConversationParts";
import { useAuth } from "../auth/useAuth";
import { ErrorToast } from "../../components/ui/ErrorToast";
import { mergeMessages } from "./message-history";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";

export function SupportConversation({
  contact,
  onRead,
}: {
  contact: SupportContact;
  onRead: () => Promise<void>;
}) {
  const { session, currentUser } = useAuth();
  const token = session!.accessToken;
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initialized = useRef(false);
  const load = useCallback(
    async (before?: string) => {
      const page = await listSupportMessages(token, contact.id, before);
      setMessages((current) => mergeMessages(current, page.items));
      if (before || !initialized.current) {
        initialized.current = true;
        setCursor(page.next_cursor);
      }
      const ids = page.items
        .filter((item) => item.sender_id !== currentUser!.id && !item.read_at)
        .map((item) => item.id);
      if (ids.length) {
        await markSupportMessagesRead(token, contact.id, ids);
        await onRead();
      }
    },
    [contact.id, token, currentUser, onRead],
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
      await sendSupportMessage(token, contact.id, id, draft);
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
          <MessageBubble
            key={item.id}
            text={item.text}
            own={item.sender_id === currentUser!.id}
          >
            <time>{new Date(item.sent_at).toLocaleString("pt-BR")}</time>
          </MessageBubble>
        ))}
      </div>
      {contact.active && (
        <MessageComposer
          id="support-draft"
          draft={draft}
          busy={busy}
          onSubmit={send}
          onChange={(value) => {
            setDraft(value);
            setPendingId("");
          }}
        />
      )}
    </article>
  );
}
