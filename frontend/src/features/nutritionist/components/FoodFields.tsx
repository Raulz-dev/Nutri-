import type { Food } from "../../care/types";
import { newFood } from "../plan-draft";

export function FoodFields({
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
