const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  act,
  loadSource,
  renderHook,
  reply,
  deferred,
} = require("./helpers/react.cjs");

function harness() {
  const original = {
    WebSocket: global.WebSocket,
    fetch: global.fetch,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
  };
  const timeouts = new Map();
  const intervals = new Map();
  let id = 0;
  window.setTimeout = (fn, delay) => {
    const key = ++id;
    timeouts.set(key, { fn, delay });
    return key;
  };
  window.clearTimeout = (key) => timeouts.delete(key);
  window.setInterval = (fn) => {
    const key = ++id;
    intervals.set(key, fn);
    return key;
  };
  window.clearInterval = (key) => intervals.delete(key);
  class Socket {
    static OPEN = 1;
    static instances = [];
    readyState = 0;
    sent = [];
    constructor(url) {
      this.url = url;
      Socket.instances.push(this);
    }
    open() {
      this.readyState = 1;
      this.onopen?.({});
    }
    message(data) {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1006 });
    }
  }
  global.WebSocket = Socket;
  global.fetch = async () => reply({ ticket: "one-use-test-ticket" });
  return {
    Socket,
    intervals,
    timeouts,
    async tick(min, max = min) {
      await act(async () => {
        for (const [key, timer] of [...timeouts])
          if (timer.delay >= min && timer.delay <= max) {
            timeouts.delete(key);
            timer.fn();
          }
      });
    },
    restore() {
      global.WebSocket = original.WebSocket;
      global.fetch = original.fetch;
      for (const key of [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
      ])
        window[key] = original[key];
    },
  };
}

test("tempo real suspende polling, agrupa avisos, recupera após queda e encerra ao desmontar", async () => {
  const { useRealtimeTest } = await loadSource(
    "../tests/fixtures/whatsapp-realtime.ts",
  );
  const h = harness();
  let reads = 0;
  const errors = [];
  const refresh = async () => {
    reads++;
  };
  const hook = await renderHook(() =>
    useRealtimeTest("synthetic-token", refresh, (error) => errors.push(error)),
  );
  try {
    assert.equal(h.Socket.instances.length, 1);
    const first = h.Socket.instances[0];
    assert.match(first.url, /^ws:\/\/test\/api\/v1\/whatsapp\/realtime$/);
    assert.ok(
      !first.url.includes("ticket") && !first.url.includes("synthetic-token"),
    );
    assert.equal(reads, 1);
    assert.equal(h.intervals.size, 2); // Watchdog plus fallback polling.
    await act(async () => {
      first.open();
      first.message({ type: "ready" });
    });
    assert.deepEqual(first.sent, ["one-use-test-ticket"]);
    assert.equal(hook.current.connected, true);
    assert.equal(h.intervals.size, 1);
    assert.equal(reads, 2); // Reconcile after LISTEN is established.
    await act(async () => {
      first.message({ type: "whatsapp.conversation_changed", contact_id: "a" });
      first.message({ type: "whatsapp.conversation_changed", contact_id: "a" });
    });
    await h.tick(50);
    assert.equal(reads, 3);
    await act(async () => first.close());
    assert.equal(hook.current.connected, false);
    assert.equal(h.intervals.size, 2);
    assert.equal(reads, 4);
    await h.tick(1000, 1250);
    assert.equal(h.Socket.instances.length, 2);
    const second = h.Socket.instances[1];
    await act(async () => {
      second.open();
      second.message({ type: "ready" });
    });
    assert.equal(hook.current.connected, true);
    assert.equal(reads, 5);
    assert.deepEqual(errors, []);
    await hook.unmount();
    assert.equal(second.readyState, 3);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.timeouts.size, 0);
  } finally {
    if (h.intervals.size) await hook.unmount();
    h.restore();
  }
});

test("ticket recebido após desmontagem não abre conexão e falha de autorização mantém fallback", async () => {
  const { useRealtimeTest } = await loadSource(
    "../tests/fixtures/whatsapp-realtime.ts",
  );
  const h = harness();
  const grant = deferred();
  global.fetch = () => grant.promise;
  const refresh = async () => {};
  const hook = await renderHook(() =>
    useRealtimeTest("synthetic-token", refresh, () => {}),
  );
  try {
    await hook.unmount();
    await act(async () => grant.resolve(reply({ ticket: "late-ticket" })));
    assert.equal(h.Socket.instances.length, 0);
    assert.equal(h.timeouts.size, 0);
    global.fetch = async () => reply({ detail: "Piloto indisponível" }, 403);
    const denied = await renderHook(() =>
      useRealtimeTest("synthetic-token", refresh, () => {}),
    );
    assert.equal(denied.current.connected, false);
    assert.equal(h.timeouts.size, 0); // No reconnect loop for a forbidden participant.
    assert.equal(h.intervals.size, 2);
    await denied.unmount();
  } finally {
    h.restore();
  }
});

test("falha ao buscar atualização retorna ao polling e permite nova sincronização", async () => {
  const { useRealtimeTest } = await loadSource(
    "../tests/fixtures/whatsapp-realtime.ts",
  );
  const h = harness();
  let fail = false;
  const errors = [];
  const refresh = async () => {
    if (fail) {
      fail = false;
      throw new Error("Falha transitória");
    }
  };
  const hook = await renderHook(() =>
    useRealtimeTest("synthetic-token", refresh, (error) => errors.push(error)),
  );
  try {
    const socket = h.Socket.instances[0];
    await act(async () => {
      socket.open();
      socket.message({ type: "ready" });
    });
    assert.equal(hook.current.connected, true);
    fail = true;
    await act(async () =>
      socket.message({
        type: "whatsapp.conversation_changed",
        contact_id: "a",
      }),
    );
    await h.tick(50);
    assert.equal(hook.current.connected, false);
    assert.equal(errors.length, 1);
    assert.equal(h.intervals.size, 2);
    await h.tick(1000, 1250);
    const next = h.Socket.instances[1];
    await act(async () => {
      next.open();
      next.message({ type: "ready" });
    });
    assert.equal(hook.current.connected, true);
  } finally {
    await hook.unmount();
    h.restore();
  }
});
