export const patientMock = {
  name: "Camila",
  fullName: "Camila Ferreira",
  email: "camila@exemplo.com",
  nutritionist: "Dra. Marina Costa",
  nextAppointment: "28 de setembro, 14h30",
  currentWeight: "68,4 kg",
  weightChange: "-2,1 kg",
  bodyFat: "24,8%",
  bodyFatChange: "-1,6% desde o início",
  dailyCalories: "1.667 kcal",
  goal: "65 kg",
  goalDetail: "Faltam 3,4 kg para alcançar",
  goalProgress: 64,
  mealPlan: {
    title: "Plano da Camila",
    startDate: "24 set",
    validUntil: "24 out 2026",
    dailyWaterGoal: "2,2 L",
  },
  reminders: [
    { id: 1, title: "Registrar o peso semanal", detail: "Amanhã, pela manhã" },
    { id: 2, title: "Preparar exames recentes", detail: "Levar para a próxima consulta" },
  ],
  guidance: "Mantenha os horários das refeições e observe os sinais de fome e saciedade ao longo do dia.",
  meals: [
    { time: "07:30", title: "Café da manhã", foods: ["Iogurte natural — 170 g", "Banana — 90 g", "Aveia em flocos — 20 g"], substitutions: [{ id: "leite-mamao", foods: ["Leite — 200 g", "Mamão — 100 g", "Aveia em flocos — 20 g"] }], preparation: "Misture a aveia ao iogurte e acrescente a fruta picada.", macros: { calories: "318 kcal", protein: "13 g", carbs: "49 g", fats: "8 g" }, done: true },
    { time: "10:30", title: "Lanche da manhã", foods: ["Castanhas — 30 g", "Maçã — 130 g"], substitutions: [{ id: "pera", foods: ["Pera — 130 g", "Pasta de amendoim — 20 g"] }, { id: "mexerica", foods: ["Mexerica — 130 g", "Pasta de amendoim — 20 g"] }], preparation: "Consuma a fruta com casca sempre que possível.", macros: { calories: "242 kcal", protein: "5 g", carbs: "26 g", fats: "15 g" }, done: true },
    { time: "12:30", title: "Almoço", foods: ["Arroz integral — 100 g", "Feijão — 100 g", "Frango grelhado — 120 g", "Salada variada — 160 g"], substitutions: [{ id: "peixe", foods: ["Batata-doce — 130 g", "Feijão — 100 g", "Peixe — 120 g", "Salada variada — 160 g"] }, { id: "carne-magra", foods: ["Batata-doce — 130 g", "Feijão — 100 g", "Carne magra — 120 g", "Salada variada — 160 g"] }], preparation: "Grelhe a proteína com pouco óleo. Tempere a salada com limão, ervas e azeite.", macros: { calories: "486 kcal", protein: "46 g", carbs: "51 g", fats: "11 g" }, done: true },
    { time: "16:00", title: "Lanche da tarde", foods: ["Pão integral — 50 g", "Queijo branco — 40 g", "Tomate — 45 g"], substitutions: [{ id: "tapioca-frango", foods: ["Tapioca — 60 g", "Frango desfiado — 60 g", "Tomate — 45 g"] }], preparation: "Monte o sanduíche sem molhos industrializados.", macros: { calories: "267 kcal", protein: "15 g", carbs: "29 g", fats: "10 g" }, done: false },
    { time: "20:00", title: "Jantar", foods: ["Sopa de legumes — 400 g", "Frango desfiado — 80 g"], substitutions: [{ id: "omelete", foods: ["Omelete com legumes — 100 g", "Salada — 100 g", "Frango desfiado — 80 g"] }], preparation: "Evite creme de leite e temperos prontos. Use ervas frescas.", macros: { calories: "354 kcal", protein: "35 g", carbs: "34 g", fats: "9 g" }, done: false },
  ],
  measurements: [
    { date: "03 set", weight: 70.5, bodyFat: 26.4 },
    { date: "10 set", weight: 69.8, bodyFat: 25.8 },
    { date: "17 set", weight: 69.1, bodyFat: 25.2 },
    { date: "24 set", weight: 68.4, bodyFat: 24.8 },
  ],
  messages: [
    { id: 1, author: "Dra. Marina", preview: "Como você se sentiu com o novo plano?", time: "09:42", unread: true },
    { id: 2, author: "Dra. Marina", preview: "Sua evolução desta semana foi muito boa.", time: "Ontem", unread: false },
  ],
};

export type PatientSection = "home" | "meal-plan" | "progress" | "messages" | "profile";
