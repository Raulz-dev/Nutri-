const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

test("formulários administrativos preservam payload, atualização do usuário e reautenticação", async () => {
  const { AdminSettingsTestApp } = await loadSource(
    "../tests/fixtures/admin-settings-app.tsx",
  );
  const originalFetch = global.fetch;
  const writes = [];
  let reloads = 0,
    logouts = 0;
  const settings = {
    name: "Administrador sintético",
    email: "admin@example.invalid",
    email_notifications: true,
  };
  global.fetch = async (url, options = {}) => {
    if (!options.method) return reply(settings);
    const body = JSON.parse(options.body);
    writes.push({ url, body });
    return reply(body);
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const input = async (element, value) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const submit = async (form) =>
    act(async () =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  try {
    await act(async () =>
      root.render(
        React.createElement(AdminSettingsTestApp, {
          onReload: async () => reloads++,
          onLogout: async () => logouts++,
        }),
      ),
    );
    const [account, security] = container.querySelectorAll("form");
    await input(
      account.querySelector('input[type="password"]'),
      "SyntheticCurrent123!",
    );
    await submit(account);
    assert.equal(writes[0].body.current_password, "SyntheticCurrent123!");
    assert.equal(writes[0].body.email, settings.email);
    assert.equal(reloads, 1);
    assert.equal(logouts, 0);
    const fields = security.querySelectorAll("input");
    await input(fields[0], "SyntheticCurrent123!");
    await input(fields[1], "SyntheticNew123!");
    await input(fields[2], "Different123!");
    await submit(security);
    assert.equal(writes.length, 1);
    assert.match(container.textContent, /As senhas não coincidem/);
    await input(fields[2], "SyntheticNew123!");
    await submit(security);
    assert.deepEqual(writes[1].body, {
      current_password: "SyntheticCurrent123!",
      new_password: "SyntheticNew123!",
      new_password_confirmation: "SyntheticNew123!",
    });
    assert.equal(logouts, 1);
    assert.equal(
      container.querySelector('[data-testid="location"]').textContent,
      "/login",
    );
  } finally {
    await act(async () => root.unmount());
    global.fetch = originalFetch;
    container.remove();
  }
});
