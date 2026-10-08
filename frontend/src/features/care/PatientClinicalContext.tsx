import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Measurement } from "../demo/types";
import { getPatient, type PatientRow } from "./api";
import {
  getIntake, getWeightGoal, measurementOverview,
  type ClinicalMeasurement, type IntakeRecord, type WeightGoalRecord,
} from "./clinical-api";

function toMeasurement(row: ClinicalMeasurement): Measurement {
  return {
    id: row.id, patientId: row.patient_id, authorId: row.author_id,
    authorName: row.author_name, date: row.measured_on,
    weight: row.weight_kg, bodyFat: row.body_fat_pct, note: row.note,
  };
}

type PatientClinicalState = {
  patient: PatientRow | null;
  intake: IntakeRecord | null;
  weightGoal: WeightGoalRecord | null;
  measurements: Measurement[];
  firstMeasurement: Measurement | null;
  measurementTotal: number;
  loading: boolean;
  error: string;
  acceptIntake: (record: IntakeRecord) => void;
  reloadMeasurements: () => Promise<void>;
  reloadWeightGoal: () => Promise<void>;
};

const Context = createContext<PatientClinicalState | null>(null);

export function PatientClinicalProvider({ token, patientId, children }: {
  token: string; patientId: string; children: ReactNode;
}) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [weightGoal, setWeightGoal] = useState<WeightGoalRecord | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [firstMeasurement, setFirstMeasurement] = useState<Measurement | null>(null);
  const [measurementTotal, setMeasurementTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const acceptIntake = useCallback((record: IntakeRecord) => setIntake(record), []);
  const reloadWeightGoal = useCallback(async () => setWeightGoal(await getWeightGoal(token, patientId)), [token, patientId]);
  const reloadMeasurements = useCallback(async () => {
    const overview = await measurementOverview(token, patientId);
    setMeasurements(overview.recent.map(toMeasurement).reverse());
    setFirstMeasurement(overview.oldest ? toMeasurement(overview.oldest) : null);
    setMeasurementTotal(overview.total);
  }, [token, patientId]);

  useEffect(() => {
    let active = true;
    setPatient(null);
    setIntake(null);
    setWeightGoal(null);
    setMeasurements([]);
    setFirstMeasurement(null);
    setMeasurementTotal(0);
    setLoading(true);
    setError("");
    Promise.all([getPatient(token, patientId), getIntake(token, patientId), getWeightGoal(token, patientId), measurementOverview(token, patientId)])
      .then(([person, preferences, goal, overview]) => {
        if (!active) return;
        setPatient(person);
        setIntake(preferences);
        setWeightGoal(goal);
        setMeasurements(overview.recent.map(toMeasurement).reverse());
        setFirstMeasurement(overview.oldest ? toMeasurement(overview.oldest) : null);
        setMeasurementTotal(overview.total);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar o acompanhamento."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, patientId]);

  const value = useMemo(() => ({
    patient, intake, weightGoal, measurements, firstMeasurement, measurementTotal,
    loading, error, acceptIntake, reloadMeasurements, reloadWeightGoal,
  }), [patient, intake, weightGoal, measurements, firstMeasurement, measurementTotal,
    loading, error, acceptIntake, reloadMeasurements, reloadWeightGoal]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePatientClinical() {
  const value = useContext(Context);
  if (!value) throw new Error("PatientClinicalProvider não encontrado.");
  return value;
}
