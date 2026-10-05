import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AdminIcon, AdminShell } from "../AdminShell";
import { markConversationRead, readAdminConversations, sendAdminMessage, saveAdminConversations } from "../admin-chat";

export function AdminChatPage() {
  const [conversations, setConversations] = useState(readAdminConversations);
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => !term || conversation.participant.name.toLowerCase().includes(term) || conversation.participant.email.toLowerCase().includes(term));
  }, [conversations, search]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [selectedId, selected?.messages.length]);

  useEffect(() => {
    if (selectedId) setConversations((current) => markConversationRead(current, selectedId));
  }, [selectedId]);

  useEffect(() => {
    saveAdminConversations(conversations);
  }, [conversations]);

  function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    setConversations((current) => markConversationRead(current, conversationId));
    setMobileConversationOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setConversations(sendAdminMessage(conversations, selected.id, draft));
    setDraft("");
  }

  return (
    <AdminShell title="Chat" subtitle="Canal demonstrativo entre a administração e os nutricionistas.">
      <section className={`admin-chat${mobileConversationOpen ? " is-open" : ""}`}>
        <aside className="admin-chat-list" aria-label="Conversas">
          <label className="admin-chat-search"><span className="sr-only">Buscar conversas</span><AdminIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></label>
          <div className="admin-chat-list-heading"><strong>Conversas</strong><span>{conversations.reduce((total, item) => total + item.unread, 0)} não lidas</span></div>
          <div className="admin-chat-contacts">
            {filtered.map((conversation) => {
              const lastMessage = conversation.messages.at(-1);
              return <button className={conversation.id === selectedId ? "is-active" : ""} type="button" key={conversation.id} onClick={() => selectConversation(conversation.id)} aria-current={conversation.id === selectedId ? "true" : undefined}>
                <span className="admin-chat-avatar">{initials(conversation.participant.name)}</span>
                <span><strong>{conversation.participant.name}</strong><small>{lastMessage?.text ?? "Sem mensagens"}</small></span>
                <span className="admin-chat-contact-meta"><time>{formatListTime(lastMessage?.sentAt)}</time>{conversation.unread ? <b>{conversation.unread}</b> : null}</span>
              </button>;
            })}
            {!filtered.length ? <p className="admin-chat-empty">Nenhuma conversa encontrada.</p> : null}
          </div>
        </aside>

        {selected ? <article className="admin-chat-panel">
          <header>
            <button className="admin-chat-back" type="button" onClick={() => setMobileConversationOpen(false)} aria-label="Voltar para conversas">‹</button>
            <span className="admin-chat-avatar">{initials(selected.participant.name)}</span>
            <div><strong>{selected.participant.name}</strong><small>Nutricionista · {selected.participant.email}</small></div>
          </header>
          <div className="admin-chat-history" ref={historyRef} aria-live="polite" aria-label={`Conversa com ${selected.participant.name}`}>
            <div className="admin-chat-date"><span>Histórico recente</span></div>
            {selected.messages.map((message) => <div className={`admin-chat-message ${message.sender === "admin" ? "is-admin" : ""}`} key={message.id}><div><p>{message.text}</p><time dateTime={message.sentAt}>{formatMessageTime(message.sentAt)}</time></div></div>)}
          </div>
          <form className="admin-chat-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="admin-chat-message">Escreva uma mensagem</label>
            <textarea id="admin-chat-message" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem..." />
            <button type="submit" disabled={!draft.trim()}>Enviar</button>
          </form>
        </article> : <div className="admin-chat-empty-panel">Selecione uma conversa.</div>}
      </section>
    </AdminShell>
  );
}

function formatListTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
