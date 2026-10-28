import type { PatientIntake } from "../../care/patient-intake";
import { usePatientIntakeForm } from "../hooks/usePatientIntakeForm";
import { Field, IntakeCard, RestrictionTags, TagInput } from "../components/preferences/IntakeFields";

export function PatientPreferencesSection() {
  const {
    intake, setIntake, busy, loading, goalError, setGoalError,
    numericErrors, setNumericErrors, goalRef, mealsRef, waterRef, sleepRef,
    updateGroup, handleSubmit,
  } = usePatientIntakeForm();

  return (
    <form className="intake-page" onSubmit={handleSubmit} noValidate>
      <section className="intake-intro">
        <div>
          <span className="card-label">Conhecer você ajuda no cuidado</span>
          <h2>Conte um pouco sobre sua alimentação e rotina</h2>
          <p>Preencha apenas o que considerar importante. Você poderá atualizar essas informações quando quiser.</p>
        </div>
        <span>Somente o objetivo é obrigatório</span>
      </section>

      <IntakeCard number="01" title="Seu objetivo" description="Qual é o principal resultado que você busca?">
        <div className="intake-grid two-columns">
        <Field label="Objetivo principal" required error={goalError ? "Selecione um objetivo para continuar." : undefined}>
            <select
              ref={goalRef}
              value={intake.goal.primary}
              aria-invalid={goalError}
              onChange={(event) => {
                updateGroup("goal", { primary: event.target.value as PatientIntake["goal"]["primary"] });
                setGoalError(false);
              }}
            >
              <option value="">Selecione uma opção</option>
              <option value="weight-loss">Emagrecimento</option>
              <option value="muscle-gain">Ganho de massa</option>
              <option value="food-education">Reeducação alimentar</option>
              <option value="performance">Melhorar desempenho</option>
              <option value="clinical-control">Controle clínico</option>
              <option value="other">Outro objetivo</option>
            </select>
          </Field>
          <Field label="Conte mais sobre seu objetivo" hint="Opcional">
            <input maxLength={200} value={intake.goal.details} onChange={(event) => updateGroup("goal", { details: event.target.value })} placeholder="Ex.: melhorar minha disposição" />
          </Field>
        </div>
      </IntakeCard>

      <IntakeCard number="02" title="Preferências alimentares" description="Ajude a tornar o plano mais próximo da sua realidade.">
        <div className="intake-grid">
          <TagInput label="Alimentos que você gosta" placeholder="Ex.: banana" values={intake.food.liked} maxItems={20} onChange={(liked) => updateGroup("food", { liked })} />
          <TagInput label="Alimentos que você não gosta" placeholder="Ex.: beterraba" values={intake.food.disliked} maxItems={20} onChange={(disliked) => updateGroup("food", { disliked })} />
          <TagInput label="Alimentos que prefere evitar" placeholder="Ex.: frituras" values={intake.food.avoided} maxItems={20} onChange={(avoided) => updateGroup("food", { avoided })} />
          <div className="intake-grid two-columns">
            <Field label="Padrão alimentar">
              <select value={intake.food.pattern} onChange={(event) => updateGroup("food", { pattern: event.target.value as PatientIntake["food"]["pattern"], otherPattern: event.target.value === "other" ? intake.food.otherPattern : "" })}>
                <option value="">Selecione uma opção</option>
                <option value="omnivore">Onívoro</option>
                <option value="vegetarian">Vegetariano</option>
                <option value="vegan">Vegano</option>
                <option value="pescatarian">Pescetariano</option>
                <option value="other">Outro</option>
              </select>
            </Field>
            {intake.food.pattern === "other" ? (
              <Field label="Qual padrão?">
                <input maxLength={80} value={intake.food.otherPattern} onChange={(event) => updateGroup("food", { otherPattern: event.target.value })} placeholder="Descreva seu padrão alimentar" />
              </Field>
            ) : null}
          </div>
        </div>
      </IntakeCard>

      <IntakeCard number="03" title="Restrições" description="Registre alergias, intolerâncias e outras limitações.">
        <div className="intake-grid">
          <RestrictionTags
            label="Alergias alimentares"
            placeholder="Ex.: amendoim"
            values={intake.restrictions.allergies}
            maxItems={10}
            hasNone={intake.restrictions.noAllergies}
            onValuesChange={(allergies) => updateGroup("restrictions", { allergies })}
            onNoneChange={(noAllergies) => updateGroup("restrictions", { noAllergies, allergies: noAllergies ? [] : intake.restrictions.allergies })}
          />
          <RestrictionTags
            label="Intolerâncias"
            placeholder="Ex.: lactose"
            values={intake.restrictions.intolerances}
            maxItems={10}
            hasNone={intake.restrictions.noIntolerances}
            onValuesChange={(intolerances) => updateGroup("restrictions", { intolerances })}
            onNoneChange={(noIntolerances) => updateGroup("restrictions", { noIntolerances, intolerances: noIntolerances ? [] : intake.restrictions.intolerances })}
          />
          <Field label="Outras restrições">
            <textarea maxLength={300} rows={3} value={intake.restrictions.other} onChange={(event) => updateGroup("restrictions", { other: event.target.value })} placeholder="Restrições religiosas, culturais ou outras informações" />
          </Field>
        </div>
      </IntakeCard>

      <IntakeCard number="04" title="Saúde" description="Informe condições e cuidados relevantes para sua alimentação.">
        <div className="intake-grid">
          <TagInput label="Condições de saúde" placeholder="Ex.: hipertensão" values={intake.health.conditions} maxItems={10} onChange={(conditions) => updateGroup("health", { conditions })} />
          <TagInput label="Medicamentos em uso" placeholder="Digite o medicamento" values={intake.health.medications} maxItems={20} onChange={(medications) => updateGroup("health", { medications })} />
          <TagInput label="Suplementos" placeholder="Ex.: creatina" values={intake.health.supplements} maxItems={10} onChange={(supplements) => updateGroup("health", { supplements })} />
          <Field label="Sintomas ou desconfortos digestivos">
            <textarea maxLength={300} rows={3} value={intake.health.digestiveSymptoms} onChange={(event) => updateGroup("health", { digestiveSymptoms: event.target.value })} placeholder="Ex.: azia, inchaço ou desconforto após refeições" />
          </Field>
        </div>
      </IntakeCard>

      <IntakeCard number="05" title="Rotina alimentar" description="Como a alimentação se encaixa no seu dia?">
        <div className="intake-grid two-columns">
          <Field label="Refeições por dia" error={numericErrors.mealsPerDay}>
            <input ref={mealsRef} type="number" min="1" max="12" aria-invalid={Boolean(numericErrors.mealsPerDay)} value={intake.routine.mealsPerDay} onChange={(event) => { updateGroup("routine", { mealsPerDay: event.target.value }); setNumericErrors((current) => ({ ...current, mealsPerDay: undefined })); }} placeholder="Ex.: 5" />
          </Field>
          <Field label="Água por dia" error={numericErrors.waterLiters}>
            <input ref={waterRef} type="number" min="0" max="15" step="0.1" aria-invalid={Boolean(numericErrors.waterLiters)} value={intake.routine.waterLiters} onChange={(event) => { updateGroup("routine", { waterLiters: event.target.value }); setNumericErrors((current) => ({ ...current, waterLiters: undefined })); }} placeholder="Litros" />
          </Field>
          <Field label="Refeições fora de casa">
            <select value={intake.routine.eatingOutFrequency} onChange={(event) => updateGroup("routine", { eatingOutFrequency: event.target.value })}>
              <option value="">Selecione uma opção</option>
              <option value="never">Nunca ou raramente</option>
              <option value="1-2">1 a 2 vezes por semana</option>
              <option value="3-5">3 a 5 vezes por semana</option>
              <option value="daily">Todos os dias</option>
            </select>
          </Field>
          <Field label="Horários e rotina">
            <input maxLength={150} value={intake.routine.eatingSchedule} onChange={(event) => updateGroup("routine", { eatingSchedule: event.target.value })} placeholder="Ex.: almoço às 12h e jantar às 20h" />
          </Field>
          <Field label="Principais dificuldades" className="full-column">
            <textarea maxLength={300} rows={3} value={intake.routine.difficulties} onChange={(event) => updateGroup("routine", { difficulties: event.target.value })} placeholder="Ex.: pouco tempo para cozinhar durante a semana" />
          </Field>
        </div>
      </IntakeCard>

      <IntakeCard number="06" title="Estilo de vida" description="Hábitos que ajudam a contextualizar seu acompanhamento.">
        <div className="intake-grid two-columns">
          <Field label="Atividade física">
            <input maxLength={100} value={intake.lifestyle.activityType} onChange={(event) => updateGroup("lifestyle", { activityType: event.target.value })} placeholder="Ex.: musculação e caminhada" />
          </Field>
          <Field label="Frequência semanal">
            <select value={intake.lifestyle.activityFrequency} onChange={(event) => updateGroup("lifestyle", { activityFrequency: event.target.value })}>
              <option value="">Selecione uma opção</option>
              <option value="none">Não pratico</option>
              <option value="1-2">1 a 2 vezes</option>
              <option value="3-4">3 a 4 vezes</option>
              <option value="5-plus">5 vezes ou mais</option>
            </select>
          </Field>
          <Field label="Horas de sono" error={numericErrors.sleepHours}>
            <input ref={sleepRef} type="number" min="0" max="24" step="0.5" aria-invalid={Boolean(numericErrors.sleepHours)} value={intake.lifestyle.sleepHours} onChange={(event) => { updateGroup("lifestyle", { sleepHours: event.target.value }); setNumericErrors((current) => ({ ...current, sleepHours: undefined })); }} placeholder="Ex.: 8" />
          </Field>
          <Field label="Consumo de álcool">
            <select value={intake.lifestyle.alcohol} onChange={(event) => updateGroup("lifestyle", { alcohol: event.target.value })}>
              <option value="">Selecione uma opção</option>
              <option value="none">Não consumo</option>
              <option value="occasional">Ocasionalmente</option>
              <option value="weekly">Semanalmente</option>
              <option value="daily">Diariamente</option>
            </select>
          </Field>
          <Field label="Tabagismo" className="full-column">
            <select value={intake.lifestyle.smoking} onChange={(event) => updateGroup("lifestyle", { smoking: event.target.value })}>
              <option value="">Selecione uma opção</option>
              <option value="never">Nunca fumei</option>
              <option value="former">Ex-fumante</option>
              <option value="current">Fumante</option>
            </select>
          </Field>
        </div>
      </IntakeCard>

      <IntakeCard number="07" title="Observações" description="Use este espaço para qualquer outra informação importante.">
        <Field label="O que mais você gostaria de contar?">
          <textarea
            maxLength={500}
            rows={5}
            value={intake.observations}
            onChange={(event) => {
              setIntake((current) => ({ ...current, observations: event.target.value }));
            }}
            placeholder="Escreva aqui outras informações sobre sua alimentação, saúde ou rotina"
          />
        </Field>
      </IntakeCard>

      <footer className="intake-actions">
        <div />
        <button type="submit" disabled={busy || loading}>{busy ? "Salvando..." : "Salvar informações"}</button>
      </footer>
    </form>
  );
}
