import { useEffect, useState } from "react";
import type { User } from "../users/types";
import { readAdminUsers } from "./users";
import { initialWeightGoals, seedDemo } from "./seed";
import type { DemoState, Plan } from "./types";
import { isDemoState } from "./validate";

export const DEMO_KEY = "nutri-demo-v1";
const EVENT = "nutri-demo-change";
export const DEMO_RECOVERY_KEY = "nutri-demo-recovery-v1";
let initial: DemoState | undefined;
let unreadableState = false;
export function readDemo(): DemoState {
  let stored: string | null;
  try {
    stored = localStorage.getItem(DEMO_KEY);
  } catch {
    unreadableState = true;
    return structuredClone((initial ??= seedDemo()));
  }
  if (stored) {
    try {
      const state: unknown = JSON.parse(stored);
      if (isDemoState(state)) {
        unreadableState = false;
        state.weightGoals ??= { ...initialWeightGoals };
        return state;
      }
    } catch {
      /* Recover malformed JSON below. */
    }
    try {
      const backupKey = `${DEMO_KEY}-backup-${Date.now()}`;
      localStorage.setItem(backupKey, stored);
      localStorage.setItem(DEMO_KEY, JSON.stringify((initial ??= seedDemo())));
      unreadableState = false;
      try {
        localStorage.setItem(DEMO_RECOVERY_KEY, backupKey);
      } catch {
        /* The recovered data remains available. */
      }
    } catch {
      unreadableState = true;
    }
  }
  return structuredClone((initial ??= seedDemo()));
}
export function updateDemo(change: (state: DemoState) => void) {
  const state = readDemo();
  if (unreadableState)
    throw new Error(
      "Os dados demonstrativos não estão disponíveis neste navegador.",
    );
  change(state);
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
  return state;
}
export function demoUsers(state: DemoState) {
  const users = readAdminUsers();
  return [
    ...users.filter((u) => !state.actors.some((a) => a.id === u.id)),
    ...state.actors,
  ];
}
export function useDemo() {
  const [state, setState] = useState(readDemo);
  useEffect(() => {
    function refresh() {
      setState(readDemo());
    }
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    // Refresh expiry-dependent views when returning to the tab or after midnight.
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}
export function registerActor(user: User) {
  const previous = readDemo().actors.find((a) => a.id === user.id);
  if (previous && JSON.stringify(previous) === JSON.stringify(user)) return;
  updateDemo((state) => {
    state.actors = [...state.actors.filter((a) => a.id !== user.id), user];
  });
}
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function activePlan(
  state: DemoState,
  patientId: string,
): Plan | undefined {
  return state.plans.find(
    (p) =>
      p.patientId === patientId &&
      p.status === "published" &&
      p.endDate >= today(),
  );
}
export function assertResponsible(
  state: DemoState,
  patientId: string,
  actorId: string,
) {
  if (
    !state.links.some(
      (l) => l.patientId === patientId && l.nutritionistId === actorId,
    )
  )
    throw new Error("Este paciente não está mais vinculado a você.");
}
export function transferPatient(
  patientId: string,
  nutritionistId: string | null,
) {
  return updateDemo((state) => {
    const users = demoUsers(state);
    const patient = users.find(
      (u) => u.id === patientId && u.role === "patient",
    );
    if (!patient || (nutritionistId && patient.status !== "active"))
      throw new Error("Paciente indisponível para vínculo.");
    if (
      nutritionistId &&
      !users.some(
        (u) =>
          u.id === nutritionistId &&
          u.role === "nutritionist" &&
          u.status === "active",
      )
    )
      throw new Error("Nutricionista indisponível.");
    const previous = state.links.find((l) => l.patientId === patientId);
    if (previous?.nutritionistId === nutritionistId) return;
    if (activePlan(state, patientId))
      throw new Error(
        "Encerre o plano alimentar ou aguarde o vencimento antes de alterar o vínculo.",
      );
    state.links = state.links.filter((l) => l.patientId !== patientId);
    if (nutritionistId) {
      const conversationId = crypto.randomUUID();
      state.links.push({
        patientId,
        nutritionistId,
        conversationId,
        linkedAt: new Date().toISOString(),
      });
      state.conversations.push({
        id: conversationId,
        patientId,
        nutritionistId,
        messages: [],
      });
    }
  });
}
export function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}
export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
export function nextAppointment(state: DemoState, patientId: string) {
  const owner = state.links.find(
    (l) => l.patientId === patientId,
  )?.nutritionistId;
  return state.appointments
    .filter(
      (a) =>
        a.patientId === patientId &&
        a.authorId === owner &&
        a.status === "scheduled" &&
        new Date(`${a.date}T${a.time}`).getTime() >= Date.now(),
    )
    .sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
    )[0];
}
