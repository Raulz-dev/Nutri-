import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Measurement } from "../demo/types";
import { getPatient, type PatientRow } from "./api";
import { getCurrentPlan, type MealPlanRecord } from "./meal-plan-api";
import { getNextAppointment, type AppointmentRecord } from "./interaction-api";
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
  mealPlan: MealPlanRecord | null;
  nextAppointment: AppointmentRecord | null;
  appointmentLoading: boolean;
  appointmentError: string;
  planLoading: boolean;
  planError: string;
  measurements: Measurement[];
  firstMeasurement: Measurement | null;
  measurementTotal: number;
  loading: boolean;
  error: string;
  acceptIntake: (record: IntakeRecord) => void;
  reloadMeasurements: () => Promise<void>;
  reloadWeightGoal: () => Promise<void>;
  reloadMealPlan: () => Promise<void>;
  reloadNextAppointment: () => Promise<void>;
};

const Context = createContext<PatientClinicalState | null>(null);

export function PatientClinicalProvider({ token, patientId, children }: {
  token: string; patientId: string; children: ReactNode;
}) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [weightGoal, setWeightGoal] = useState<WeightGoalRecord | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlanRecord | null>(null);
  const [nextAppointment, setNextAppointment] = useState<AppointmentRecord | null>(null);
  const [appointmentLoading, setAppointmentLoading] = useState(true);
  const [appointmentError, setAppointmentError] = useState("");
  const [planLoading, setPlanLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [firstMeasurement, setFirstMeasurement] = useState<Measurement | null>(null);
  const [measurementTotal, setMeasurementTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clinicalError, setClinicalError] = useState("");
  const [planError, setPlanError] = useState("");
  const planRequestId = useRef(0);
  const appointmentRequestId = useRef(0);

  const acceptIntake = useCallback((record: IntakeRecord) => setIntake(record), []);
  const reloadWeightGoal = useCallback(async () => setWeightGoal(await getWeightGoal(token, patientId)), [token, patientId]);
  const reloadMeasurements = useCallback(async () => {
    const overview = await measurementOverview(token, patientId);
    setMeasurements(overview.recent.map(toMeasurement).reverse());
    setFirstMeasurement(overview.oldest ? toMeasurement(overview.oldest) : null);
    setMeasurementTotal(overview.total);
  }, [token, patientId]);
  const reloadMealPlan = useCallback(async () => {
    const requestId = ++planRequestId.current;
    setPlanLoading(true);
    setPlanError("");
    try {
      const plan = await getCurrentPlan(token, patientId);
      if (requestId === planRequestId.current) setMealPlan(plan);
    } catch (reason) {
      if (requestId === planRequestId.current) {
        setMealPlan(null);
        setPlanError(reason instanceof Error ? reason.message : "Falha ao carregar o plano alimentar.");
      }
    } finally {
      if (requestId === planRequestId.current) setPlanLoading(false);
    }
  }, [token, patientId]);
  const reloadNextAppointment = useCallback(async () => {
    const requestId = ++appointmentRequestId.current;
    setAppointmentLoading(true);
    setAppointmentError("");
    try {
      const appointment = await getNextAppointment(token);
      if (requestId === appointmentRequestId.current) setNextAppointment(appointment);
    } catch (reason) {
      if (requestId === appointmentRequestId.current) {
        setNextAppointment(null);
        setAppointmentError(reason instanceof Error ? reason.message : "Falha ao carregar a próxima consulta.");
      }
    } finally {
      if (requestId === appointmentRequestId.current) setAppointmentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    setPatient(null);
    setIntake(null);
    setWeightGoal(null);
    setMeasurements([]);
    setFirstMeasurement(null);
    setMeasurementTotal(0);
    setLoading(true);
    setClinicalError("");
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
      .catch(reason => { if (active) setClinicalError(reason instanceof Error ? reason.message : "Falha ao carregar o acompanhamento."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, patientId]);

  useEffect(() => {
    setMealPlan(null);
    const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let loadedDay = day();
    void reloadMealPlan();
    const onFocus = () => { loadedDay = day(); void reloadMealPlan(); };
    const interval = window.setInterval(() => {
      const currentDay = day();
      if (currentDay !== loadedDay) { loadedDay = currentDay; void reloadMealPlan(); }
    }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => {
      planRequestId.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [reloadMealPlan]);

  useEffect(() => {
    setNextAppointment(null);
    void reloadNextAppointment();
    const onFocus = () => { void reloadNextAppointment(); };
    window.addEventListener("focus", onFocus);
    return () => {
      appointmentRequestId.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [reloadNextAppointment]);

  const error = clinicalError || planError || appointmentError;
  const value = useMemo(() => ({
    patient, intake, weightGoal, mealPlan, planLoading, planError, nextAppointment, appointmentLoading, appointmentError,
    measurements, firstMeasurement, measurementTotal, loading, error, acceptIntake,
    reloadMeasurements, reloadWeightGoal, reloadMealPlan, reloadNextAppointment,
  }), [patient, intake, weightGoal, mealPlan, measurements, firstMeasurement, measurementTotal,
    planLoading, planError, nextAppointment, appointmentLoading, appointmentError, loading, error,
    acceptIntake, reloadMeasurements, reloadWeightGoal, reloadMealPlan, reloadNextAppointment]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePatientClinical() {
  const value = useContext(Context);
  if (!value) throw new Error("PatientClinicalProvider não encontrado.");
  return value;
}
