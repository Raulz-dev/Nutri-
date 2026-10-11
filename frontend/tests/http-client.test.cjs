const { test } = require("node:test");
const assert = require("node:assert/strict");
const { build } = require("esbuild");
const path = require("node:path");
async function client() {
  const result = await build({
    entryPoints: [path.resolve(__dirname, "../src/lib/http-client.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    define: { "import.meta.env.VITE_API_URL": '"http://test/api/v1"' },
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}
const reply = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
test("401 concorrentes compartilham refresh e repetem cada requisição uma vez", async () => {
  const api = await client();
  const original = global.fetch;
  let refreshes = 0;
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(options.credentials, "include");
    if (url.endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return reply(200, { access_token: "renewed" });
    }
    calls++;
    return options.headers.Authorization === "Bearer renewed"
      ? reply(200, { ok: true })
      : reply(401, {});
  };
  try {
    const result = await Promise.all([
      api.apiRequest("/one", { token: "old" }),
      api.apiRequest("/two", { token: "old" }),
    ]);
    assert.deepEqual(result, [{ ok: true }, { ok: true }]);
    assert.equal(refreshes, 1);
    assert.equal(calls, 4);
  } finally {
    global.fetch = original;
  }
});
test("senha atual inválida não renova a sessão nem repete a alteração", async () => {
  const api = await client();
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return reply(401, { detail: "Senha atual inválida." });
  };
  try {
    await assert.rejects(
      api.apiRequest("/users/me/password", {
        token: "current",
        method: "POST",
      }),
      { status: 401 },
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = original;
  }
});
