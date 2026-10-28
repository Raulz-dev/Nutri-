import type { PatientIntake } from "../care/patient-intake";

export type NumericErrors = Partial<
  Record<"mealsPerDay" | "waterLiters" | "sleepHours", string>
>;

export function validatePatientIntake(intake: PatientIntake) {
  const numericErrors: NumericErrors = {
    mealsPerDay: validateOptionalNumber(
      intake.routine.mealsPerDay,
      1,
      12,
      1,
      "Informe entre 1 e 12 refeições inteiras.",
    ),
    waterLiters: validateOptionalNumber(
      intake.routine.waterLiters,
      0,
      15,
      0.1,
      "Informe entre 0 e 15 litros, em passos de 0,1.",
    ),
    sleepHours: validateOptionalNumber(
      intake.lifestyle.sleepHours,
      0,
      24,
      0.5,
      "Informe entre 0 e 24 horas, em passos de 0,5.",
    ),
  };
  return { goalError: !intake.goal.primary, numericErrors };
}

function validateOptionalNumber(
  value: string,
  minimum: number,
  maximum: number,
  step: number,
  message: string,
) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  const steps = (number - minimum) / step;
  return Number.isFinite(number) &&
    number >= minimum &&
    number <= maximum &&
    Math.abs(steps - Math.round(steps)) < 1e-8
    ? undefined
    : message;
}
