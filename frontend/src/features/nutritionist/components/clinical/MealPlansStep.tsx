import { useCallback, useState } from "react";
import {
  ErrorToast,
  useSuccessToast,
} from "../../../../components/ui/ErrorToast";
import { TablePagination } from "../../../../components/shared/TablePagination";
import {
  closeMealPlan,
  listPlanHistory,
  type MealPlanRecord,
} from "../../../care/meal-plan-api";
import { MealPlanHistoryCard } from "./MealPlanHistoryCard";
import { useClinicalHistory } from "../../hooks/useClinicalHistory";
import { Modal } from "../Modal";
import { PlanEditor } from "../PlanEditor";

export function MealPlansStep({
  token,
  patientId,
}: {
  token: string;
  patientId: string;
}) {
  const loadPage = useCallback(
    (offset: number) => listPlanHistory(token, patientId, offset),
    [token, patientId],
  );
  const history = useClinicalHistory(
    loadPage,
    "Não foi possível carregar os planos.",
  );
  const {
    items: plans,
    total: planTotal,
    page: planPage,
    changePage: setPlanPage,
    loading: planLoading,
    error: planError,
  } = history;
  const [editor, setEditor] = useState<MealPlanRecord | "new" | null>(null);
  const [closing, setClosing] = useState<MealPlanRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showSuccess = useSuccessToast();

  function refreshPlans() {
    if (planPage !== 1) setPlanPage(1);
    else void history.refresh();
  }

  async function confirmClosePlan() {
    if (!closing || busy) return;
    setBusy(true);
    setError("");
    try {
      const closed = await closeMealPlan(
        token,
        patientId,
        closing.id,
        closing.revision,
      );
      history.replaceItem(closed);
      setClosing(null);
      showSuccess("Plano encerrado e preservado no histórico.");
      refreshPlans();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível encerrar o plano.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ErrorToast message={error} />
      <ErrorToast message={planError} />
      <section className="nutri-card">
        <header>
          <h2>Planos alimentares</h2>
          <button
            className="nutri-primary"
            type="button"
            onClick={() => setEditor("new")}
          >
            Criar plano
          </button>
        </header>
        {planLoading && <p className="nutri-muted">Carregando planos...</p>}
        {!planLoading && planError && (
          <button type="button" onClick={refreshPlans}>
            Tentar novamente
          </button>
        )}
        {plans.map((plan) => (
          <MealPlanHistoryCard
            key={plan.id}
            plan={plan}
            onEdit={setEditor}
            onClose={setClosing}
          />
        ))}
        {!planLoading && !planError && !planTotal && (
          <p className="nutri-empty">Nenhum plano alimentar criado.</p>
        )}
        <TablePagination
          page={planPage}
          totalPages={history.totalPages}
          onPageChange={setPlanPage}
        />
      </section>
      {editor && (
        <PlanEditor
          patientId={patientId}
          source={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={refreshPlans}
        />
      )}
      {closing && (
        <Modal
          title="Encerrar plano alimentar"
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        >
          <p>
            Encerrar “{closing.title}”? O conteúdo ficará no histórico e deixará
            de aparecer ao paciente.
          </p>
          <div className="nutri-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setClosing(null)}
            >
              Cancelar
            </button>
            <button
              className="nutri-primary"
              type="button"
              disabled={busy}
              onClick={confirmClosePlan}
            >
              Confirmar encerramento
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
