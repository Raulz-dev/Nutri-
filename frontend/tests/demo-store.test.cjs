const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");

const source = buildSync({
  stdin: {
    contents:
      'export * from "./src/features/demo/store"; export * from "./src/features/demo/actions";',
    resolveDir: path.resolve(__dirname, ".."),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
}).outputFiles[0].text;
function setup(legacy = {}) {
  const values = new Map(Object.entries(legacy));
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    require,
    module,
    exports: module.exports,
    localStorage: storage,
    window: new EventTarget(),
    Event,
    structuredClone,
    crypto: { randomUUID },
    console,
  });
  const api = module.exports;
  const actor = {
    id: "real-professional",
    name: "Profissional",
    email: "n@test.invalid",
    role: "nutritionist",
    status: "active",
  };
  api.registerActor(actor);
  return { api, actor, storage };
}
function draft(api, actor) {
  return {
    id: randomUUID(),
    patientId: "demo-04",
    authorId: actor.id,
    authorName: actor.name,
    title: "Plano",
    startDate: api.today(),
    endDate: "2099-12-31",
    waterLiters: 2,
    guidance: "",
    status: "draft",
    createdAt: new Date().toISOString(),
    meals: [
      {
        id: "meal",
        title: "Almoço",
        time: "12:00",
        foods: [{ id: "food", name: "Arroz", grams: 100 }],
        substitutions: [],
        calories: 300,
        protein: 20,
        carbs: 30,
        fats: 10,
      },
    ],
  };
}

test("migra preferências somente para Camila e preserva vínculos legados", () => {
  const { api } = setup({
    "mais-saude:patient-intake:v1": JSON.stringify({
      version: 1,
      goal: { primary: "weight-loss", details: "Legado" },
    }),
    "mais-saude-admin-links-v1": JSON.stringify([
      {
        patientId: "demo-04",
        nutritionistId: "demo-02",
        linkedAt: "2026-01-01",
      },
    ]),
  });
  const state = api.readDemo();
  assert.equal(state.intakes["demo-03"].goal.details, "Legado");
  assert.equal(Object.keys(state.intakes).length, 1);
  assert.equal(state.links[0].nutritionistId, "demo-02");
  assert.equal(state.actors[0].id, "real-professional");
});

test("rascunho não fica ativo; publicar substitui e preserva versão anterior", () => {
  const { api, actor } = setup();
  api.transferPatient("demo-04", actor.id);
  const first = draft(api, actor);
  api.savePlan(first, actor, false);
  assert.equal(api.activePlan(api.readDemo(), "demo-04"), undefined);
  api.savePlan(first, actor, true);
  const second = draft(api, actor);
  api.savePlan(second, actor, true);
  assert.equal(api.activePlan(api.readDemo(), "demo-04").id, second.id);
  assert.equal(
    api.readDemo().plans.find((p) => p.id === first.id).status,
    "closed",
  );
  assert.throws(() => api.savePlan(first, actor, true), /rascunho/);
});

test("validade é inclusiva, início futuro bloqueia e encerramento permite transferência", () => {
  const { api, actor } = setup();
  api.transferPatient("demo-04", actor.id);
  const plan = draft(api, actor);
  plan.endDate = api.today();
  api.savePlan(plan, actor, true);
  assert.throws(() => api.transferPatient("demo-04", "demo-02"), /Encerre/);
  assert.throws(() => api.transferPatient("demo-04", null), /Encerre/);
  api.updateDemo((s) => {
    const p = s.plans.find((p) => p.id === plan.id);
    p.startDate = "2099-01-01";
    p.endDate = "2099-12-31";
  });
  assert.throws(() => api.transferPatient("demo-04", "demo-02"), /Encerre/);
  api.closePlan(plan.id, actor);
  api.transferPatient("demo-04", "demo-02");
  assert.equal(
    api.readDemo().links.find((l) => l.patientId === "demo-04").nutritionistId,
    "demo-02",
  );
});

test("plano vencido permite troca sem apagar histórico e com uma nova conversa", () => {
  const { api, actor } = setup();
  api.transferPatient("demo-04", actor.id);
  const plan = draft(api, actor);
  plan.startDate = "2020-01-01";
  plan.endDate = "2020-01-02";
  api.savePlan(plan, actor, true);
  api.sendMessage("demo-04", "nutritionist", "Histórico privado", actor.id);
  const previousId = api
    .readDemo()
    .links.find((l) => l.patientId === "demo-04").conversationId;
  api.transferPatient("demo-04", "demo-02");
  let state = api.readDemo();
  const nextId = state.links.find(
    (l) => l.patientId === "demo-04",
  ).conversationId;
  assert.notEqual(previousId, nextId);
  assert.equal(
    state.conversations.find((c) => c.id === nextId).messages.length,
    0,
  );
  assert.equal(
    state.conversations.find((c) => c.id === previousId).messages[0].text,
    "Histórico privado",
  );
  assert.equal(state.plans.find((p) => p.id === plan.id).authorId, actor.id);
  assert.throws(
    () => api.sendMessage("demo-04", "nutritionist", "Bloqueada", actor.id),
    /vinculado/,
  );
  api.transferPatient("demo-04", actor.id);
  state = api.readDemo();
  assert.notEqual(
    state.links.find((l) => l.patientId === "demo-04").conversationId,
    previousId,
  );
});

test("revalida vínculo ao salvar e rejeita refeições inválidas", () => {
  const { api, actor } = setup();
  api.transferPatient("demo-04", actor.id);
  const plan = draft(api, actor);
  plan.meals[0].foods[0].grams = 0;
  assert.throws(() => api.savePlan(plan, actor, true), /gramas/);
  plan.meals[0].foods[0].grams = 100;
  api.transferPatient("demo-04", "demo-02");
  assert.throws(() => api.savePlan(plan, actor, true), /vinculado/);
});

for (const invalid of ["{invalid", '{"version":2}', '{"version":1,"actors":[]}']) {
  test(`recupera dados demonstrativos inválidos: ${invalid}`, () => {
    const { api, storage } = setup({ "nutri-demo-v1": invalid });
    const recovered = api.readDemo();
    assert.equal(recovered.version, 1);
    assert.equal(recovered.actors[0].id, "real-professional");
    const backupKey = storage.getItem("nutri-demo-recovery-v1");
    assert.equal(storage.getItem(backupKey), invalid);
  });
}

test("salva preferências, observação e perfil pelas operações demonstrativas", () => {
  const { api, actor } = setup();
  api.transferPatient("demo-04", actor.id);
  const intake = structuredClone(api.readDemo().intakes["demo-03"]);
  intake.goal.primary = "muscle-gain";
  api.savePatientPreferences("demo-04", intake, actor);
  api.saveFollowUp("demo-04", "  Retorno realizado  ", actor);
  api.saveProfessionalProfile({ name: "  Nutri Teste  ", crn: "123", contact: "", bio: "" }, actor);
  const state = api.readDemo();
  assert.equal(state.intakes["demo-04"].goal.primary, "muscle-gain");
  assert.equal(state.followUps.at(-1).text, "Retorno realizado");
  assert.equal(state.profiles[actor.id].name, "Nutri Teste");
  assert.throws(() => api.savePatientPreferences("demo-03", intake, actor), /vinculado/);
  assert.throws(() => api.saveFollowUp("demo-03", "nota", actor), /vinculado/);
});
