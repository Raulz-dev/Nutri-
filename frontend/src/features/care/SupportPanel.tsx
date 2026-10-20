import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/http-client";
import { useAuth } from "../auth/useAuth";
import { ErrorToast } from "../../components/ui/ErrorToast";
import "./support.css";
import { SupportConversation, type SupportContact } from "./SupportConversation";

export function SupportPanel() {
  const { session } = useAuth();
  const token = session!.accessToken;
  const [contacts, setContacts] = useState<SupportContact[]>([]);
  const [selected, setSelected] = useState<SupportContact | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const contactRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++contactRequest.current;
    const page = await apiRequest<{ items: SupportContact[]; total: number }>(
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
