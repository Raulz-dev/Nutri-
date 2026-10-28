import type { MealPlanRecord } from "../../../care/meal-plan-api";
import { dateLabel, today } from "../../../../lib/formatters";

type MealPlanHistoryCardProps = {
  plan: MealPlanRecord;
  onEdit: (plan: MealPlanRecord) => void;
  onClose: (plan: MealPlanRecord) => void;
};

export function MealPlanHistoryCard({
  plan,
  onEdit,
  onClose,
}: MealPlanHistoryCardProps) {
  return (
    <article className="nutri-plan-summary">
      <div>
        <span className="nutri-badge">{planStatus(plan)}</span>
        <h3>{plan.title}</h3>
        <p>
          {dateLabel(plan.startDate)} a {dateLabel(plan.endDate)} ·{" "}
          {plan.authorName}
        </p>
        <p>
          {plan.meals.length} refeições ·{" "}
          {plan.meals
            .reduce((sum, meal) => sum + meal.calories, 0)
            .toLocaleString("pt-BR")}{" "}
          kcal/dia
        </p>
        <details>
          <summary>Ver conteúdo do plano</summary>
          {plan.guidance && <p>{plan.guidance}</p>}
          {plan.meals.map((meal) => (
            <div key={meal.id}>
              <strong>
                {meal.time} · {meal.title}
              </strong>
              <p>
                {meal.foods
                  .map((food) => `${food.name} (${food.grams} g)`)
                  .join(", ")}
              </p>
              {meal.substitutions.map((option, index) => (
                <p key={option.id}>
                  Opção {index + 1}:{" "}
                  {option.foods
                    .map((food) => `${food.name} (${food.grams} g)`)
                    .join(", ")}
                </p>
              ))}
            </div>
          ))}
        </details>
      </div>
      <div className="nutri-actions">
        <button type="button" onClick={() => onEdit(plan)}>
          {plan.status === "draft" ? "Editar rascunho" : "Criar nova versão"}
        </button>
        {plan.status === "published" && (
          <button type="button" onClick={() => onClose(plan)}>
            Encerrar plano
          </button>
        )}
      </div>
    </article>
  );
}

function planStatus(plan: MealPlanRecord) {
  if (plan.status === "draft") return "Rascunho";
  if (plan.status === "closed") return "Encerrado";
  if (plan.startDate > today()) return "Programado";
  if (plan.effectiveEndOn && plan.effectiveEndOn < today())
    return "Substituído ou vencido";
  return "Vigente";
}
