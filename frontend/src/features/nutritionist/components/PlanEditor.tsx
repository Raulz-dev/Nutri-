import { useRef, useState } from "react";
import type { Food, Meal, Plan } from "../../care/types";
import { useAuth } from "../../auth/useAuth";
import { today } from "../../../lib/formatters";
import { createMealPlan, publishMealPlan, updateMealPlan, type MealPlanRecord } from "../../care/meal-plan-api";
import { validatePlan } from "../../care/plan-validation";
import { Modal } from "./Modal";
import { ErrorToast } from "../../../components/ui/ErrorToast";
const newFood = (): Food => ({ id: crypto.randomUUID(), name: "", grams: 100 });
const newMeal = (): Meal => ({
  id: crypto.randomUUID(),
  title: "",
  time: "12:00",
  foods: [newFood()],
  substitutions: [],
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
});
export function PlanEditor({
  patientId,
  source,
  onClose,
  onSaved,
}: {
  patientId: string;
  source?: Plan;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { currentUser, session } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const [savedDraft, setSavedDraft] = useState<MealPlanRecord | null>(
    source?.status === "draft" && "revision" in source ? source as MealPlanRecord : null,
  );
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan>(() =>
    source
      ? {
          ...structuredClone(source),
          id: source.status === "draft" ? source.id : crypto.randomUUID(),
          status: "draft",
          createdAt:
            source.status === "draft"
              ? source.createdAt
              : new Date().toISOString(),
          authorId: currentUser!.id,
          authorName: currentUser!.name,
        }
      : {
          id: crypto.randomUUID(),
          patientId,
          authorId: currentUser!.id,
          authorName: currentUser!.name,
          title: "",
          startDate: today(),
          endDate: today(),
          waterLiters: 2,
          guidance: "",
          meals: [newMeal()],
          status: "draft",
          createdAt: new Date().toISOString(),
        },
  );
  const [error, setError] = useState("");
  function changeMeal(id: string, change: Partial<Meal>) {
    setPlan((p) => ({
      ...p,
      meals: p.meals.map((m) => (m.id === id ? { ...m, ...change } : m)),
    }));
  }
  async function save(publish: boolean) {
    if (savingRef.current || !formRef.current?.reportValidity()) return;
    let draftSaved = false;
    try {
      validatePlan(plan);
      savingRef.current = true;
      setBusy(true);
      const token = session?.accessToken ?? "";
      const draft = savedDraft
        ? await updateMealPlan(token, patientId, { ...plan, id: savedDraft.id }, savedDraft.revision)
        : await createMealPlan(token, patientId, plan);
      setSavedDraft(draft);
      setPlan(current => ({ ...current, id: draft.id, createdAt: draft.createdAt }));
      draftSaved = true;
      onSaved?.();
      if (publish) await publishMealPlan(token, patientId, draft.id, draft.revision);
      if (publish) onSaved?.();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível salvar o plano.";
      setError(draftSaved && publish ? `Rascunho salvo, mas não foi possível publicar. ${message}` : message);
    } finally { savingRef.current = false; setBusy(false); }
  }
  return (
    <Modal
      title={
        source && source.status !== "draft"
          ? "Nova versão do plano"
          : "Editar plano alimentar"
      }
      onClose={() => { if (!busy) onClose(); }}
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
          <fieldset className="nutri-meal-editor" key={meal.id}>
            <legend>Refeição {index + 1}</legend>
            <div className="nutri-form-grid">
              <label>
                Nome da refeição
                <input
                  value={meal.title}
                  required
                  onChange={(e) =>
                    changeMeal(meal.id, { title: e.target.value })
                  }
                />
              </label>
              <label>
                Horário
                <input
                  type="time"
                  required
                  value={meal.time}
                  onChange={(e) =>
                    changeMeal(meal.id, { time: e.target.value })
                  }
                />
              </label>
            </div>
            <FoodFields
              foods={meal.foods}
              onChange={(foods) => changeMeal(meal.id, { foods })}
            />
            <div className="nutri-macro-inputs">
              {(
                [
                  ["calories", "Calorias (kcal)"],
                  ["protein", "Proteínas (g)"],
                  ["carbs", "Carboidratos (g)"],
                  ["fats", "Gorduras (g)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.1"
                    value={meal[key]}
                    onChange={(e) =>
                      changeMeal(meal.id, { [key]: e.target.valueAsNumber })
                    }
                  />
                </label>
              ))}
            </div>
            {meal.substitutions.map((option, i) => (
              <div className="nutri-substitution" key={option.id}>
                <h3>Substituição completa {i + 1}</h3>
                <FoodFields
                  foods={option.foods}
                  onChange={(foods) =>
                    changeMeal(meal.id, {
                      substitutions: meal.substitutions.map((s) =>
                        s.id === option.id ? { ...s, foods } : s,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    changeMeal(meal.id, {
                      substitutions: meal.substitutions.filter(
                        (s) => s.id !== option.id,
                      ),
                    })
                  }
                >
                  Remover substituição
                </button>
              </div>
            ))}
            <div className="nutri-actions">
              <button
                type="button"
                onClick={() =>
                  changeMeal(meal.id, {
                    substitutions: [
                      ...meal.substitutions,
                      { id: crypto.randomUUID(), foods: [newFood()] },
                    ],
                  })
                }
              >
                Adicionar substituição completa
              </button>
              <button
                type="button"
                onClick={() =>
                  setPlan((p) => ({
                    ...p,
                    meals: p.meals.filter((m) => m.id !== meal.id),
                  }))
                }
              >
                Remover refeição
              </button>
            </div>
          </fieldset>
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
          Os valores nutricionais são preenchidos manualmente. Um plano publicado
          para uma data futura passa a valer apenas no início da vigência.
        </p>
        <ErrorToast message={error} />
        <div className="nutri-actions">
          <button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar rascunho"}</button>
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
function FoodFields({
  foods,
  onChange,
}: {
  foods: Food[];
  onChange: (foods: Food[]) => void;
}) {
  return (
    <div className="nutri-foods">
      {foods.map((food, i) => (
        <div className="nutri-food-row" key={food.id}>
          <label>
            Alimento {i + 1}
            <input
              required
              value={food.name}
              onChange={(e) =>
                onChange(
                  foods.map((f) =>
                    f.id === food.id ? { ...f, name: e.target.value } : f,
                  ),
                )
              }
            />
          </label>
          <label>
            Quantidade (g)
            <input
              type="number"
              min="0.1"
              step="0.1"
              required
              value={food.grams}
              onChange={(e) =>
                onChange(
                  foods.map((f) =>
                    f.id === food.id
                      ? { ...f, grams: e.target.valueAsNumber }
                      : f,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remover alimento ${i + 1}`}
            onClick={() => onChange(foods.filter((f) => f.id !== food.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...foods, newFood()])}>
        Adicionar alimento
      </button>
    </div>
  );
}
