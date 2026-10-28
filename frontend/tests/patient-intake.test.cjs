const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

test("preferências preservam obrigatoriedade, limites e passos numéricos", async () => {
  const { validatePatientIntake } = await loadSource(
    "features/patient/patient-intake-validation.ts",
  );
  const { emptyPatientIntake } = await loadSource(
    "features/care/patient-intake.ts",
  );
  const intake = structuredClone(emptyPatientIntake);
  assert.equal(validatePatientIntake(intake).goalError, true);
  assert.ok(
    Object.values(validatePatientIntake(intake).numericErrors).every(
      (value) => value === undefined,
    ),
  );
  intake.goal.primary = "food-education";
  for (const [group, field, valid, invalid] of [
    ["routine", "mealsPerDay", ["1", "12"], ["0", "13", "2.5", "abc"]],
    ["routine", "waterLiters", ["0", "15", "2.3"], ["-1", "16", "2.35"]],
    ["lifestyle", "sleepHours", ["0", "24", "7.5"], ["-1", "25", "7.3"]],
  ]) {
    for (const value of valid) {
      intake[group][field] = value;
      assert.equal(
        validatePatientIntake(intake).numericErrors[field],
        undefined,
        `${field}=${value}`,
      );
    }
    for (const value of invalid) {
      intake[group][field] = value;
      assert.ok(
        validatePatientIntake(intake).numericErrors[field],
        `${field}=${value}`,
      );
    }
    intake[group][field] = "";
  }
  assert.equal(validatePatientIntake(intake).goalError, false);
});

test("formulário de preferências foca erro e salva com revisão do servidor", async () => {
  const { IntakeTestApp } = await loadSource(
    "../tests/fixtures/intake-app.tsx",
  );
  const originalFetch = global.fetch;
  const writes = [];
  global.fetch = async (url, options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      writes.push(body);
      return reply({
        intake: body.intake,
        revision: body.expected_revision + 1,
        author_id: "synthetic-patient",
        updated_at: null,
      });
    }
    if (url.endsWith("/intake"))
      return reply({
        intake: null,
        revision: 3,
        author_id: null,
        updated_at: null,
      });
    if (url.endsWith("/weight-goal"))
      return reply({ target_kg: null, revision: 0 });
    if (url.includes("/measurements?"))
      return reply({ items: [], total: 0, offset: 0, limit: 8 });
    if (url.endsWith("/plans/current") || url.includes("/appointments/next"))
      return reply(null);
    return reply({
      id: "synthetic-patient",
      name: "Paciente sintético",
      email: "test@example.invalid",
    });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(IntakeTestApp)));
    const form = container.querySelector("form");
    const submit = async () =>
      act(async () =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    const goToChapter = async (index) => act(async () => form.querySelectorAll(".intake-chapters button")[index].click());
    const input = async (element, value) => act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(form.querySelectorAll('[role="region"]:not([hidden])').length, 1);
    const chapterSelector = form.querySelector(".intake-chapter-selector select");
    assert.equal(chapterSelector.options.length, 7);
    await act(async () => {
      chapterSelector.value = "6";
      chapterSelector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(form.querySelector("#intake-chapter-6").hidden, false);
    await submit();
    assert.equal(writes.length, 0);
    assert.equal(form.querySelector("#intake-chapter-0").hidden, false);
    const goal = form.querySelector("#intake-chapter-0 select");
    assert.equal(document.activeElement, goal);
    assert.equal(chapterSelector.value, "0");
    await act(async () => {
      goal.value = "food-education";
      goal.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await goToChapter(4);
    const water = form.querySelector('#intake-chapter-4 input[step="0.1"]');
    await input(water, "16");
    await goToChapter(6);
    await submit();
    assert.equal(writes.length, 0);
    assert.equal(form.querySelector("#intake-chapter-4").hidden, false);
    assert.equal(document.activeElement, water);
    await input(water, "2");
    await goToChapter(1);
    const tagDraft = form.querySelector('#intake-chapter-1 .tag-entry input');
    await input(tagDraft, "Rascunho sintético");
    await goToChapter(2);
    await goToChapter(1);
    assert.equal(tagDraft.value, "Rascunho sintético");
    assert.equal(chapterSelector.value, "1");
    assert.equal(writes.length, 0, "Navegar não deve salvar o formulário");
    await submit();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].intake.routine.waterLiters, "2");
    assert.equal(writes[0].expected_revision, 3);
    assert.equal(writes[0].intake.goal.primary, "food-education");
    await submit();
    assert.equal(writes[1].expected_revision, 4);
  } finally {
    await act(async () => root.unmount());
    global.fetch = originalFetch;
    container.remove();
  }
});
