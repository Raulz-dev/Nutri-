const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

test("WhatsApp preserva rascunho no polling e reutiliza identificador após falha de resposta", async () => {
  const { WhatsAppTestApp } = await loadSource(
    "../tests/fixtures/whatsapp-app.tsx",
  );
  const originalFetch = global.fetch;
  const originalWebSocket = global.WebSocket;
  global.WebSocket = undefined;
  const contact = {
    id: "contact-a",
    patient_name: "Paciente fictício",
    patient_id: "patient-a",
    phone: "5585999990000",
    active: true,
    window_open: true,
    unread: 0,
  };
  const writes = [];
  let messages = [];
  let fail = true;
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/connection"))
      return reply({ configured: true, active: true, sends_enabled: true });
    if (url.includes("/patients?")) return reply({ items: [], total: 0 });
    if (url.includes("/contacts?"))
      return reply({ items: [contact], total: 1 });
    if (options.method === "POST" && url.endsWith("/messages")) {
      const body = JSON.parse(options.body);
      writes.push(body);
      if (fail) {
        fail = false;
        return reply({ detail: "Resposta perdida" }, 503);
      }
      const saved = {
        ...body,
        direction: "outbound",
        status: "queued",
        occurred_at: new Date().toISOString(),
        read_at: null,
      };
      messages = [saved];
      return reply(saved, 201);
    }
    return reply({ items: messages, next_cursor: null });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const input = async (element, value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(element),
        "value",
      ).set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(React.createElement(WhatsAppTestApp)));
    await act(async () =>
      container.querySelector(".nutri-chat aside button").click(),
    );
    const composer = container.querySelector("#whatsapp-message");
    assert.ok(composer);
    await input(composer, "Resposta de teste");
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    assert.equal(container.querySelector("#whatsapp-message"), composer);
    assert.equal(composer.value, "Resposta de teste");
    await act(async () =>
      composer.form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(composer.value, "Resposta de teste");
    await act(async () =>
      composer.form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(writes.length, 2);
    assert.equal(writes[0].id, writes[1].id);
    assert.equal(composer.value, "");
    assert.match(container.textContent, /Na fila/);
    contact.window_open = false;
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    assert.equal(container.querySelector("#whatsapp-message"), null);
    assert.match(container.textContent, /Janela de atendimento encerrada/);
  } finally {
    await act(async () => root.unmount());
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    container.remove();
  }
});
