import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { CareConversationPanel } from "../../care/CareConversationPanel";
import { listAllConversations, listConversations, type ConversationRecord } from "../../care/interaction-api";
import { initials } from "../../../lib/formatters";
import { ErrorToast } from "../../../components/ui/ErrorToast";

export function NutritionistMessagesPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [params, setParams] = useSearchParams();
  const initialTarget = useState(() => ({ id: params.get("conversa"), patientId: params.get("paciente") }))[0];
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const page = await listConversations(token);
    setConversations(current => {
      const updated = new Map(current.map(conversation => [conversation.id, conversation]));
      for (const conversation of page.items) updated.set(conversation.id, conversation);
      return [...updated.values()].sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
    });
    setTotal(page.total);
    return page;
  }, [token]);
  const onRead = useCallback(() => {
    const id = params.get("conversa");
    if (id) setConversations(current => current.map(conversation => conversation.id === id ? { ...conversation, unread: 0 } : conversation));
    void refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao atualizar conversas."));
  }, [params, refresh]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await listConversations(token, conversations.length);
      setConversations(current => {
        const byId = new Map([...current, ...page.items].map(conversation => [conversation.id, conversation]));
        return [...byId.values()].sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
      });
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar mais conversas.");
    } finally { setLoadingMore(false); }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh().then(async page => {
      if (initialTarget.id || initialTarget.patientId) {
        const found = page.items.some(conversation => conversation.id === initialTarget.id || (conversation.patient_id === initialTarget.patientId && conversation.active));
        if (!found) {
          const all = await listAllConversations(token);
          if (active) { setConversations(all); setTotal(all.length); }
        }
      }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar conversas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const selected = conversations.find(conversation => conversation.id === params.get("conversa"))
    ?? conversations.find(conversation => conversation.patient_id === params.get("paciente") && conversation.active);

  return <>
    <header className="nutri-heading"><span>CONVERSAS</span><h1>Mensagens</h1><p>Orientações próximas, com o contexto de cada paciente.</p></header>
    <ErrorToast message={error} />
    <div className={`nutri-chat ${selected ? "is-open" : ""}`}>
      <aside>
        <label>Buscar conversa<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do paciente" /></label>
        {conversations.filter(conversation => conversation.patient_name.toLowerCase().includes(search.toLowerCase())).map(conversation => <button
          className={selected?.id === conversation.id ? "active" : ""}
          key={conversation.id}
          onClick={() => setParams({ conversa: conversation.id })}
        >
          <b>{initials(conversation.patient_name)}</b>
          <span>{conversation.patient_name}<small>{conversation.active ? "Conversa ativa" : "Histórico encerrado"}</small></span>
          {conversation.unread > 0 && <em>{conversation.unread}</em>}
        </button>)}
        {!loading && !conversations.length && <p className="nutri-empty">Nenhuma conversa disponível.</p>}
        {loading && <p className="nutri-empty">Carregando conversas...</p>}
        {conversations.length < total && <button type="button" disabled={loadingMore} onClick={() => { void loadMore(); }}>Carregar mais conversas</button>}
      </aside>
      <section>{selected ? <>
        <button className="nutri-chat-back" onClick={() => setParams({})}>← Conversas</button>
        <CareConversationPanel key={selected.id} conversation={selected} onRead={onRead} />
      </> : <p className="nutri-empty">Selecione uma conversa.</p>}</section>
    </div>
  </>;
}
