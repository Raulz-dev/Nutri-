import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { listMessages, markMessagesRead, sendMessage, type ConversationRecord, type MessageCursor, type MessageRecord } from "./interaction-api";
import { ErrorToast } from "../../components/ui/ErrorToast";

export function CareConversationPanel({ conversation, onRead }: {
  conversation: ConversationRecord;
  onRead: () => void;
}) {
  const { currentUser, session } = useAuth();
  const token = session?.accessToken ?? "";
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const history = useRef<HTMLDivElement>(null);
  const cursorInitializedRef = useRef(false);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const otherName = currentUser?.id === conversation.patient_id ? conversation.nutritionist_name : conversation.patient_name;

  const load = useCallback(async (cursor?: MessageCursor) => {
    const page = await listMessages(token, conversation.id, cursor);
    setMessages(current => {
      const byId = new Map([...current, ...page.items].map(message => [message.id, message]));
      return [...byId.values()].sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.id.localeCompare(b.id));
    });
    const unreadIds = page.items.filter(message => message.sender_id !== currentUser?.id && !message.read_at).map(message => message.id);
    if (unreadIds.length) {
      await markMessagesRead(token, conversation.id, unreadIds);
      onReadRef.current();
    }
    if (cursor || !cursorInitializedRef.current) {
      cursorInitializedRef.current = true;
      setOlderCursor(page.next_cursor);
    }
  }, [token, conversation.id, currentUser?.id]);

  useEffect(() => {
    let active = true;
    cursorInitializedRef.current = false;
    setOlderCursor(null);
    setMessages([]);
    setLoading(true);
    setError("");
    void load().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar mensagens."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void load().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao atualizar mensagens."));
      }
    };
    const interval = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [conversation.id, messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const id = pendingId || crypto.randomUUID();
    setPendingId(id);
    setBusy(true);
    setError("");
    let sent: MessageRecord;
    try {
      sent = await sendMessage(token, conversation.id, id, draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar a mensagem.");
      setBusy(false);
      return;
    }
    setDraft("");
    setPendingId("");
    setBusy(false);
    setMessages(current => current.some(message => message.id === sent.id) ? current : [...current, sent]);
    try {
      await load();
    } catch {
      setError("Mensagem enviada, mas o histórico não foi atualizado. Tente atualizar a conversa.");
    }
  }

  return <article className="chat-panel shared-conversation">
    <ErrorToast message={error} />
    <header className="chat-header"><div><strong>{otherName}</strong><small>{conversation.active ? "Conversa ativa" : "Histórico somente leitura"}</small></div></header>
    <div className="chat-history" ref={history} aria-live="polite">
      {olderCursor && <button type="button" disabled={loadingOlder} onClick={() => { setLoadingOlder(true); void load(olderCursor).catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar mensagens.")).finally(() => setLoadingOlder(false)); }}>Carregar mensagens anteriores</button>}
      {loading && <p className="nutri-empty">Carregando mensagens...</p>}
      {!loading && error && <button type="button" onClick={() => { setError(""); void load().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao carregar mensagens.")); }}>Atualizar conversa</button>}
      {!loading && !messages.length && !error && <p className="nutri-empty">Comece a conversa.</p>}
      {messages.map(message => <div className={`chat-message ${message.sender_id === currentUser?.id ? "is-patient" : ""}`} key={message.id}>
        <div><p>{message.text}</p><time dateTime={message.sent_at}>{new Date(message.sent_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>
      </div>)}
    </div>
    {conversation.active && <form className="chat-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="conversation-draft">Mensagem</label>
      <textarea id="conversation-draft" value={draft} maxLength={4000} onChange={event => { setDraft(event.target.value); setPendingId(""); }} placeholder="Escreva uma mensagem..." />
      <button type="submit" disabled={!draft.trim() || busy}>Enviar</button>
    </form>}
  </article>;
}
