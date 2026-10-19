import { useRef, useState } from "react";
import {
  createMealPlan,
  publishMealPlan,
  updateMealPlan,
  type MealPlanRecord,
} from "../../care/meal-plan-api";
import { validatePlan } from "../../care/plan-validation";
import { createPlanDraft } from "../plan-draft";

export function usePlanEditor({
  patientId,
  source,
  author,
  token,
  onClose,
  onSaved,
}: {
  patientId: string;
  source?: MealPlanRecord;
  author: { id: string; name: string };
  token: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const saving = useRef(false);
  const savedDraft = useRef(source?.status === "draft" ? source : null);
  const [plan, setPlan] = useState(() =>
    createPlanDraft(patientId, author, source),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(publish: boolean) {
    if (saving.current) return;
    let draftSaved = false;
    try {
      validatePlan(plan);
      saving.current = true;
      setBusy(true);
      setError("");
      const previous = savedDraft.current;
      const draft = previous
        ? await updateMealPlan(
            token,
            patientId,
            { ...plan, id: previous.id },
            previous.revision,
          )
        : await createMealPlan(token, patientId, plan);
      savedDraft.current = draft;
      setPlan((current) => ({
        ...current,
        id: draft.id,
        createdAt: draft.createdAt,
      }));
      draftSaved = true;
      onSaved?.();
      if (publish) {
        await publishMealPlan(token, patientId, draft.id, draft.revision);
        onSaved?.();
      }
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o plano.";
      setError(
        draftSaved && publish
          ? `Rascunho salvo, mas não foi possível publicar. ${message}`
          : message,
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return { plan, setPlan, busy, error, save };
}
