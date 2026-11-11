const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

for (const search of [
  "",
  "?conversa=synthetic-conversation",
  "?paciente=synthetic-patient",
]) {
  test(`Mensagens usa apenas UazAPI na aba WhatsApp (${search || "rota padrão"})`, async () => {
    const { MessagingChannelsTestApp } = await loadSource(
      "../tests/fixtures/whatsapp-app.tsx",
    );
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, options = {}) => {
      const path = new URL(url).pathname;
      requests.push({ path, method: options.method ?? "GET" });
      if (path === "/api/v1/whatsapp/uazapi/pairing") {
        return reply({ connected: true, logged_in: true, state: "connected" });
      }
      if (path === "/api/v1/conversations")
        return reply({ items: [], total: 0 });
      if (path === "/api/v1/whatsapp/uazapi/conversations") return reply([]);
      // A versão anterior consultava a disponibilidade da Meta nesta rota.
      return reply({ enabled: true });
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(React.createElement(MessagingChannelsTestApp, { search })),
      );
      const group = container.querySelector(
        '[aria-label="Canal de atendimento"]',
      );
      const [whatsapp, platform] = group.querySelectorAll("button");
      assert.deepEqual(
        [whatsapp.textContent, platform.textContent],
        ["WhatsApp", "Chat da plataforma"],
      );
      assert.equal(whatsapp.getAttribute("aria-pressed"), String(!search));
      assert.equal(
        platform.getAttribute("aria-pressed"),
        String(Boolean(search)),
      );
      if (search) {
        assert.equal(container.querySelector(".uazapi-connection"), null);
        assert.ok(container.querySelector(".nutri-chat"));
        await act(async () => whatsapp.click());
      }
      assert.match(group.nextElementSibling.textContent, /conectado/i);
      assert.ok(
        requests.some(({ path }) => path === "/api/v1/whatsapp/uazapi/pairing"),
      );

      await act(async () => platform.click());
      assert.equal(platform.getAttribute("aria-pressed"), "true");
      assert.equal(container.querySelector(".uazapi-connection"), null);
      assert.ok(container.querySelector(".nutri-chat"));
      assert.ok(requests.some(({ path }) => path === "/api/v1/conversations"));
      assert.ok(
        requests.every(
          ({ path, method }) =>
            method === "GET" &&
            [
              "/api/v1/whatsapp/uazapi/pairing",
              "/api/v1/whatsapp/uazapi/conversations",
              "/api/v1/conversations",
            ].includes(path),
        ),
        JSON.stringify(requests),
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      global.fetch = originalFetch;
    }
  });
}

test("WhatsApp atualiza histórico, mantém o identificador no retry e bloqueia envio desconectado", async () => {
  const { MessagingChannelsTestApp } = await loadSource(
    "../tests/fixtures/whatsapp-app.tsx",
  );
  const originalFetch = global.fetch;
  const originalTimeout = global.setTimeout;
  const originalInterval = window.setInterval;
  const timeouts = [];
  const polls = [];
  const sends = [];
  let finishSend;
  let connected = true;
  let rows = [];
  const message = {
    id: "message",
    direction: "inbound",
    kind: "Conversation",
    text: "Mensagem recebida",
    occurred_at: "2026-11-11T12:00:00Z",
    delivery_status: null,
  };
  const outbound = {
    ...message,
    id: "outbound",
    direction: "outbound",
    text: "Resposta",
    delivery_status: "sent",
  };

  global.setTimeout = (callback, ms, ...args) => {
    if (ms === 10000 || ms === 5000) {
      timeouts.push(callback);
      return 0;
    }
    return originalTimeout(callback, ms, ...args);
  };
  window.setInterval = (callback, ms) => {
    assert.equal(ms, 10000);
    polls.push(callback);
    return polls.length;
  };
  global.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/pairing") || path.endsWith("/connect")) {
      return reply({
        connected,
        logged_in: connected,
        state: connected ? "connected" : "connecting",
      });
    }
    if (path.endsWith("/conversations"))
      return reply([{ id: "chat", title: "Contato de teste" }]);
    if (options.method === "POST") {
      sends.push(JSON.parse(options.body));
      if (sends.length === 1) throw new Error("Resposta perdida");
      await new Promise((resolve) => {
        finishSend = resolve;
      });
      if (sends.length === 3) return reply({ detail: "Envio recusado" }, 403);
      rows = [...rows, outbound];
      return reply(outbound);
    }
    const before = new URL(url).searchParams.get("before");
    const end = before
      ? rows.findIndex(({ id }) => id === before)
      : rows.length;
    const start = Math.max(0, end - 50);
    return reply({
      items: rows.slice(start, end),
      next_before: start ? rows[start].id : null,
    });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(React.createElement(MessagingChannelsTestApp)),
    );
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    rows = [message];
    await act(async () => polls.forEach((poll) => poll()));
    assert.match(
      container.querySelector('[role="log"]').textContent,
      /Mensagem recebida/,
    );

    rows = [
      ...rows,
      ...Array.from({ length: 55 }, (_, index) => ({
        ...message,
        id: `burst-${index}`,
        text: `Mensagem em lote ${index}`,
      })),
    ];
    await act(async () => polls.forEach((poll) => poll()));
    assert.match(
      container.querySelector('[role="log"]').textContent,
      /Mensagem em lote 0/,
    );

    const draft = container.querySelector("#uazapi-message");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(draft),
        "value",
      ).set.call(draft, "Resposta");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = container.querySelector(".chat-composer button[type=submit]");
    await act(async () => send.click());
    assert.match(
      container.querySelector('[role="alert"]').textContent,
      /mesma tentativa/,
    );
    await act(async () => container.querySelector(".nutri-chat-back").click());
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    assert.equal(container.querySelector("#uazapi-message").value, "Resposta");
    await act(async () =>
      container.querySelector(".chat-composer button[type=submit]").click(),
    );
    await act(async () => container.querySelector(".nutri-chat-back").click());
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    assert.equal(
      container.querySelector(".chat-composer button[type=submit]").disabled,
      true,
    );
    await act(async () => finishSend());
    assert.equal(container.querySelector("#uazapi-message").value, "");
    await act(async () =>
      container.querySelector(".chat-composer button[type=submit]").click(),
    );
    await act(async () => polls.forEach((poll) => poll()));
    assert.equal(sends.length, 2);
    assert.deepEqual(sends[0], sends[1]);
    assert.match(
      container.querySelector('[role="log"]').textContent,
      /Enviada/,
    );

    await act(async () =>
      container.querySelector('[role="log"] button').click(),
    );
    rows[0] = { ...message, direction: "outbound", delivery_status: "read" };
    await act(async () => polls.forEach((poll) => poll()));
    assert.match(container.querySelector('[role="log"]').textContent, /Lida/);

    await act(async () => {
      const input = container.querySelector("#uazapi-message");
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        "value",
      ).set.call(input, "Rascunho a preservar");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container.querySelector(".chat-composer button[type=submit]").click(),
    );
    await act(async () => container.querySelector(".nutri-chat-back").click());
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    await act(async () => finishSend());
    assert.equal(
      container.querySelector("#uazapi-message").value,
      "Rascunho a preservar",
    );
    assert.match(
      container.querySelector('[role="alert"]').textContent,
      /Envio recusado/,
    );

    connected = false;
    await act(async () => timeouts.shift()());
    assert.equal(container.querySelector(".chat-composer"), null);
    assert.match(container.textContent, /Reconecte o WhatsApp/);
    connected = true;
    await act(async () => timeouts.shift()());
    assert.ok(container.querySelector(".chat-composer"));
    assert.match(
      container.querySelector('[role="log"]').textContent,
      /Mensagem em lote 54/,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.setInterval = originalInterval;
    global.setTimeout = originalTimeout;
    global.fetch = originalFetch;
  }
});

test("Adicionar paciente abre formulário com telefone e some após vincular", async () => {
  const { MessagingChannelsTestApp } = await loadSource(
    "../tests/fixtures/whatsapp-app.tsx",
  );
  const originalFetch = global.fetch;
  const originalFormData = global.FormData;
  global.FormData = window.FormData;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/pairing")) return reply({ connected: true });
    if (path.endsWith("/conversations"))
      return reply([{ id: "chat", title: "Contato WhatsApp" }]);
    if (path.endsWith("/messages")) {
      return reply({
        items: [],
        next_before: null,
        phone: "+5585999999999",
        patient_id: null,
      });
    }
    requests.push({ path, body: JSON.parse(options.body) });
    return reply({ patient_id: "patient" });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(React.createElement(MessagingChannelsTestApp)),
    );
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    await act(async () =>
      container
        .querySelector(".chat-header .uazapi-add-patient button")
        .click(),
    );
    const dialog = container.querySelector('[role="dialog"]');
    assert.equal(
      dialog.querySelector('input[type="tel"]').value,
      "+5585999999999",
    );
    assert.equal(
      dialog.querySelector('input[name="name"]').value,
      "Contato WhatsApp",
    );
    dialog.querySelector('input[name="email"]').value = "paciente@example.com";
    dialog.querySelector('input[name="cpf"]').value = "52998224725";
    await act(async () => dialog.querySelector("form").requestSubmit());
    assert.deepEqual(requests, [
      {
        path: "/api/v1/whatsapp/uazapi/conversations/chat/patient",
        body: {
          name: "Contato WhatsApp",
          email: "paciente@example.com",
          cpf: "52998224725",
        },
      },
    ]);
    assert.equal(container.querySelector(".uazapi-add-patient"), null);
    assert.equal(container.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    global.fetch = originalFetch;
    global.FormData = originalFormData;
  }
});

test("compositor compacto envia PDF selecionado sem exigir texto", async () => {
  const { MessagingChannelsTestApp } = await loadSource(
    "../tests/fixtures/whatsapp-app.tsx",
  );
  const originalFetch = global.fetch;
  const originalFileReader = global.FileReader;
  global.FileReader = window.FileReader;
  const sends = [];
  global.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/pairing")) return reply({ connected: true });
    if (path.endsWith("/conversations"))
      return reply([{ id: "chat", title: "Contato" }]);
    if (options.method === "POST") {
      sends.push(JSON.parse(options.body));
      return reply({
        id: "pdf",
        direction: "outbound",
        kind: "DocumentMessage",
        text: "",
        occurred_at: "2026-11-11T12:00:00Z",
        delivery_status: "sent",
      });
    }
    return reply({ items: [], next_before: null });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(React.createElement(MessagingChannelsTestApp)),
    );
    await act(async () =>
      container.querySelector(".uazapi-chat aside button").click(),
    );
    const input = container.querySelector('input[type="file"]');
    const file = new window.File(["%PDF-1.4"], "plano.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    const send = container.querySelector(
      'button[aria-label="Enviar mensagem"]',
    );
    assert.equal(send.disabled, false);
    await act(async () => {
      send.click();
      while (!sends.length)
        await new Promise((resolve) => setImmediate(resolve));
    });
    assert.deepEqual(sends[0].attachment, {
      name: "plano.pdf",
      mime_type: "application/pdf",
      base64: "JVBERi0xLjQ=",
    });
    assert.equal(sends[0].text, "");
    assert.equal(container.querySelector(".uazapi-selected-file"), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    global.fetch = originalFetch;
    global.FileReader = originalFileReader;
  }
});
