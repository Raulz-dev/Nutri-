import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { markConversationRead, sendMessage } from "./actions";
import { demoUsers, useDemo } from "./store";
export function ConversationPanel({
  patientId,
  sender,
}: {
  patientId: string;
  sender: "patient" | "nutritionist";
}) {
  const state = useDemo();
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const history = useRef<HTMLDivElement>(null);
  const link = state.links.find((l) => l.patientId === patientId);
  const allowed =
    sender === "patient" || link?.nutritionistId === currentUser!.id;
  const conversation = allowed
    ? state.conversations.find((c) => c.id === link?.conversationId)
    : undefined;
  const unread =
    conversation?.messages.some((m) => m.sender !== sender && !m.read) ?? false;
  useEffect(() => {
    if (!conversation || !unread) return;
    try {
      markConversationRead(conversation.id, sender, patientId, currentUser!);
    } catch {
      /* Keep the conversation visible if local saving fails. */
    }
  }, [conversation?.id, sender, unread, patientId, currentUser]);
  useEffect(() => {
    history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [conversation?.id, conversation?.messages.length]);
  const otherId = sender === "patient" ? link?.nutritionistId : patientId;
  const name =
    state.profiles[otherId ?? ""]?.name ||
    demoUsers(state).find((u) => u.id === otherId)?.name ||
    "Sem responsável";
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      sendMessage(patientId, sender, draft, currentUser!.id);
      setDraft("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!conversation)
    return (
      <p className="nutri-empty">
        Nenhuma conversa disponível. É necessário um vínculo com nutricionista.
      </p>
    );
  return (
    <article className="chat-panel shared-conversation">
      <header className="chat-header">
        <div>
          <strong>{name}</strong>
          <small>Conversa demonstrativa</small>
        </div>
      </header>
      <div className="chat-history" ref={history} aria-live="polite">
        {!conversation.messages.length && (
          <p className="nutri-empty">Comece a conversa.</p>
        )}
        {conversation.messages.map((m) => (
          <div
            className={`chat-message ${m.sender === sender ? "is-patient" : ""}`}
            key={m.id}
          >
            <div>
              <p>{m.text}</p>
              <time dateTime={m.sentAt}>
                {new Date(m.sentAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </div>
        ))}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="conversation-draft">
          Mensagem
        </label>
        <textarea
          id="conversation-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem..."
        />
        <button type="submit" disabled={!draft.trim()}>
          Enviar
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
