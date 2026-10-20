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
