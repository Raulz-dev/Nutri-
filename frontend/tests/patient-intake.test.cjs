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
    await submit();
    assert.equal(writes.length, 0);
    const goal = form.querySelector("select");
    assert.equal(document.activeElement, goal);
    await act(async () => {
      goal.value = "food-education";
      goal.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submit();
    assert.equal(writes.length, 1);
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
