import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { apiRequest } from "../../lib/http-client";
import { useAuth } from "../auth/useAuth";
import { ErrorToast } from "../../components/ui/ErrorToast";
import "../patient/styles/patient.css";
import "./support.css";

type Contact = { id: string; name: string; active: boolean; unread: number };
type Message = {
  id: string;
  sender_id: string;
  text: string;
  sent_at: string;
  read_at: string | null;
};
type Page = { items: Message[]; next_cursor: string | null };
export function SupportPanel() {
  const { session } = useAuth();
  const token = session!.accessToken;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const contactRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++contactRequest.current;
    const page = await apiRequest<{ items: Contact[]; total: number }>(
      `/support/contacts?offset=${offset}&search=${encodeURIComponent(search)}`,
      { token },
    );
    if (request === contactRequest.current) {
      setContacts(page.items);
      setTotal(page.total);
    }
  }, [token, offset, search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void load()
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      contactRequest.current += 1;
    };
  }, [load]);
  return (
    <section className="support-panel">
      <ErrorToast message={error} />
      <aside className="support-directory">
        <label>
          Buscar contato
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        {loading && <p role="status">Carregando contatos...</p>}
        {!loading && !contacts.length && <p>Nenhum contato encontrado.</p>}
        <div className="support-contacts">
          {contacts.map((contact) => (
            <button
              type="button"
              key={contact.id}
              aria-pressed={selected?.id === contact.id}
              onClick={() => setSelected(contact)}
            >
              {contact.name}
              {contact.unread ? ` (${contact.unread} não lidas)` : ""}
              {!contact.active ? " — bloqueado" : ""}
            </button>
          ))}
        </div>
        <nav aria-label="Páginas de contatos">
          <button
            disabled={offset === 0}
            onClick={() => setOffset((value) => value - 20)}
          >
            Anterior
          </button>
          <span> {total} contatos </span>
          <button
            disabled={offset + 20 >= total}
            onClick={() => setOffset((value) => value + 20)}
          >
            Próxima
          </button>
        </nav>
      </aside>
      {selected ? (
        <SupportConversation
          key={selected.id}
          contact={selected}
          onRead={load}
        />
      ) : (
        <p>Selecione um contato para conversar.</p>
      )}
    </section>
  );
}
function SupportConversation({
  contact,
  onRead,
}: {
  contact: Contact;
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
      setMessages((current) =>
        [
          ...new Map(
            [...current, ...page.items].map((item) => [item.id, item]),
          ).values(),
        ].sort(
          (a, b) =>
            a.sent_at.localeCompare(b.sent_at) || a.id.localeCompare(b.id),
        ),
      );
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
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        void load().catch((reason) => setError(reason.message));
    };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    return () => window.clearInterval(interval);
  }, [load]);
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
            onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              event.preventDefault();
              if (!event.repeat && !busy && draft.trim()) event.currentTarget.form?.requestSubmit();
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
