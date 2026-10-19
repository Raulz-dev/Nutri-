const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  act,
  loadSource,
  renderHook,
  deferred,
  reply,
} = require("./helpers/react.cjs");
const page = (id) => ({ items: [{ id }], total: 20, offset: 0, limit: 10 });

test("resposta antiga do histórico não substitui a página selecionada", async () => {
  const { useClinicalHistory } = await loadSource(
    "features/nutritionist/hooks/useClinicalHistory.ts",
  );
  const stale = deferred();
  let first = true;
  const load = (offset) =>
    offset === 10
      ? Promise.resolve(page("pagina-2"))
      : first
        ? ((first = false), Promise.resolve(page("inicial")))
        : stale.promise;
  const hook = await renderHook(() => useClinicalHistory(load, "Falha"));
  try {
    let refresh;
    await act(async () => {
      refresh = hook.current.refresh();
    });
    await act(async () => {
      hook.current.changePage(2);
    });
    assert.equal(hook.current.items[0].id, "pagina-2");
    await act(async () => {
      stale.resolve(page("pagina-1-antiga"));
      await refresh;
    });
    assert.equal(hook.current.page, 2);
    assert.equal(hook.current.items[0].id, "pagina-2");
    assert.equal(hook.current.loading, false);
  } finally {
    await hook.unmount();
  }
});

test("erro de uma requisição antiga não substitui o estado da página atual", async () => {
  const { useClinicalHistory } = await loadSource(
    "features/nutritionist/hooks/useClinicalHistory.ts",
  );
  const stale = deferred();
  const load = (offset) =>
    offset === 0 ? stale.promise : Promise.resolve(page("nova"));
  const hook = await renderHook(() => useClinicalHistory(load, "Falha"));
  try {
    await act(async () => {
      hook.current.changePage(2);
    });
    await act(async () => {
      stale.reject(new Error("Erro antigo"));
    });
    assert.equal(hook.current.error, "");
    assert.equal(hook.current.items[0].id, "nova");
  } finally {
    await hook.unmount();
  }
});

test("medição salva durante a paginação atualiza a página atual, sem carregar dados alheios", async () => {
  const { useMeasurements } = await loadSource(
    "features/nutritionist/hooks/useMeasurements.ts",
  );
  const saved = deferred();
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    requests.push({
      path: parsed.pathname,
      offset: parsed.searchParams.get("offset"),
      method: options.method,
    });
    assert.match(
      parsed.pathname,
      /\/patients\/synthetic-patient\/measurements/,
    );
    if (options.method === "PUT") {
      await saved.promise;
      return reply({});
    }
    return reply(
      page(
        parsed.searchParams.get("offset") === "10" ? "pagina-2" : "pagina-1",
      ),
    );
  };
  const hook = await renderHook(() =>
    useMeasurements("test", "synthetic-patient"),
  );
  try {
    await act(async () => {
      hook.current.setWeight("70");
    });
    let saving;
    await act(async () => {
      saving = hook.current.save.flush();
    });
    await act(async () => {
      hook.current.history.changePage(2);
    });
    const before = requests.length;
    await act(async () => {
      saved.resolve();
      await saving;
    });
    const after = requests.slice(before);
    assert.equal(after.filter((request) => request.offset === "10").length, 1);
    assert.equal(hook.current.history.items[0].id, "pagina-2");
    assert.equal(hook.current.save.status, "saved");
  } finally {
    await hook.unmount();
    global.fetch = originalFetch;
  }
});

test("falha ao atualizar histórico não transforma uma gravação concluída em erro de salvamento", async () => {
  const { useAssessments } = await loadSource(
    "features/nutritionist/hooks/useAssessments.ts",
  );
  let writes = 0;
  let failRead = false;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (options.method === "PUT") {
      writes++;
      failRead = true;
      return reply({});
    }
    return failRead
      ? reply({ detail: "Histórico indisponível" }, 503)
      : reply(page("inicial"));
  };
  const hook = await renderHook(() =>
    useAssessments("test", "synthetic-patient"),
  );
  try {
    await act(async () => {
      hook.current.setText("Avaliação sintética");
    });
    await act(async () => {
      await hook.current.save.flush();
    });
    assert.equal(hook.current.save.status, "saved");
    assert.equal(hook.current.history.error, "Histórico indisponível");
    failRead = false;
    await act(async () => {
      await hook.current.history.refresh();
    });
    assert.equal(writes, 1);
    assert.equal(hook.current.history.error, "");
  } finally {
    await hook.unmount();
    global.fetch = originalFetch;
  }
});
