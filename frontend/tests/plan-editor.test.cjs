const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  act,
  loadSource,
  renderHook,
  deferred,
  reply,
} = require("./helpers/react.cjs");
const author = { id: "synthetic-nutritionist", name: "Profissional de teste" };
const meal = {
  id: "meal",
  title: "Refeição de teste",
  time: "12:00",
  foods: [{ id: "food", name: "Alimento de teste", grams: 100 }],
  substitutions: [],
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};
const source = {
  id: "draft",
  patientId: "synthetic-patient",
  authorId: author.id,
  authorName: author.name,
  title: "Plano sintético",
  startDate: "2026-10-19",
  endDate: "2026-10-20",
  waterLiters: 2,
  guidance: "",
  meals: [meal],
  status: "draft",
  revision: 3,
  createdAt: "2026-10-19T12:00:00Z",
};
function apiPlan(revision) {
  return {
    id: "server-draft",
    patient_id: source.patientId,
    author_id: author.id,
    author_name: author.name,
    title: source.title,
    start_on: source.startDate,
    end_on: source.endDate,
    water_liters: 2,
    guidance: "",
    meals: [meal],
    status: "draft",
    revision,
    created_at: source.createdAt,
  };
}

test("publicação que falha preserva rascunho e usa sua revisão ao tentar novamente", async () => {
  const { usePlanEditor } = await loadSource(
    "features/nutritionist/hooks/usePlanEditor.ts",
  );
  const requests = [];
  let publicationAttempts = 0;
  let closed = 0;
  let refreshed = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({
      url,
      method: options.method,
      body: JSON.parse(options.body),
    });
    if (url.endsWith("/publish")) {
      publicationAttempts++;
      return publicationAttempts === 1
        ? reply({ detail: "Publicação indisponível" }, 503)
        : reply(apiPlan(3));
    }
    return reply(apiPlan(options.method === "POST" ? 1 : 2));
  };
  const hook = await renderHook(() =>
    usePlanEditor({
      patientId: source.patientId,
      author,
      token: "test",
      onClose: () => closed++,
      onSaved: () => refreshed++,
    }),
  );
  try {
    await act(async () => {
      hook.current.setPlan({ ...source, id: "local-draft" });
    });
    await act(async () => {
      await hook.current.save(true);
    });
    assert.match(
      hook.current.error,
      /Rascunho salvo, mas não foi possível publicar/,
    );
    assert.equal(closed, 0);
    await act(async () => {
      await hook.current.save(true);
    });
    assert.deepEqual(
      requests.map((request) => request.method),
      ["POST", "POST", "PUT", "POST"],
    );
    assert.ok(requests[2].url.endsWith("/server-draft"));
    assert.equal(requests[2].body.expected_revision, 1);
    assert.equal(requests[3].body.expected_revision, 2);
    assert.equal(closed, 1);
    assert.equal(refreshed, 3);
    assert.equal(hook.current.error, "");
  } finally {
    await hook.unmount();
    global.fetch = originalFetch;
  }
});

test("cliques concorrentes não duplicam o salvamento de plano", async () => {
  const { usePlanEditor } = await loadSource(
    "features/nutritionist/hooks/usePlanEditor.ts",
  );
  const pending = deferred();
  let writes = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    writes++;
    await pending.promise;
    return reply(apiPlan(4));
  };
  const hook = await renderHook(() =>
    usePlanEditor({
      patientId: source.patientId,
      source,
      author,
      token: "test",
      onClose() {},
    }),
  );
  try {
    let saving;
    await act(async () => {
      saving = hook.current.save(false);
      void hook.current.save(false);
    });
    assert.equal(writes, 1);
    await act(async () => {
      pending.resolve();
      await saving;
    });
  } finally {
    await hook.unmount();
    global.fetch = originalFetch;
  }
});

test("nova versão não modifica o plano publicado nem seus alimentos", async () => {
  const { createPlanDraft, updatePlanMeal } = await loadSource(
    "features/nutritionist/plan-draft.ts",
  );
  const published = { ...structuredClone(source), status: "published" };
  const draft = createPlanDraft(source.patientId, author, published);
  assert.notEqual(draft.id, published.id);
  assert.equal(draft.status, "draft");
  draft.meals[0].foods[0].name = "Outro alimento";
  assert.equal(published.meals[0].foods[0].name, "Alimento de teste");
  const edited = updatePlanMeal(draft, meal.id, { title: "Outro título" });
  assert.equal(draft.meals[0].title, meal.title);
  assert.equal(edited.meals[0].title, "Outro título");
});
