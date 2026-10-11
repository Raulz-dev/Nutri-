const { test } = require("node:test");
const assert = require("node:assert/strict");
const { build } = require("esbuild");
const { renderToStaticMarkup } = require("react-dom/server");
const path = require("node:path");

test("mantém as métricas principais quando apenas os planos falham", async () => {
  const states = [];
  const effects = [];
  let stateIndex = 0;
  const responses = {
    "/patients": { items: [], total: 7, offset: 0, limit: 10 },
    "/appointments": { items: [], total: 3, offset: 0, limit: 5 },
    "/conversations": { items: [{ unread: 4 }], total: 1, offset: 0, limit: 100 },
  };
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const pathname = new URL(input).pathname.replace("/api/v1", "");
    if (pathname === "/dashboards/nutritionist/plans") {
      return { ok: false, status: 503, json: async () => ({ detail: "Planos indisponíveis" }) };
    }
    assert.ok(responses[pathname], `Requisição inesperada: ${pathname}`);
    return { ok: true, status: 200, json: async () => responses[pathname] };
  };

  try {
    const result = await build({
      entryPoints: [path.resolve(__dirname, "../src/features/nutritionist/pages/DashboardPage.tsx")],
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      packages: "external",
      write: false,
      define: { "import.meta.env.VITE_API_URL": "undefined" },
      plugins: [{
        name: "dashboard-test-context",
        setup(build) {
          build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "dashboard-test" }));
          build.onResolve({ filter: /^(react-router-dom|.*\/useAuth|.*\/ErrorToast)$/ }, args => ({ path: args.path, namespace: "dashboard-test" }));
          build.onLoad({ filter: /.*/, namespace: "dashboard-test" }, args => {
            if (args.path === "react") return { contents: `
              export const useState = globalThis.__dashboardHooks.useState;
              export const useEffect = globalThis.__dashboardHooks.useEffect;
              export const useCallback = callback => callback;
            `, loader: "js" };
            if (args.path === "react-router-dom") return { contents: `
              import { jsx } from "react/jsx-runtime";
              export const Link = ({ to, children, ...props }) => jsx("a", { href: to, ...props, children });
            `, loader: "js", resolveDir: path.resolve(__dirname, "..") };
            if (args.path.endsWith("/useAuth")) return { contents: 'export const useAuth = () => ({ session: { accessToken: "test-token" } });', loader: "js" };
            return { contents: "export const ErrorToast = () => null;", loader: "js" };
          });
        },
      }],
    });
    global.__dashboardHooks = {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useEffect(effect) { effects.push(effect); },
    };
    const module = { exports: {} };
    new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, require);
    const page = module.exports.NutritionistDashboardPage;
    stateIndex = 0;
    page();
    await effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    stateIndex = 0;
    const html = renderToStaticMarkup(page());
    assert.match(html, /Pacientes vinculados<\/small><strong>7<\/strong>/);
    assert.match(html, /Próximas consultas<\/small><strong>3<\/strong>/);
    assert.match(html, /Mensagens não lidas<\/small><strong>4<\/strong>/);
    assert.match(html, /Planos vigentes<\/small><strong>—<\/strong>/);
    assert.match(html, /Planos indisponíveis no momento/);
  } finally {
    global.fetch = originalFetch;
    delete global.__dashboardHooks;
  }
});
