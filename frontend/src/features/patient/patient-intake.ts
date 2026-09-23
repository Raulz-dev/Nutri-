export const PATIENT_INTAKE_STORAGE_KEY = "mais-saude:patient-intake:v1";

export type PatientGoal = "weight-loss" | "muscle-gain" | "food-education" | "performance" | "clinical-control" | "other" | "";
export type DietaryPattern = "omnivore" | "vegetarian" | "vegan" | "pescatarian" | "other" | "";

export type PatientIntake = {
  version: 1;
  goal: { primary: PatientGoal; details: string };
  food: {
    liked: string[];
    disliked: string[];
    avoided: string[];
    pattern: DietaryPattern;
    otherPattern: string;
  };
  restrictions: {
    allergies: string[];
    noAllergies: boolean;
    intolerances: string[];
    noIntolerances: boolean;
    other: string;
  };
  health: {
    conditions: string[];
    medications: string[];
    supplements: string[];
    digestiveSymptoms: string;
  };
  routine: {
    mealsPerDay: string;
    eatingSchedule: string;
    waterLiters: string;
    eatingOutFrequency: string;
    difficulties: string;
  };
  lifestyle: {
    activityType: string;
    activityFrequency: string;
    sleepHours: string;
    alcohol: string;
    smoking: string;
  };
  observations: string;
};

export const emptyPatientIntake: PatientIntake = {
  version: 1,
  goal: { primary: "", details: "" },
  food: { liked: [], disliked: [], avoided: [], pattern: "", otherPattern: "" },
  restrictions: { allergies: [], noAllergies: false, intolerances: [], noIntolerances: false, other: "" },
  health: { conditions: [], medications: [], supplements: [], digestiveSymptoms: "" },
  routine: { mealsPerDay: "", eatingSchedule: "", waterLiters: "", eatingOutFrequency: "", difficulties: "" },
  lifestyle: { activityType: "", activityFrequency: "", sleepHours: "", alcohol: "", smoking: "" },
  observations: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function tags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function flag(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

export function readPatientIntake(): PatientIntake {
  try {
    const stored = localStorage.getItem(PATIENT_INTAKE_STORAGE_KEY);
    if (!stored) return structuredClone(emptyPatientIntake);
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value) || value.version !== 1) return structuredClone(emptyPatientIntake);

    const goal = isRecord(value.goal) ? value.goal : {};
    const food = isRecord(value.food) ? value.food : {};
    const restrictions = isRecord(value.restrictions) ? value.restrictions : {};
    const health = isRecord(value.health) ? value.health : {};
    const routine = isRecord(value.routine) ? value.routine : {};
    const lifestyle = isRecord(value.lifestyle) ? value.lifestyle : {};

    return {
      version: 1,
      goal: { primary: text(goal.primary) as PatientGoal, details: text(goal.details) },
      food: {
        liked: tags(food.liked),
        disliked: tags(food.disliked),
        avoided: tags(food.avoided),
        pattern: text(food.pattern) as DietaryPattern,
        otherPattern: text(food.otherPattern),
      },
      restrictions: {
        allergies: tags(restrictions.allergies),
        noAllergies: flag(restrictions.noAllergies),
        intolerances: tags(restrictions.intolerances),
        noIntolerances: flag(restrictions.noIntolerances),
        other: text(restrictions.other),
      },
      health: {
        conditions: tags(health.conditions),
        medications: tags(health.medications),
        supplements: tags(health.supplements),
        digestiveSymptoms: text(health.digestiveSymptoms),
      },
      routine: {
        mealsPerDay: text(routine.mealsPerDay),
        eatingSchedule: text(routine.eatingSchedule),
        waterLiters: text(routine.waterLiters),
        eatingOutFrequency: text(routine.eatingOutFrequency),
        difficulties: text(routine.difficulties),
      },
      lifestyle: {
        activityType: text(lifestyle.activityType),
        activityFrequency: text(lifestyle.activityFrequency),
        sleepHours: text(lifestyle.sleepHours),
        alcohol: text(lifestyle.alcohol),
        smoking: text(lifestyle.smoking),
      },
      observations: text(value.observations),
    };
  } catch {
    return structuredClone(emptyPatientIntake);
  }
}

export function savePatientIntake(value: PatientIntake) {
  localStorage.setItem(PATIENT_INTAKE_STORAGE_KEY, JSON.stringify(value));
}
