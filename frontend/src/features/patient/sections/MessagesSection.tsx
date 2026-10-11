import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { CareConversationPanel } from "../../care/CareConversationPanel";
import { listConversations, type ConversationRecord } from "../../care/interaction-api";
import { ErrorToast } from "../../../components/ui/ErrorToast";

export function MessagesSection() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState("");
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
  }, [token]);
  const onRead = useCallback(() => {
    if (selectedId) setConversations(current => current.map(conversation => conversation.id === selectedId ? { ...conversation, unread: 0 } : conversation));
    void refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Falha ao atualizar conversas."));
  }, [selectedId, refresh]);

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
    void refresh().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar conversas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const selected = conversations.find(conversation => conversation.id === selectedId)
    ?? conversations.find(conversation => conversation.active)
    ?? conversations[0];

  return <div className="patient-panel section-panel">
    <ErrorToast message={error} />
    {conversations.length > 1 && <label>Conversa
      <select value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>
        {conversations.map(conversation => <option key={conversation.id} value={conversation.id}>
          {conversation.nutritionist_name}{conversation.active ? "" : " · histórico"}
        </option>)}
      </select>
    </label>}
    {conversations.length < total && <button type="button" disabled={loadingMore} onClick={() => { void loadMore(); }}>Carregar mais conversas</button>}
    {selected ? <CareConversationPanel key={selected.id} conversation={selected} onRead={onRead} />
      : <p className="nutri-empty">{loading ? "Carregando conversas..." : error ? "Não foi possível carregar as conversas." : "Nenhuma conversa disponível. É necessário um vínculo com nutricionista."}</p>}
  </div>;
}
