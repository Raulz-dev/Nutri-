const { test } = require("node:test");
const assert = require("node:assert/strict");
const { React, act, createRoot, loadSource } = require("./helpers/react.cjs");

test("compositor compartilhado preserva Enter, Shift, composição e bloqueio de envio", async () => {
  const { MessageComposer } = await loadSource("features/care/ConversationParts.tsx");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let sends = 0;
  const render = async (busy, draft = "Mensagem sintética") => act(async () => root.render(React.createElement(MessageComposer, {
    id: "test-draft", draft, busy, onChange: () => {}, onSubmit: event => { event.preventDefault(); sends++; },
  })));
  const key = async (options) => act(async () => container.querySelector("textarea").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options })));
  try {
    await render(false);
    assert.equal(container.querySelector("label").htmlFor, "test-draft");
    assert.equal(container.querySelector("textarea").maxLength, 4000);
    await key({ shiftKey: true });
    await key({ isComposing: true });
    await key({ repeat: true });
    assert.equal(sends, 0);
    await key({});
    assert.equal(sends, 1);
    await render(true);
    assert.equal(container.querySelector("button").disabled, true);
    await key({});
    assert.equal(sends, 1);
    await render(false, "  ");
    assert.equal(container.querySelector("button").disabled, true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
