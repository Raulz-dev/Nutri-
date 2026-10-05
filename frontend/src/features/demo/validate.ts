import type { DemoState } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const list = (value: unknown, check: (item: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(check);
const food = (value: unknown) =>
  record(value) && text(value.id) && text(value.name) && number(value.grams);
const meal = (value: unknown) =>
  record(value) &&
  text(value.id) &&
  text(value.title) &&
  text(value.time) &&
  list(value.foods, food) &&
  list(
    value.substitutions,
    (item) => record(item) && text(item.id) && list(item.foods, food),
  ) &&
  [value.calories, value.protein, value.carbs, value.fats].every(number);
const actor = (value: unknown) =>
  record(value) &&
  text(value.id) &&
  text(value.name) &&
  text(value.email) &&
  ["patient", "nutritionist", "admin"].includes(String(value.role)) &&
  ["active", "blocked"].includes(String(value.status));
const intake = (value: unknown) =>
  record(value) &&
  value.version === 1 &&
  ["goal", "food", "restrictions", "health", "routine", "lifestyle"].every(
    (key) => record(value[key]),
  ) &&
  text(value.observations);

export function isDemoState(value: unknown): value is DemoState {
  if (!record(value) || value.version !== 1) return false;
  return (
    list(value.actors, actor) &&
    list(
      value.links,
      (item) =>
        record(item) &&
        text(item.patientId) &&
        text(item.nutritionistId) &&
        text(item.linkedAt) &&
        (item.conversationId === undefined || text(item.conversationId)),
    ) &&
    list(
      value.plans,
      (item) =>
        record(item) &&
        text(item.id) &&
        text(item.patientId) &&
        text(item.authorId) &&
        text(item.authorName) &&
        text(item.title) &&
        text(item.startDate) &&
        text(item.endDate) &&
        number(item.waterLiters) &&
        text(item.guidance) &&
        ["draft", "published", "closed"].includes(String(item.status)) &&
        text(item.createdAt) &&
        list(item.meals, meal),
    ) &&
    list(
      value.measurements,
      (item) =>
        record(item) &&
        text(item.id) &&
        text(item.patientId) &&
        text(item.authorId) &&
        text(item.authorName) &&
        text(item.date) &&
        number(item.weight) &&
        (item.bodyFat === null || number(item.bodyFat)) &&
        text(item.note),
    ) &&
    list(
      value.followUps,
      (item) =>
        record(item) &&
        text(item.id) &&
        text(item.patientId) &&
        text(item.authorId) &&
        text(item.authorName) &&
        text(item.date) &&
        text(item.text),
    ) &&
    list(
      value.appointments,
      (item) =>
        record(item) &&
        text(item.id) &&
        text(item.patientId) &&
        text(item.authorId) &&
        text(item.authorName) &&
        text(item.date) &&
        text(item.time) &&
        ["Presencial", "Online"].includes(String(item.format)) &&
        text(item.location) &&
        text(item.guidance) &&
        ["scheduled", "completed", "cancelled"].includes(String(item.status)),
    ) &&
    list(
      value.conversations,
      (item) =>
        record(item) &&
        text(item.id) &&
        text(item.patientId) &&
        text(item.nutritionistId) &&
        list(
          item.messages,
          (message) =>
            record(message) &&
            text(message.id) &&
            ["patient", "nutritionist"].includes(String(message.sender)) &&
            text(message.text) &&
            text(message.sentAt) &&
            typeof message.read === "boolean",
        ),
    ) &&
    record(value.intakes) &&
    Object.values(value.intakes).every(intake) &&
    record(value.profiles) &&
    Object.values(value.profiles).every(
      (item) =>
        record(item) &&
        text(item.name) &&
        text(item.crn) &&
        text(item.contact) &&
        text(item.bio),
    ) &&
    (value.weightGoals === undefined ||
      (record(value.weightGoals) &&
        Object.values(value.weightGoals).every(number)))
  );
}
