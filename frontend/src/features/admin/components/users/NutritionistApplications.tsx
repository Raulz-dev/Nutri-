import { useEffect, useState } from "react";
import { formatCpf } from "../../../../lib/cpf";
import { apiRequest } from "../../../../lib/http-client";
import {
  ErrorToast,
  useSuccessToast,
} from "../../../../components/ui/ErrorToast";

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
const pageSize = 25;

export function NutritionistApplications({
  token,
  onApproval,
}: {
  token: string;
  onApproval: () => Promise<unknown>;
}) {
  const [page, setPage] = useState<ApplicationPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const showSuccess = useSuccessToast();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void apiRequest<ApplicationPage>(`${path}?offset=${offset}`, {
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
  }, [token, offset, reload]);

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
      if (decision === "approved") await onApproval();
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
    <section
      className="admin-panel users-table-panel"
      aria-labelledby="nutritionist-applications-title"
    >
      <header className="nutritionist-applications-heading">
        <h2 id="nutritionist-applications-title">Solicitações de cadastro</h2>
      </header>
      <ErrorToast message={error} />
      {loading && (
        <p className="users-empty" role="status">
          Carregando solicitações…
        </p>
      )}
      {!loading && page?.items.length === 0 && (
        <p className="users-empty">
          Nenhuma solicitação pendente nesta página.
        </p>
      )}
      {!!page?.items.length && (
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
              {page.items.map((application) => (
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
      )}
      <div className="pagination">
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            setReload((value) => value + 1);
          }}
        >
          Atualizar fila
        </button>
        <div>
          {offset > 0 && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => setOffset(offset - pageSize)}
            >
              Anterior
            </button>
          )}
          {page?.has_more && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => setOffset(offset + pageSize)}
            >
              Próxima
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
