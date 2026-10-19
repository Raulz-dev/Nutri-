import { useRef } from "react";
import { useAuth } from "../../auth/useAuth";
import type { MealPlanRecord } from "../../care/meal-plan-api";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { usePlanEditor } from "../hooks/usePlanEditor";
import { newMeal, updatePlanMeal } from "../plan-draft";
import { Modal } from "./Modal";
import { MealEditor } from "./MealEditor";

export function PlanEditor({
  patientId,
  source,
  onClose,
  onSaved,
}: {
  patientId: string;
  source?: MealPlanRecord;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { currentUser, session } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    plan,
    setPlan,
    busy,
    error,
    save: persist,
  } = usePlanEditor({
    patientId,
    source,
    author: currentUser!,
    token: session?.accessToken ?? "",
    onClose,
    onSaved,
  });
  function save(publish: boolean) {
    if (formRef.current?.reportValidity()) void persist(publish);
  }
  return (
    <Modal
      title={
        source && source.status !== "draft"
          ? "Nova versão do plano"
          : "Editar plano alimentar"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        ref={formRef}
        className="nutri-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <div className="nutri-form-grid">
          <label>
            Título
            <input
              required
              value={plan.title}
              onChange={(e) => setPlan({ ...plan, title: e.target.value })}
            />
          </label>
          <label>
            Água diária (L)
            <input
              type="number"
              min="0"
              max="15"
              step="0.1"
              required
              value={plan.waterLiters}
              onChange={(e) =>
                setPlan({ ...plan, waterLiters: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            Início
            <input
              type="date"
              required
              value={plan.startDate}
              onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
            />
          </label>
          <label>
            Validade
            <input
              type="date"
              required
              min={plan.startDate}
              value={plan.endDate}
              onChange={(e) => setPlan({ ...plan, endDate: e.target.value })}
            />
          </label>
        </div>
        <label>
          Orientações
          <textarea
            value={plan.guidance}
            onChange={(e) => setPlan({ ...plan, guidance: e.target.value })}
          />
        </label>
        {plan.meals.map((meal, index) => (
          <MealEditor
            key={meal.id}
            meal={meal}
            index={index}
            onChange={(change) =>
              setPlan((current) => updatePlanMeal(current, meal.id, change))
            }
            onRemove={() =>
              setPlan((current) => ({
                ...current,
                meals: current.meals.filter((item) => item.id !== meal.id),
              }))
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            setPlan((p) => ({ ...p, meals: [...p.meals, newMeal()] }))
          }
        >
          Adicionar refeição
        </button>
        <p className="nutri-muted">
          Os valores nutricionais são preenchidos manualmente. Um plano
          publicado para uma data futura passa a valer apenas no início da
          vigência.
        </p>
        <ErrorToast message={error} />
        <div className="nutri-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar rascunho"}
          </button>
          <button
            type="button"
            className="nutri-primary"
            disabled={busy}
            onClick={() => save(true)}
          >
            Publicar plano
          </button>
        </div>
      </form>
    </Modal>
  );
}
