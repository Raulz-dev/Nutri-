const { test } = require("node:test");
const assert = require("node:assert/strict");
const { React, act, createRoot, loadSource, reply } = require("./helpers/react.cjs");

test("convite busca candidatos, envia o selecionado e limpa seleção ao reabrir", async () => {
  const { InvitePatientModal } = await loadSource("features/nutritionist/components/InvitePatientModal.tsx");
  const originalFetch = global.fetch;
  const requests = [];
  const invited = [];
  global.fetch = async (url) => {
    requests.push(url);
    return reply({ items: [{ id: "synthetic-patient", name: "Paciente sintético", email: "patient@example.test" }], total: 1 });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let closed = 0;
  const render = async (busy = false) => act(async () => root.render(React.createElement(InvitePatientModal, {
    token: "test", busy, onClose: () => closed++, onInvite: async (email) => invited.push(email),
  })));
  const waitForSearch = async () => act(async () => new Promise(resolve => setTimeout(resolve, 300)));
  try {
    await render();
    await waitForSearch();
    assert.equal(requests.length, 1);
    const submit = () => container.querySelector('button[type="submit"]');
    assert.equal(submit().disabled, true);
    await act(async () => container.querySelector(".nutri-invite-candidates button").click());
    assert.equal(submit().disabled, false);
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(invited, ["patient@example.test"]);
    await render(true);
    assert.equal(submit().disabled, true);
    await act(async () => container.querySelector('button[aria-label="Fechar"]').click());
    assert.equal(closed, 0);
    await act(async () => root.render(null));
    await render();
    await waitForSearch();
    assert.equal(container.querySelector("input").value, "");
    assert.equal(submit().disabled, true);
    await act(async () => container.querySelector('button[aria-label="Fechar"]').click());
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
    global.fetch = originalFetch;
    container.remove();
  }
});
