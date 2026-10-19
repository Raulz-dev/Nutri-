const { test } = require("node:test");
const assert = require("node:assert/strict");
const { React, act, createRoot, loadSource } = require("./helpers/react.cjs");

test("paginação preserva formulário e etapas sem recarregar paciente, rotina ou meta", async () => {
  const { ClinicalTestApp, installClinicalFixture } = await loadSource(
    "../tests/fixtures/clinical-app.tsx",
  );
  const fixture = installClinicalFixture();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (element) => {
    assert.ok(element);
    await act(async () => {
      element.click();
    });
  };
  try {
    await act(async () => {
      root.render(React.createElement(ClinicalTestApp));
    });
    const steps = container.querySelectorAll(".nutri-care-steps button");
    await click(steps[1]);
    const form = container.querySelector("#care-step-1 form:nth-of-type(2)");
    const weight = form.querySelector('input[type="number"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(weight, "72.4");
      weight.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const requestsBefore = fixture.requests.length;
    await click(
      container.querySelector('#care-step-1 [aria-label="Próxima página"]'),
    );
    assert.deepEqual(
      fixture.requests.slice(requestsBefore).map((request) => request.path),
      ["/patients/synthetic-patient/measurements"],
    );
    assert.equal(
      container.querySelector("#care-step-1 form:nth-of-type(2)"),
      form,
    );
    assert.equal(weight.value, "72.4");
    await click(steps[3]);
    assert.equal(container.querySelector("#care-step-1").hidden, true);
    await click(steps[1]);
    assert.equal(
      container.querySelector("#care-step-1 form:nth-of-type(2)"),
      form,
    );
    assert.equal(weight.value, "72.4");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    const writes = fixture.requests.filter(
      (request) => request.method === "PUT",
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.weight_kg, 72.4);
    assert.match(
      container.querySelector("#care-step-1").textContent,
      /Salvo automaticamente/,
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    fixture.restore();
    container.remove();
  }
});
