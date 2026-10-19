import { useEffect, useRef, useState } from "react";
import { useAutoSave } from "../../../hooks/useAutoSave";
import {
  getWeightGoal,
  saveWeightGoal,
  type WeightGoalRecord,
} from "../../care/clinical-api";
import { validClinicalDecimal } from "../clinical-validation";

export function useWeightGoal(token: string, patientId: string) {
  const [goal, setGoal] = useState<WeightGoalRecord | null>(null);
  const [value, setValue] = useState("");
  const dirty = useRef(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    setError("");
    getWeightGoal(token, patientId)
      .then((result) => {
        if (!active) return;
        revision.current = Math.max(revision.current, result.revision);
        setGoal(result);
        if (!dirty.current) setValue(result.target_kg?.toString() ?? "");
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar a meta.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, patientId, retry]);

  const save = useAutoSave(
    goal && dirty.current && validClinicalDecimal(value, 0.1, 500)
      ? value
      : null,
    async () => {
      const result = await saveWeightGoal(
        token,
        patientId,
        Number(value),
        revision.current,
      );
      revision.current = result.revision;
      setGoal(result);
    },
  );

  return {
    goal,
    value,
    error,
    save,
    change: (next: string) => {
      dirty.current = true;
      setValue(next);
    },
    reload: () => setRetry((current) => current + 1),
  };
}
