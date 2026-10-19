const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  act,
  loadSource,
  renderHook,
  deferred,
} = require("./helpers/react.cjs");

test("autosave serializa edições feitas durante uma gravação em andamento", async () => {
  const { useAutoSave } = await loadSource("hooks/useAutoSave.ts");
  const first = deferred();
  const writes = [];
  const hook = await renderHook(() =>
    useAutoSave("primeiro", async () => {
      writes.push("primeiro");
      await first.promise;
    }),
  );
  try {
    let saving;
    await act(async () => {
      saving = hook.current.flush();
    });
    await hook.rerender(() =>
      useAutoSave("segundo", async () => {
        writes.push("segundo");
      }),
    );
    await act(async () => {
      await hook.current.flush();
    });
    assert.deepEqual(writes, ["primeiro"]);
    await act(async () => {
      first.resolve();
      await saving;
    });
    assert.deepEqual(writes, ["primeiro", "segundo"]);
    assert.equal(hook.current.status, "saved");
  } finally {
    await hook.unmount();
  }
});

test("autosave aguarda o debounce e não repete um valor já salvo", async () => {
  const { useAutoSave } = await loadSource("hooks/useAutoSave.ts");
  let writes = 0;
  const save = async () => {
    writes++;
  };
  const hook = await renderHook(() => useAutoSave("conteúdo", save));
  try {
    assert.equal(writes, 0);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    assert.equal(writes, 1);
    await act(async () => {
      await hook.current.flush();
    });
    assert.equal(writes, 1);
  } finally {
    await hook.unmount();
  }
});

test("autosave preserva tentativa manual após falha e descarrega rascunho ao desmontar", async () => {
  const { useAutoSave } = await loadSource("hooks/useAutoSave.ts");
  let fail = true;
  const writes = [];
  const hook = await renderHook(() =>
    useAutoSave("rascunho", async () => {
      if (fail) throw new Error("Sem conexão");
      writes.push("rascunho");
    }),
  );
  await act(async () => {
    await hook.current.flush();
  });
  assert.equal(hook.current.status, "error");
  fail = false;
  await act(async () => {
    await hook.current.flush();
  });
  assert.equal(hook.current.status, "saved");
  await hook.rerender(() =>
    useAutoSave("novo", async () => {
      writes.push("novo");
    }),
  );
  await hook.unmount();
  assert.deepEqual(writes, ["rascunho", "novo"]);
});
