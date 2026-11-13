import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { AdminIcon, AdminShell } from "../AdminShell";
import { formatCpf } from "../../../lib/cpf";
import { apiRequest } from "../../../lib/http-client";
import { ErrorToast, useSuccessToast } from "../../../components/ui/ErrorToast";

type Application = {
  id: string;
  name: string;
  email: string;
  crn: string;
  cpf: string | null;
  created_at: string;
};
type ApplicationPage = { items: Application[]; has_more: boolean };
type Decision = "approved" | "rejected";

const path = "/admin/nutritionist-applications";
const pageSize = 10;

export function AdminNutritionistApplicationsPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [page, setPage] = useState<ApplicationPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const showSuccess = useSuccessToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = searchInput.trim();
      if (term !== search) {
        setError("");
        setOffset(0);
        setSearch(term);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ offset: String(offset), search });
    void apiRequest<ApplicationPage>(`${path}?${params}`, {
      token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setPage(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setPage(null);
          setError(
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar solicitações.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, offset, search, reload]);

  async function review(application: Application, decision: Decision) {
    if (
      !window.confirm(
        decision === "approved"
          ? `Aprovar a solicitação de ${application.name} e enviar o convite por e-mail?`
          : `Recusar a solicitação de ${application.name}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiRequest<void>(`${path}/${application.id}/review`, {
        token,
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setPage(null);
      setOffset(0);
      showSuccess(
        decision === "approved"
          ? "Solicitação aprovada. Convite agendado para envio."
          : "Solicitação recusada.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao processar a solicitação.",
      );
    } finally {
      setReload((value) => value + 1);
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Solicitações de cadastro"
      subtitle="Analise os pedidos de cadastro de nutricionistas."
    >
      <ErrorToast message={error} />
      <div className="users-page-action">
        <button
          className="admin-primary-button"
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            setReload((value) => value + 1);
          }}
        >
          Atualizar solicitações
        </button>
      </div>
      <section
        className="admin-panel users-search-panel"
        aria-label="Busca de solicitações"
      >
        <div className="users-filters">
          <label className="admin-search">
            <span className="sr-only">Pesquisar por nome, e-mail ou CRN</span>
            <AdminIcon name="search" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Nome, e-mail ou CRN"
              maxLength={320}
            />
          </label>
        </div>
      </section>
      <section
        className="admin-panel users-table-panel"
        aria-label="Solicitações pendentes"
      >
        <div className="users-table-wrap">
          <table className="users-table nutritionists-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>CRN</th>
                <th>Recebida em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {(!page?.items.length || loading) && (
                <tr>
                  <td colSpan={4} className="users-empty" role="status">
                    {loading
                      ? "Carregando solicitações…"
                      : page
                        ? search
                          ? "Nenhuma solicitação encontrada."
                          : "Nenhuma solicitação pendente."
                        : "Não foi possível carregar as solicitações."}
                  </td>
                </tr>
              )}
              {!loading &&
                page?.items.map((application) => (
                  <tr key={application.id}>
                    <td data-label="Profissional">
                      <div className="user-cell">
                        <div>
                          <strong>{application.name}</strong>
                          <small>{application.email}</small>
                          {application.cpf && (
                            <small>CPF {formatCpf(application.cpf)}</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="CRN">{application.crn}</td>
                    <td data-label="Recebida em">
                      {new Date(application.created_at).toLocaleDateString(
                        "pt-BR",
                      )}
                    </td>
                    <td data-label="Ações">
                      <div className="row-actions">
                        <button
                          type="button"
                          disabled={busy || loading}
                          aria-label={`Aprovar ${application.name}`}
                          onClick={() => void review(application, "approved")}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={busy || loading}
                          className="danger"
                          aria-label={`Recusar ${application.name}`}
                          onClick={() => void review(application, "rejected")}
                        >
                          Recusar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {(offset > 0 || page?.has_more) && (
          <footer className="pagination">
            <span aria-live="polite">Página {offset / pageSize + 1}</span>
            <div>
              <button
                className="icon-action"
                type="button"
                disabled={busy || loading || offset === 0}
                onClick={() => setOffset(offset - pageSize)}
                aria-label="Página anterior"
              >
                <AdminIcon name="chevronLeft" />
              </button>
              <button
                className="icon-action"
                type="button"
                disabled={busy || loading || !page?.has_more}
                onClick={() => setOffset(offset + pageSize)}
                aria-label="Próxima página"
              >
                <AdminIcon name="chevronRight" />
              </button>
            </div>
          </footer>
        )}
      </section>
    </AdminShell>
  );
}
