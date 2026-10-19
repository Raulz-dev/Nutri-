const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  act,
  loadSource,
  renderHook,
  deferred,
} = require("./helpers/react.cjs");

test("mescla mensagens anteriores e atualizações sem duplicar nem modificar a origem", async () => {
  const { mergeMessages } = await loadSource(
    "features/care/message-history.ts",
  );
  const current = [{ id: "b", sent_at: "2026-10-19T12:00:00Z", read_at: null }];
  const incoming = [
    { id: "b", sent_at: current[0].sent_at, read_at: "read" },
    { id: "a", sent_at: current[0].sent_at },
  ];
  const result = mergeMessages(current, incoming);
  assert.deepEqual(
    result.map((message) => message.id),
    ["a", "b"],
  );
  assert.equal(result[1].read_at, "read");
  assert.equal(current[0].read_at, null);
});

test("polling respeita visibilidade, evita sobreposição e remove listeners ao desmontar", async () => {
  const { useVisiblePolling } = await loadSource("hooks/useVisiblePolling.ts");
  const pending = deferred();
  let calls = 0;
  let errors = 0;
  const refresh = async () => {
    calls++;
    await pending.promise;
  };
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  const hook = await renderHook(() =>
    useVisiblePolling(refresh, () => errors++, true),
  );
  assert.equal(calls, 0);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(calls, 1);
  await hook.unmount();
  await act(async () => {
    pending.reject(new Error("Late error"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(calls, 1);
  assert.equal(errors, 0);
});
