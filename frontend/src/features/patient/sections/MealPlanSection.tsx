import { useEffect, useRef, useState } from "react";

import { PanelHeader } from "../components/PanelHeader";
import { PatientIcon } from "../components/PatientIcon";
import { patientMock } from "../mocks/patient-data";

export function MealPlanSection() {
  const [selectedMeal, setSelectedMeal] = useState<(typeof patientMock.meals)[number] | null>(null);
  const [showSubstitutions, setShowSubstitutions] = useState(false);
  const mealDialog = useRef<HTMLElement>(null);
  const substitutionDialog = useRef<HTMLElement>(null);
  const dailyMacros = patientMock.meals.reduce(
    (total, meal) => ({
      calories: total.calories + Number.parseFloat(meal.macros.calories),
      protein: total.protein + Number.parseFloat(meal.macros.protein),
      carbs: total.carbs + Number.parseFloat(meal.macros.carbs),
      fats: total.fats + Number.parseFloat(meal.macros.fats),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );

  useEffect(() => {
    if (!selectedMeal) return;
    const dialog = showSubstitutions ? substitutionDialog.current : mealDialog.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    buttons[0]?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showSubstitutions) setShowSubstitutions(false);
      else setSelectedMeal(null);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [selectedMeal, showSubstitutions]);

  function closeMeal() {
    setShowSubstitutions(false);
    setSelectedMeal(null);
  }

  return (
    <div className="meal-plan-page">
      <section className="meal-plan-hero">
        <div>
          <span className="card-label">Plano alimentar</span>
          <h2>{patientMock.mealPlan.title}</h2>
          <p>{patientMock.nutritionist}</p>
        </div>
        <dl>
          <div>
            <dt>Período</dt>
            <dd>{patientMock.mealPlan.startDate} — {patientMock.mealPlan.validUntil}</dd>
          </div>
          <div>
            <dt><PatientIcon name="water" /> Meta de água</dt>
            <dd>{patientMock.mealPlan.dailyWaterGoal}/dia</dd>
          </div>
        </dl>
      </section>

      <section className="meal-plan-content">
        <div className="meal-schedule">
          <PanelHeader eyebrow="Rotina diária" title="Refeições e quantidades" />
          <div className="meal-cards">
            {patientMock.meals.map((meal) => (
              <button className="meal-card meal-card-button" key={meal.time} type="button" onClick={() => setSelectedMeal(meal)}>
                <time>{meal.time}</time>
                <span className="meal-card-title">
                  <strong>{meal.title}</strong>
                  <small>{meal.foods.length} itens</small>
                </span>
                <span className={meal.done ? "meal-status done" : "meal-status"}>{meal.done ? "Concluída" : "Pendente"}</span>
                <span className="meal-open" aria-hidden="true">Ver refeição <PatientIcon name="arrow" /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="daily-macros" aria-labelledby="daily-macros-title">
        <div className="daily-macros-heading">
          <span className="card-label">Resumo nutricional</span>
          <h2 id="daily-macros-title">Totais do dia</h2>
        </div>
        <div className="daily-macros-grid">
          <Macro label="Calorias" value={dailyMacros.calories.toLocaleString("pt-BR")} unit="kcal" featured />
          <Macro label="Proteínas" value={dailyMacros.protein} unit="g" />
          <Macro label="Carboidratos" value={dailyMacros.carbs} unit="g" />
          <Macro label="Gorduras" value={dailyMacros.fats} unit="g" />
        </div>
      </section>

      {selectedMeal ? (
        <div className="meal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeMeal()}>
          <section ref={mealDialog} className="meal-modal" role="dialog" aria-modal={!showSubstitutions} aria-hidden={showSubstitutions || undefined} inert={showSubstitutions} aria-labelledby="meal-modal-title">
            <header className="meal-modal-header">
              <div>
                <span className="card-label">{selectedMeal.time}</span>
                <h2 id="meal-modal-title">{selectedMeal.title}</h2>
              </div>
              <button className="meal-modal-close" type="button" onClick={closeMeal} aria-label="Fechar refeição">×</button>
            </header>
            <div className="meal-modal-section">
              <div className="meal-modal-section-title">
                <div>
                  <span className="card-label">Refeição principal</span>
                  <h3>Alimentos e quantidades</h3>
                </div>
                <button className="meal-substitution-button" type="button" onClick={() => setShowSubstitutions(true)}>Ver substituições</button>
              </div>
              <ul className="meal-modal-foods">
                {selectedMeal.foods.map((food) => <li key={food}>{food}</li>)}
              </ul>
            </div>
            <div className="meal-macros">
              <MacroValue label="Calorias" value={selectedMeal.macros.calories} />
              <MacroValue label="Proteínas" value={selectedMeal.macros.protein} />
              <MacroValue label="Carboidratos" value={selectedMeal.macros.carbs} />
              <MacroValue label="Gorduras" value={selectedMeal.macros.fats} />
            </div>
          </section>

          {showSubstitutions ? (
            <div className="substitution-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowSubstitutions(false)}>
              <section ref={substitutionDialog} className="substitution-modal" role="dialog" aria-modal="true" aria-labelledby="substitution-modal-title">
                <header className="meal-modal-header">
                  <div>
                    <span className="card-label">Trocas da refeição</span>
                    <h2 id="substitution-modal-title">Substituições</h2>
                  </div>
                  <button className="meal-modal-close" type="button" onClick={() => setShowSubstitutions(false)} aria-label="Fechar substituições">×</button>
                </header>
                <p className="substitution-intro">Escolha uma das opções abaixo. Cada opção substitui a refeição inteira; consuma todos os alimentos da opção escolhida.</p>
                {selectedMeal.substitutions.map((option, index) => (
                  <article className="substitution-meal" key={option.id} aria-label={`Opção ${index + 1}`}>
                    <span className="substitution-meal-label">Opção {index + 1}</span>
                    <ul>{option.foods.map((food) => <li key={food}>{food}</li>)}</ul>
                  </article>
                ))}
                <button className="substitution-modal-back" type="button" onClick={() => setShowSubstitutions(false)}>Voltar para a refeição</button>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Macro({ label, value, unit, featured = false }: { label: string; value: string | number; unit: string; featured?: boolean }) {
  return (
    <article className={featured ? "daily-macro daily-macro-calories" : "daily-macro"}>
      <small>{label}</small>
      <strong>{value} <span>{unit}</span></strong>
    </article>
  );
}

function MacroValue({ label, value }: { label: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}
