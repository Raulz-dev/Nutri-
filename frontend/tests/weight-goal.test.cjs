const { test } = require("node:test");
const assert = require("node:assert/strict");
const { act, loadSource, renderHook, reply } = require("./helpers/react.cjs");

test("meta só salva após edição e encadeia revisões do servidor", async () => {
  const { useWeightGoal } = await loadSource(
    "features/nutritionist/hooks/useWeightGoal.ts",
  );
  const writes = [];
  let revision = 4;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      writes.push(body);
      assert.equal(body.expected_revision, revision);
      return reply({ target_kg: body.target_kg, revision: ++revision });
    }
    return reply({ target_kg: 68, revision });
  };
  const hook = await renderHook(() =>
    useWeightGoal("test", "synthetic-patient"),
  );
  try {
    await act(async () => {
      await hook.current.save.flush();
    });
    assert.equal(writes.length, 0);
    for (const value of ["67.5", "67"]) {
      await act(async () => {
        hook.current.change(value);
      });
      await act(async () => {
        await hook.current.save.flush();
      });
    }
    assert.deepEqual(
      writes.map((body) => body.expected_revision),
      [4, 5],
    );
    assert.equal(hook.current.goal.revision, 6);
    assert.equal(hook.current.save.status, "saved");
  } finally {
    await hook.unmount();
    global.fetch = originalFetch;
  }
});

test("trocar paciente não aplica carregamento antigo no formulário atual", async () => {
  const { useClinicalHistory } = await loadSource(
    "features/nutritionist/hooks/useClinicalHistory.ts",
  );
  let resolveOld;
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const loadOld = () => old;
  const loadNew = async () => ({ items: [{ id: "paciente-novo" }], total: 1 });
  const hook = await renderHook(() => useClinicalHistory(loadOld, "Falha"));
  try {
    await hook.rerender(() => useClinicalHistory(loadNew, "Falha"));
    await act(async () => {
      resolveOld({ items: [{ id: "paciente-antigo" }], total: 1 });
    });
    assert.equal(hook.current.items[0].id, "paciente-novo");
  } finally {
    await hook.unmount();
  }
});
