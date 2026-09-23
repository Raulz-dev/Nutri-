import { useEffect, useRef, useState, type FormEvent } from "react";

import { PatientIcon } from "../components/PatientIcon";

type ChatMessage = {
  id: number;
  author: "nutritionist" | "patient";
  text: string;
  time: string;
};

const initialMessages: ChatMessage[] = [
  { id: 1, author: "nutritionist", text: "Olá, Camila! Como você se sentiu com o novo plano alimentar?", time: "09:32" },
  { id: 2, author: "patient", text: "Oi, doutora! Estou me adaptando bem. Senti um pouco de fome no fim da tarde.", time: "09:36" },
  { id: 3, author: "nutritionist", text: "Obrigada por me contar. Tente manter o lanche da tarde no horário e observe como se sente nos próximos dias.", time: "09:40" },
  { id: 4, author: "nutritionist", text: "Sua evolução desta semana foi muito boa. Continue registrando as refeições e a ingestão de água.", time: "09:42" },
];

export function MessagesSection() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isConversationOpen, setIsConversationOpen] = useState(true);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        author: "patient",
        text,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setDraft("");
  }

  return (
    <section className={`chat-page${isConversationOpen ? " is-conversation-open" : ""}`} aria-labelledby="chat-page-title">
      <aside className="chat-conversations" aria-label="Conversas">
        <header>
          <span className="card-label">Acompanhamento</span>
          <h2 id="chat-page-title">Mensagens</h2>
        </header>
        <button className="chat-conversation is-active" type="button" aria-current="true" onClick={() => setIsConversationOpen(true)}>
          <span className="chat-avatar">MC</span>
          <span>
            <strong>Dra. Marina Costa</strong>
            <small>{messages.at(-1)?.text}</small>
          </span>
          <time>{messages.at(-1)?.time}</time>
        </button>
      </aside>

      <article className="chat-panel">
        <header className="chat-header">
          <button className="chat-back" type="button" onClick={() => setIsConversationOpen(false)} aria-label="Voltar para contatos">
            <PatientIcon name="arrow" />
          </button>
          <span className="chat-avatar">MC</span>
          <div>
            <strong>Dra. Marina Costa</strong>
            <small>Nutricionista responsável</small>
          </div>
          <span className="chat-status"><i /> Acompanhamento ativo</span>
        </header>

        <div className="chat-history" ref={historyRef} aria-live="polite" aria-label="Histórico da conversa">
          <div className="chat-date-divider"><span>Hoje</span></div>
          {messages.map((message) => (
            <div className={message.author === "patient" ? "chat-message is-patient" : "chat-message"} key={message.id}>
              <div>
                <p>{message.text}</p>
                <time>{message.time}</time>
              </div>
            </div>
          ))}
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-message">Escreva uma mensagem</label>
          <textarea
            id="chat-message"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva uma mensagem..."
          />
          <button type="submit" disabled={!draft.trim()} aria-label="Enviar mensagem">
            <span>Enviar</span>
            <PatientIcon name="arrow" />
          </button>
        </form>
      </article>
    </section>
  );
}
