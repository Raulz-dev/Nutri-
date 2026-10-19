const { JSDOM } = require("jsdom");
const { build } = require("esbuild");
const path = require("node:path");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "navigator",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { createRoot } = require("react-dom/client");

async function loadSource(relativePath) {
  const result = await build({
    entryPoints: [path.resolve(__dirname, "../../src", relativePath)],
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    packages: "external",
    write: false,
    loader: { ".css": "empty" },
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

async function renderHook(callback) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let current;
  let render = callback;
  function Probe() {
    current = render();
    return null;
  }
  await React.act(async () => {
    root.render(React.createElement(Probe));
  });
  return {
    get current() {
      return current;
    },
    async rerender(next = render) {
      render = next;
      await React.act(async () => {
        root.render(React.createElement(Probe));
      });
    },
    async unmount() {
      await React.act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
module.exports = {
  React,
  act: React.act,
  createRoot,
  loadSource,
  renderHook,
  deferred,
  reply,
};
