import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoSave } from "../../../hooks/useAutoSave";
import { today } from "../../../lib/formatters";
import {
  listMeasurements,
  saveMeasurement,
  toMeasurement,
  type ClinicalMeasurement,
} from "../../care/clinical-api";
import { useClinicalHistory } from "./useClinicalHistory";
import { validClinicalDecimal } from "../clinical-validation";

export function useMeasurements(token: string, patientId: string) {
  const loadPage = useCallback(
    (offset: number) => listMeasurements(token, patientId, offset),
    [token, patientId],
  );
  const history = useClinicalHistory(
    loadPage,
    "Não foi possível carregar as medições.",
  );
  const [recent, setRecent] = useState<ClinicalMeasurement[]>([]);
  const [chartError, setChartError] = useState("");
  const chartRequest = useRef(0);
  const mounted = useRef(false);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");

  const refreshChart = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++chartRequest.current;
    try {
      const result = await listMeasurements(token, patientId, 0, 8);
      if (request !== chartRequest.current || !mounted.current) return;
      setRecent(result.items);
      setChartError("");
    } catch (reason) {
      if (request === chartRequest.current && mounted.current) {
        setChartError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível atualizar o gráfico.",
        );
      }
    }
  }, [token, patientId]);

  useEffect(() => {
    mounted.current = true;
    void refreshChart();
    return () => {
      mounted.current = false;
      chartRequest.current += 1;
    };
  }, [refreshChart]);

  const valid =
    Boolean(date) &&
    date <= today() &&
    validClinicalDecimal(weight, 0.1, 500) &&
    (!bodyFat || validClinicalDecimal(bodyFat, 0, 100));
  const save = useAutoSave(
    valid ? JSON.stringify([id, date, weight, bodyFat, note]) : null,
    async () => {
      await saveMeasurement(token, patientId, id, {
        measured_on: date,
        weight_kg: Number(weight),
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
        note,
      });
      await Promise.all([history.refresh(), refreshChart()]);
    },
  );

  function startNew() {
    setId(crypto.randomUUID());
    setDate(today());
    setWeight("");
    setBodyFat("");
    setNote("");
  }

  const chartMeasurements = [...recent].reverse().map(toMeasurement);

  return {
    history,
    chartMeasurements,
    chartError,
    refreshChart,
    date,
    setDate,
    weight,
    setWeight,
    bodyFat,
    setBodyFat,
    note,
    setNote,
    save,
    startNew,
  };
}
