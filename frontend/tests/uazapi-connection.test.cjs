const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

const pairing = (state, qr = null) => ({
  connected: state === "connected",
  logged_in: state === "connected",
  state,
  qr_code: qr,
});
const qr = "data:image/png;base64,iVBORw0KGgo=";

async function setup(fetcher) {
  const { UazapiConnectionPanel } = await loadSource(
    "features/nutritionist/components/UazapiConnectionPanel.tsx",
  );
  const originalFetch = global.fetch;
  const originalTimeout = global.setTimeout;
  const timers = [];
  global.fetch = fetcher;
  global.setTimeout = (callback, ms, ...args) => {
    if (ms === 5000 || ms === 10000) {
      timers.push(callback);
      return 0;
    }
    return originalTimeout(callback, ms, ...args);
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(UazapiConnectionPanel, {
          token: "synthetic-token",
        }),
      ),
    ),
  );
  return {
    container,
    async poll() {
      await act(async () => {
        await timers.shift()();
      });
    },
    async dispose() {
      await act(async () => root.unmount());
      container.remove();
      global.fetch = originalFetch;
      global.setTimeout = originalTimeout;
    },
  };
}

test("desconectado gera QR uma vez e remove a imagem após conectar", async () => {
  let connected = false;
  const writes = [];
  const view = await setup(async (url, options = {}) => {
    if (options.method === "POST") {
      writes.push(url);
      return reply(pairing("connecting", qr));
    }
    return reply(pairing(connected ? "connected" : "disconnected"));
  });
  try {
    assert.equal(writes.length, 1);
    assert.equal(view.container.querySelector("img").getAttribute("src"), qr);
    connected = true;
    await view.poll();
    assert.equal(view.container.querySelector("img"), null);
    assert.match(view.container.textContent, /Conectado/);
    assert.equal(writes.length, 1);
  } finally {
    await view.dispose();
  }
});

test("sessão conectada não solicita pareamento", async () => {
  const writes = [];
  const view = await setup(async (url, options = {}) => {
    if (options.method === "POST") writes.push(url);
    return reply(pairing("connected"));
  });
  try {
    assert.equal(writes.length, 0);
    assert.equal(view.container.querySelector("img"), null);
    assert.match(view.container.textContent, /Conectado/);
  } finally {
    await view.dispose();
  }
});

test("pareamento em andamento aguarda QR sem repetir conexão", async () => {
  let ready = false;
  const writes = [];
  const view = await setup(async (url, options = {}) => {
    if (options.method === "POST") writes.push(url);
    return reply(pairing("connecting", ready ? qr : null));
  });
  try {
    assert.match(view.container.textContent, /Aguardando QR Code/);
    ready = true;
    await view.poll();
    assert.ok(view.container.querySelector("img"));
    assert.equal(writes.length, 0);
  } finally {
    await view.dispose();
  }
});

test("falha limpa QR anterior e permite tentar novamente", async () => {
  let failed = false;
  const view = await setup(async () =>
    failed
      ? reply({ detail: "Serviço indisponível" }, 502)
      : reply(pairing("connecting", qr)),
  );
  try {
    assert.ok(view.container.querySelector("img"));
    failed = true;
    await view.poll();
    assert.equal(view.container.querySelector("img"), null);
    assert.match(
      view.container.querySelector('[role="alert"]').textContent,
      /Serviço indisponível/,
    );
    failed = false;
    await act(async () => view.container.querySelector("button").click());
    assert.ok(view.container.querySelector("img"));
  } finally {
    await view.dispose();
  }
});

test("nova conta cria a instância somente após clicar em Conectar WhatsApp", async () => {
  const writes = [];
  const view = await setup(async (url, options = {}) => {
    if (options.method === "POST") {
      writes.push(url);
      return reply(pairing("connecting", qr));
    }
    return reply(pairing("unlinked"));
  });
  try {
    assert.equal(writes.length, 0);
    const button = view.container.querySelector("button");
    assert.equal(button.textContent, "Conectar WhatsApp");
    await act(async () => button.click());
    assert.equal(writes.length, 1);
    assert.match(writes[0], /\/connect$/);
    assert.equal(view.container.querySelector("img").getAttribute("src"), qr);
  } finally {
    await view.dispose();
  }
});
