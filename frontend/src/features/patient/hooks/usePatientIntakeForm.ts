import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  type PatientIntake,
  emptyPatientIntake,
} from "../../care/patient-intake";
import { usePatientData } from "../usePatientData";
import { useAuth } from "../../auth/useAuth";
import {
  useErrorToast,
  useSuccessToast,
} from "../../../components/ui/ErrorToast";
import { usePatientClinical } from "../../care/PatientClinicalContext";
import { saveIntake } from "../../care/clinical-api";

import {
  validatePatientIntake,
  type NumericErrors,
} from "../patient-intake-validation";

type IntakeGroup =
  | "goal"
  | "food"
  | "restrictions"
  | "health"
  | "routine"
  | "lifestyle";

export function usePatientIntakeForm() {
  const { patientId } = usePatientData();
  const clinical = usePatientClinical();
  const { session } = useAuth();
  const showError = useErrorToast();
  const [intake, setIntake] = useState(() =>
    structuredClone(emptyPatientIntake),
  );
  const [busy, setBusy] = useState(false);
  const [chapter, setChapter] = useState(0);
  const pendingFocus = useRef<HTMLInputElement | HTMLSelectElement | null>(
    null,
  );

  // Reveal the chapter before focusing a field that was hidden at submit time.
  useEffect(() => {
    pendingFocus.current?.focus();
    pendingFocus.current = null;
  });
  const savedIntake = JSON.stringify(
    clinical.intake?.intake ?? emptyPatientIntake,
  );
  useEffect(() => {
    setIntake(JSON.parse(savedIntake) as PatientIntake);
  }, [savedIntake]);
  const [goalError, setGoalError] = useState(false);
  const [numericErrors, setNumericErrors] = useState<NumericErrors>({});
  const showSuccess = useSuccessToast();
  const goalRef = useRef<HTMLSelectElement>(null);
  const mealsRef = useRef<HTMLInputElement>(null);
  const waterRef = useRef<HTMLInputElement>(null);
  const sleepRef = useRef<HTMLInputElement>(null);

  function updateGroup<K extends IntakeGroup>(
    group: K,
    values: Partial<PatientIntake[K]>,
  ) {
    setIntake((current) => ({
      ...current,
      [group]: { ...current[group], ...values },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { goalError: hasGoalError, numericErrors: nextNumericErrors } =
      validatePatientIntake(intake);
    const hasNumericError = Object.values(nextNumericErrors).some(Boolean);

    setGoalError(hasGoalError);
    setNumericErrors(nextNumericErrors);
    if (hasGoalError || hasNumericError) {
      showError(
        [
          hasGoalError ? "Selecione um objetivo para continuar." : "",
          ...Object.values(nextNumericErrors),
        ]
          .filter(Boolean)
          .join(" "),
      );
      setChapter(
        hasGoalError
          ? 0
          : nextNumericErrors.mealsPerDay || nextNumericErrors.waterLiters
            ? 4
            : 5,
      );
      pendingFocus.current = hasGoalError
        ? goalRef.current
        : nextNumericErrors.mealsPerDay
          ? mealsRef.current
          : nextNumericErrors.waterLiters
            ? waterRef.current
            : sleepRef.current;
      return;
    }

    setGoalError(false);
    setBusy(true);
    try {
      const saved = await saveIntake(
        session?.accessToken ?? "",
        patientId,
        intake,
        clinical.intake?.revision ?? 0,
      );
      clinical.acceptIntake(saved);
      showSuccess("Informações salvas na plataforma.");
    } catch (reason) {
      showError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    intake,
    setIntake,
    busy,
    loading: clinical.loading,
    chapter,
    setChapter,
    goalError,
    setGoalError,
    numericErrors,
    setNumericErrors,
    goalRef,
    mealsRef,
    waterRef,
    sleepRef,
    updateGroup,
    handleSubmit,
  };
}
