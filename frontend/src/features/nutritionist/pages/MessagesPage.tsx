import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { demoUsers, initials, useDemo } from "../../demo/store";
import { ConversationPanel } from "../../demo/ConversationPanel";
export function NutritionistMessagesPage() {
  const { currentUser } = useAuth();
  const state = useDemo();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const patients = demoUsers(state).filter((p) =>
    state.links.some(
      (l) => l.patientId === p.id && l.nutritionistId === currentUser!.id,
    ),
  );
  const selected = patients.find((p) => p.id === params.get("paciente"));
  return (
    <>
      <header className="nutri-heading">
        <span>CONVERSAS</span>
        <h1>Mensagens</h1>
        <p>Orientações próximas, com o contexto de cada paciente.</p>
      </header>
      <div className={`nutri-chat ${selected ? "is-open" : ""}`}>
        <aside>
          <label>
            Buscar conversa
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome do paciente"
            />
          </label>
          {patients
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => {
              const conversation = state.conversations.find(
                (c) =>
                  c.id ===
                  state.links.find((l) => l.patientId === p.id)?.conversationId,
              );
              const unread =
                conversation?.messages.filter(
                  (m) => m.sender === "patient" && !m.read,
                ).length ?? 0;
              return (
                <button
                  className={selected?.id === p.id ? "active" : ""}
                  key={p.id}
                  onClick={() => setParams({ paciente: p.id })}
                >
                  <b>{initials(p.name)}</b>
                  <span>
                    {p.name}
                    <small>
                      {conversation?.messages.at(-1)?.text ||
                        "Iniciar conversa"}
                    </small>
                  </span>
                  {unread > 0 && <em>{unread}</em>}
                </button>
              );
            })}
          {!patients.length && (
            <p className="nutri-empty">Adicione um paciente para conversar.</p>
          )}
        </aside>
        <section>
          {selected ? (
            <>
              <button className="nutri-chat-back" onClick={() => setParams({})}>
                ← Conversas
              </button>
              <ConversationPanel
                key={selected.id}
                patientId={selected.id}
                sender="nutritionist"
              />
            </>
          ) : (
            <p className="nutri-empty">Selecione uma conversa.</p>
          )}
        </section>
      </div>
    </>
  );
}
