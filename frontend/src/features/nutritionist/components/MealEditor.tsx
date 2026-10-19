import type { Meal } from "../../care/types";
import { newFood } from "../plan-draft";
import { FoodFields } from "./FoodFields";

export function MealEditor({
  meal,
  index,
  onChange,
  onRemove,
}: {
  meal: Meal;
  index: number;
  onChange: (change: Partial<Meal>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="nutri-meal-editor">
      <legend>Refeição {index + 1}</legend>
      <div className="nutri-form-grid">
        <label>
          Nome da refeição
          <input
            value={meal.title}
            required
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label>
          Horário
          <input
            type="time"
            required
            value={meal.time}
            onChange={(e) => onChange({ time: e.target.value })}
          />
        </label>
      </div>
      <FoodFields
        foods={meal.foods}
        onChange={(foods) => onChange({ foods })}
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
              onChange={(e) => onChange({ [key]: e.target.valueAsNumber })}
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
              onChange({
                substitutions: meal.substitutions.map((s) =>
                  s.id === option.id ? { ...s, foods } : s,
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onChange({
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
            onChange({
              substitutions: [
                ...meal.substitutions,
                { id: crypto.randomUUID(), foods: [newFood()] },
              ],
            })
          }
        >
          Adicionar substituição completa
        </button>
        <button type="button" onClick={() => onRemove()}>
          Remover refeição
        </button>
      </div>
    </fieldset>
  );
}
