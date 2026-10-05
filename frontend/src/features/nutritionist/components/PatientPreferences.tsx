import type { PatientIntake } from "../../patient/patient-intake";
export function PatientPreferences({ intake }: { intake: PatientIntake }) {
  return (
    <section className="nutri-card">
      <h2>Preferências e rotina</h2>
      <p className="nutri-muted">Informações preenchidas pelo paciente.</p>
      {Object.entries(intake)
        .filter(([key]) => key !== "version")
        .map(([group, value]) => (
          <section key={group} className="nutri-intake-group">
            <h3>{labels[group] ?? group}</h3>
            <dl className="nutri-details">
              {typeof value === "object" ? (
                Object.entries(value).map(([key, v]) => (
                  <div key={key}>
                    <dt>{labels[key] ?? key}</dt>
                    <dd>
                      {Array.isArray(v)
                        ? v.join(", ") || "Não informado"
                        : typeof v === "boolean"
                          ? v
                            ? "Sim"
                            : "Não"
                          : (goalLabels[String(v)] ?? String(v)) ||
                            "Não informado"}
                    </dd>
                  </div>
                ))
              ) : (
                <dd>{String(value) || "Não informado"}</dd>
              )}
            </dl>
          </section>
        ))}
    </section>
  );
}
export const goalLabels: Record<string, string> = {
  "weight-loss": "Emagrecimento",
  "muscle-gain": "Ganho de massa",
  "food-education": "Reeducação alimentar",
  performance: "Desempenho",
  "clinical-control": "Controle clínico",
  other: "Outro",
  omnivore: "Onívoro",
  vegetarian: "Vegetariano",
  vegan: "Vegano",
  pescatarian: "Pescetariano",
};
const labels: Record<string, string> = {
  goal: "Objetivo",
  primary: "Principal",
  details: "Detalhes",
  food: "Alimentação",
  liked: "Alimentos preferidos",
  disliked: "Não gosta",
  avoided: "Evita",
  pattern: "Padrão alimentar",
  otherPattern: "Outro padrão",
  restrictions: "Restrições",
  allergies: "Alergias",
  noAllergies: "Sem alergias",
  intolerances: "Intolerâncias",
  noIntolerances: "Sem intolerâncias",
  other: "Outras",
  health: "Saúde",
  conditions: "Condições",
  medications: "Medicamentos",
  supplements: "Suplementos",
  digestiveSymptoms: "Sintomas digestivos",
  routine: "Rotina",
  mealsPerDay: "Refeições por dia",
  eatingSchedule: "Horários",
  waterLiters: "Água (L)",
  eatingOutFrequency: "Refeições fora de casa",
  difficulties: "Dificuldades",
  lifestyle: "Estilo de vida",
  activityType: "Atividade física",
  activityFrequency: "Frequência",
  sleepHours: "Sono (horas)",
  alcohol: "Álcool",
  smoking: "Tabagismo",
  observations: "Observações",
};
