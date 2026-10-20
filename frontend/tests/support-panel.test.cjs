const { test } = require("node:test");
const assert = require("node:assert/strict");
const { React, act, createRoot, loadSource, reply } = require("./helpers/react.cjs");

test("suporte preserva rascunho ao buscar contatos e isola o estado de cada conversa", async () => {
  const { SupportTestApp } = await loadSource("../tests/fixtures/support-app.tsx");
  const originalFetch = global.fetch;
  const contacts = [
    { id: "contact-a", name: "Contato A", active: true, unread: 0 },
    { id: "contact-b", name: "Contato B", active: true, unread: 0 },
  ];
  const writes = [];
  global.fetch = async (url, options = {}) => {
    if (url.includes("/contacts?")) return reply({ items: contacts, total: 2 });
    if (options.method === "POST") {
      writes.push({ url, body: JSON.parse(options.body) });
      return reply({});
    }
    return reply({ items: [], next_cursor: null });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (element) => {
    assert.ok(element);
    await act(async () => element.click());
  };
  const input = async (element, value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(element), "value",
      ).set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(React.createElement(SupportTestApp)));
    await click(container.querySelector(".support-contacts button"));
    const draft = container.querySelector("#support-draft");
    await input(draft, "Rascunho sintético");
    await input(container.querySelector(".support-directory input"), "Contato");
    assert.equal(container.querySelector("#support-draft"), draft);
    assert.equal(draft.value, "Rascunho sintético");
    await click(container.querySelector(".support-contacts button"));
    assert.equal(container.querySelector("#support-draft"), draft);
    await click(container.querySelectorAll(".support-contacts button")[1]);
    const secondDraft = container.querySelector("#support-draft");
    assert.notEqual(secondDraft, draft);
    assert.equal(secondDraft.value, "");
    await input(secondDraft, "Mensagem para B");
    await act(async () => {
      secondDraft.form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(writes.length, 1);
    assert.match(writes[0].url, /\/support\/contact-b\/messages$/);
    assert.equal(writes[0].body.text, "Mensagem para B");
    assert.ok(writes[0].body.id);
    assert.equal(secondDraft.value, "");
  } finally {
    await act(async () => root.unmount());
    global.fetch = originalFetch;
    container.remove();
  }
});
