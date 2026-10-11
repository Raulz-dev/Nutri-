import type { User } from "../users/types";
import type { PatientIntake } from "../patient/patient-intake";
import type {
  Appointment,
  Measurement,
  Plan,
  ProfessionalProfile,
} from "./types";
import { validatePlan } from "../care/plan-validation";
import { assertResponsible, updateDemo } from "./store";

export { validatePlan } from "../care/plan-validation";
export function savePlan(plan: Plan, actor: User, publish: boolean) {
  validatePlan(plan);
  return updateDemo((state) => {
    assertResponsible(state, plan.patientId, actor.id);
    const existing = state.plans.find((p) => p.id === plan.id);
    if (
      existing &&
      (existing.authorId !== actor.id || existing.status !== "draft")
    )
      throw new Error("Crie um novo rascunho para editar este plano.");
    if (publish)
      state.plans.forEach((p) => {
        if (p.patientId === plan.patientId && p.status === "published")
          p.status = "closed";
      });
    state.plans = state.plans.filter((p) => p.id !== plan.id);
    state.plans.push({
      ...plan,
      authorId: actor.id,
      authorName: state.profiles[actor.id]?.name || actor.name,
      status: publish ? "published" : "draft",
    });
  });
}
export function closePlan(id: string, actor: User) {
  return updateDemo((state) => {
    const plan = state.plans.find((p) => p.id === id);
    if (!plan) throw new Error("Plano não encontrado.");
    assertResponsible(state, plan.patientId, actor.id);
    plan.status = "closed";
  });
}
export function saveMeasurement(value: Measurement, actor: User) {
  if (
    !value.date ||
    !Number.isFinite(value.weight) ||
    value.weight <= 0 ||
    value.weight > 500 ||
    (value.bodyFat !== null &&
      (!Number.isFinite(value.bodyFat) ||
        value.bodyFat < 0 ||
        value.bodyFat > 100))
  )
    throw new Error("Revise a data, o peso e o percentual de gordura.");
  updateDemo((state) => {
    assertResponsible(state, value.patientId, actor.id);
    state.measurements.push(value);
  });
}
export function saveAppointment(value: Appointment, actor: User) {
  if (!value.date || !value.time || !value.location.trim())
    throw new Error("Preencha data, horário e local ou link.");
  if (value.format === "Online" && !/^https?:\/\//.test(value.location))
    throw new Error("Informe um link começando com https:// ou http://.");
  updateDemo((state) => {
    assertResponsible(state, value.patientId, actor.id);
    const existing = state.appointments.find((a) => a.id === value.id);
    if (existing) assertResponsible(state, existing.patientId, actor.id);
    if (existing && existing.authorId !== actor.id)
      throw new Error("Consulta de outro profissional.");
    state.appointments = [
      ...state.appointments.filter((a) => a.id !== value.id),
      {
        ...value,
        authorId: actor.id,
        authorName: state.profiles[actor.id]?.name || actor.name,
      },
    ];
  });
}
export function sendMessage(
  patientId: string,
  sender: "patient" | "nutritionist",
  text: string,
  actorId: string,
) {
  if (!text.trim()) return;
  updateDemo((state) => {
    const link = state.links.find((l) => l.patientId === patientId);
    if (!link) throw new Error("Este paciente ainda não tem nutricionista.");
    if (sender === "nutritionist") assertResponsible(state, patientId, actorId);
    else if (actorId !== patientId)
      assertResponsible(state, patientId, actorId);
    const conversation = state.conversations.find(
      (c) => c.id === link.conversationId,
    );
    if (!conversation) throw new Error("Conversa indisponível.");
    conversation.messages.push({
      id: crypto.randomUUID(),
      sender,
      text: text.trim(),
      sentAt: new Date().toISOString(),
      read: false,
    });
  });
}

export function savePatientPreferences(
  patientId: string,
  intake: PatientIntake,
  actor: User,
) {
  if (!intake.goal.primary)
    throw new Error("Selecione um objetivo para continuar.");
  updateDemo((state) => {
    if (actor.role === "nutritionist")
      assertResponsible(state, patientId, actor.id);
    else if (actor.role !== "patient" || actor.id !== patientId)
      throw new Error("Você não pode alterar estas preferências.");
    state.intakes[patientId] = structuredClone(intake);
  });
}

export function saveFollowUp(patientId: string, text: string, actor: User) {
  const note = text.trim();
  if (!note) throw new Error("Escreva uma observação.");
  updateDemo((state) => {
    assertResponsible(state, patientId, actor.id);
    state.followUps.push({
      id: crypto.randomUUID(),
      patientId,
      authorId: actor.id,
      authorName: state.profiles[actor.id]?.name || actor.name,
      date: new Date().toISOString(),
      text: note,
    });
  });
}

export function saveProfessionalProfile(
  profile: ProfessionalProfile,
  actor: User,
) {
  if (actor.role !== "nutritionist")
    throw new Error("Perfil de nutricionista indisponível.");
  if (profile.name.trim().length < 2)
    throw new Error("Informe seu nome de exibição.");
  updateDemo((state) => {
    state.profiles[actor.id] = { ...profile, name: profile.name.trim() };
  });
}

export function markConversationRead(
  conversationId: string,
  reader: "patient" | "nutritionist",
  patientId: string,
  actor: User,
) {
  updateDemo((state) => {
    const link = state.links.find((item) => item.patientId === patientId);
    if (link?.conversationId !== conversationId)
      throw new Error("Conversa indisponível.");
    if (reader === "nutritionist")
      assertResponsible(state, patientId, actor.id);
    else if (actor.role === "nutritionist")
      assertResponsible(state, patientId, actor.id);
    else if (actor.id !== patientId) throw new Error("Conversa indisponível.");
    const conversation = state.conversations.find(
      (item) => item.id === conversationId,
    );
    conversation?.messages.forEach((message) => {
      if (message.sender !== reader) message.read = true;
    });
  });
}
