import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useWhatsAppRealtime } from "../useWhatsAppRealtime";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { useVisiblePolling } from "../../../hooks/useVisiblePolling";
import { useAuth } from "../../auth/useAuth";
import { listPatients, type PatientRow } from "../../care/api";
import { MessageBubble, MessageComposer } from "../../care/ConversationParts";
import "../../care/conversation.css";
import {
  associateWhatsAppContact,
  readWhatsAppMessages,
  sendWhatsAppMessage,
  whatsappConnection,
  whatsappContacts,
  whatsappMessages,
  type WhatsAppContact,
  type WhatsAppConnection,
  type WhatsAppMessage,
} from "../whatsapp-api";

const statusLabel: Record<WhatsAppMessage["status"], string> = {
  received: "Recebida",
  queued: "Na fila",
  sending: "Enviando",
  unknown: "Entrega incerta — confira no WhatsApp antes de enviar novamente",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Não enviada",
};
const reasonText = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Falha ao atualizar WhatsApp.";

export function WhatsAppPanel() {
  const { session } = useAuth();
  const token = session!.accessToken;
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [total, setTotal] = useState(0);
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientId, setPatientId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedCount = useRef(50);
  const generation = useRef(0);
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const refresh = useCallback(async () => {
    const current = generation.current;
    const request = ++requestSequence.current;
    const state = await whatsappConnection(token);
    const all: WhatsAppContact[] = [];
    let count = 0;
    do {
      const page = await whatsappContacts(token, all.length);
      all.push(...page.items);
      count = page.total;
      if (!page.items.length) break;
    } while (all.length < count && all.length < loadedCount.current);
    if (current !== generation.current || request !== requestSequence.current)
      return;
    setConnection(state);
    setContacts(all);
    setTotal(count);
    setLoading(false);
  }, [token]);
  const realtime = useWhatsAppRealtime(token, refresh, (reason) =>
    setError(reasonText(reason)),
  );
  useVisiblePolling(
    refresh,
    (reason) => {
      setError(reasonText(reason));
      setLoading(false);
    },
    true,
    !realtime.connected,
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const all: PatientRow[] = [];
      for (;;) {
        const page = await listPatients(
          token,
          all.length,
          "",
          false,
          false,
          100,
        );
        all.push(...page.items);
        if (!page.items.length || all.length >= page.total) break;
      }
      if (active)
        setPatients(all.filter((patient) => patient.status === "active"));
    })().catch((reason) => {
      if (active) setError(reasonText(reason));
    });
    return () => {
      active = false;
    };
  }, [token]);
  async function associate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await associateWhatsAppContact(token, patientId, phone);
      setPhone("");
      setPatientId("");
      loadedCount.current = Math.max(50, total + 1);
      await refresh();
      setSelectedId(saved.id);
    } catch (reason) {
      setError(reasonText(reason));
    } finally {
      setBusy(false);
    }
  }
  const selected = contacts.find((contact) => contact.id === selectedId);
  return (
    <>
      <ErrorToast message={error} />
      <p role="status">
        {realtime.connected
          ? "Tempo real conectado"
          : "Reconectando · atualização periódica ativa"}
      </p>
      <section className="nutri-card whatsapp-setup">
        <p role="status">
          {!connection
            ? "Consultando configuração…"
            : !connection.configured
              ? "Conexão do piloto ainda não configurada."
              : !connection.active
                ? "Conexão desativada."
                : !connection.sends_enabled
                  ? "Envios pausados. O recebimento continua habilitado."
                  : "Piloto de texto habilitado. O paciente precisa iniciar a conversa pelo WhatsApp."}
        </p>
        {loading && error && (
          <button
            onClick={() => {
              void refresh().catch((reason) => setError(reasonText(reason)));
            }}
          >
            Tentar novamente
          </button>
        )}
        <form className="nutri-form" onSubmit={associate}>
          <div className="nutri-form-grid">
            <label>
              Paciente de teste
              <select
                required
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
              >
                <option value="">Selecione um paciente vinculado</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              WhatsApp autorizado (DDI + DDD + número)
              <input
                required
                inputMode="tel"
                pattern="[1-9][0-9]{7,14}"
                placeholder="Somente números, com DDI"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          </div>
          <button
            className="nutri-primary"
            disabled={busy || !connection?.active}
          >
            Associar contato de teste
          </button>
        </form>
      </section>
      <div className={`nutri-chat ${selected ? "is-open" : ""}`}>
        <aside>
          <label>
            Buscar contato
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome do paciente"
            />
          </label>
          {contacts
            .filter((contact) =>
              contact.patient_name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((contact) => (
              <button
                key={contact.id}
                className={contact.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(contact.id)}
              >
                <span>
                  {contact.patient_name}
                  <small>
                    +{contact.phone}
                    {!contact.active ? " · Vínculo encerrado" : ""}
                  </small>
                </span>
                {contact.unread > 0 && <em>{contact.unread}</em>}
              </button>
            ))}
          {!loading && !contacts.length && (
            <p className="nutri-empty">
              Associe um contato autorizado para começar.
            </p>
          )}
          {loading && <p className="nutri-empty">Carregando contatos…</p>}
          {contacts.length < total && (
            <button
              disabled={busy}
              onClick={async () => {
                loadedCount.current += 50;
                setBusy(true);
                try {
                  await refresh();
                } catch (reason) {
                  setError(reasonText(reason));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Carregar mais contatos
            </button>
          )}
        </aside>
        <section>
          {selected ? (
            <>
              <button
                className="nutri-chat-back"
                onClick={() => setSelectedId("")}
              >
                ← Contatos
              </button>
              <WhatsAppConversation
                key={selected.id}
                contact={selected}
                sendsEnabled={!!connection?.sends_enabled}
                onRead={refresh}
                realtime={realtime}
              />
            </>
          ) : (
            <p className="nutri-empty">Selecione um contato do WhatsApp.</p>
          )}
        </section>
      </div>
    </>
  );
}

function WhatsAppConversation({
  contact,
  sendsEnabled,
  onRead,
  realtime,
}: {
  contact: WhatsAppContact;
  sendsEnabled: boolean;
  onRead: () => Promise<void>;
  realtime: { connected: boolean; revision: number };
}) {
  const { session } = useAuth();
  const token = session!.accessToken;
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<{ id: string; text: string } | null>(null);
  const generation = useRef(0);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const merge = (current: WhatsAppMessage[], incoming: WhatsAppMessage[]) =>
    [
      ...new Map(
        [...current, ...incoming].map((message) => [message.id, message]),
      ).values(),
    ].sort(
      (a, b) =>
        a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id),
    );
  const refresh = useCallback(async () => {
    const current = generation.current;
    const request = ++sequence.current;
    const page = await whatsappMessages(token, contact.id);
    if (current !== generation.current || request !== sequence.current) return;
    setMessages((previous) => merge(previous, page.items));
    if (!initialized.current) {
      setCursor(page.next_cursor);
      initialized.current = true;
    }
    setLoaded(true);
    const ids = page.items
      .filter((message) => message.direction === "inbound" && !message.read_at)
      .map((message) => message.id);
    if (ids.length && document.visibilityState === "visible") {
      await readWhatsAppMessages(token, contact.id, ids);
      if (current !== generation.current) return;
      setMessages((previous) =>
        previous.map((message) =>
          ids.includes(message.id)
            ? { ...message, read_at: new Date().toISOString() }
            : message,
        ),
      );
      await onReadRef.current();
    }
  }, [token, contact.id]);
  useVisiblePolling(
    refresh,
    (reason) => setError(reasonText(reason)),
    true,
    !realtime.connected,
  );
  useEffect(() => {
    if (realtime.connected)
      void refresh().catch((reason) => setError(reasonText(reason)));
  }, [realtime.connected, realtime.revision, refresh]);
  const canSend = contact.active && contact.window_open && sendsEnabled;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSend || !draft.trim()) return;
    const text = draft.trim();
    if (!pending.current || pending.current.text !== text)
      pending.current = { id: crypto.randomUUID(), text };
    setBusy(true);
    setError("");
    try {
      const saved = await sendWhatsAppMessage(
        token,
        contact.id,
        pending.current.id,
        text,
      );
      setMessages((previous) => merge(previous, [saved]));
      setDraft((previous) => (previous.trim() === text ? "" : previous));
      pending.current = null;
    } catch (reason) {
      setError(reasonText(reason));
    } finally {
      setBusy(false);
    }
  }
  async function loadOlder() {
    if (!cursor || olderBusy) return;
    setOlderBusy(true);
    try {
      const page = await whatsappMessages(token, contact.id, cursor);
      setMessages((previous) => merge(page.items, previous));
      setCursor(page.next_cursor);
      const ids = page.items
        .filter(
          (message) => message.direction === "inbound" && !message.read_at,
        )
        .map((message) => message.id);
      if (ids.length) {
        await readWhatsAppMessages(token, contact.id, ids);
        await onReadRef.current();
      }
    } catch (reason) {
      setError(reasonText(reason));
    } finally {
      setOlderBusy(false);
    }
  }
  return (
    <div className="care-conversation whatsapp-conversation">
      <h2>{contact.patient_name} · WhatsApp</h2>
      <ErrorToast message={error} />
      {!canSend && (
        <p role="status">
          {!contact.active
            ? "Vínculo encerrado. Histórico disponível para leitura."
            : !sendsEnabled
              ? "Envios pausados."
              : "Janela de atendimento encerrada. Aguarde uma mensagem do paciente pelo WhatsApp."}
        </p>
      )}
      <div
        className="chat-history"
        role="log"
        aria-label="Mensagens do WhatsApp"
      >
        {cursor && (
          <button
            disabled={olderBusy}
            onClick={() => {
              void loadOlder();
            }}
          >
            Carregar mensagens anteriores
          </button>
        )}
        {!loaded && <p>Carregando mensagens…</p>}
        {loaded && !messages.length && (
          <p>
            Nenhuma mensagem. Peça ao contato de teste para iniciar a conversa.
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            own={message.direction === "outbound"}
            text={message.text}
          >
            <small>
              {new Date(message.occurred_at).toLocaleString("pt-BR")} ·{" "}
              {statusLabel[message.status]}
            </small>
          </MessageBubble>
        ))}
      </div>
      {canSend && (
        <MessageComposer
          id="whatsapp-message"
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
