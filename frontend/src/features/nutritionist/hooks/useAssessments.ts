import { useCallback, useState } from "react";
import { useAutoSave } from "../../../hooks/useAutoSave";
import { listFollowUps, saveFollowUp } from "../../care/clinical-api";
import { useClinicalHistory } from "./useClinicalHistory";

export function useAssessments(token: string, patientId: string) {
  const loadPage = useCallback(
    (offset: number) => listFollowUps(token, patientId, offset),
    [token, patientId],
  );
  const history = useClinicalHistory(
    loadPage,
    "Não foi possível carregar as avaliações.",
  );
  const [id, setId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const save = useAutoSave(
    text.trim() ? JSON.stringify([id, text]) : null,
    async () => {
      await saveFollowUp(token, patientId, id, text);
      await history.refresh();
    },
  );

  return {
    history,
    text,
    setText,
    save,
    startNew: () => {
      setId(crypto.randomUUID());
      setText("");
    },
  };
}
