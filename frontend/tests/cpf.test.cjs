const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

test("CPF aceita máscara e rejeita dígitos inválidos, repetidos e caracteres extras", async () => {
  const { normalizeCpf } = await loadSource("lib/cpf.ts");
  assert.equal(normalizeCpf("111.444.777-35"), "11144477735");
  for (const value of [
    "",
    "11111111111",
    "11144477734",
    "abc11144477735",
    "１１１４４４７７７３５",
  ])
    assert.equal(normalizeCpf(value), null);
});

for (const mode of ["register", "first-access", "legacy"]) {
  test(`CPF no formulário ${mode}: valida antes de enviar e normaliza a requisição`, async () => {
    const { CpfTestApp } = await loadSource("../tests/fixtures/cpf-app.tsx");
    const original = global.fetch;
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return reply({ cpf: "11144477735" });
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    async function input(name, value) {
      const element = container.querySelector(`input[name="${name}"]`);
      assert.ok(element, name);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const submit = () =>
      act(async () =>
        container
          .querySelector("form")
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
    try {
      await act(async () =>
        root.render(React.createElement(CpfTestApp, { mode })),
      );
      if (mode === "register") {
        await input("name", "Paciente Sintético");
        await input("email", "synthetic@example.com");
        await input("password-confirmation", "SyntheticOnly123!");
      }
      if (mode === "first-access")
        await input("confirmation", "SyntheticOnly123!");
      await input(
        mode === "legacy" ? "current-password" : "password",
        "SyntheticOnly123!",
      );
      await input("cpf", "11111111111");
      await submit();
      assert.equal(requests.length, 0);
      await input("cpf", "111.444.777-35");
      await submit();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body.cpf, "11144477735");
      assert.ok(
        requests[0].url.endsWith(
          mode === "legacy"
            ? "/account/cpf"
            : mode === "first-access"
              ? "/auth/invitations/accept"
              : "/users",
        ),
      );
      if (mode === "legacy") {
        assert.equal(requests[0].body.current_password, "SyntheticOnly123!");
        assert.equal(container.querySelector("form"), null);
        assert.match(container.textContent, /111\.444\.777-35/);
      }
    } finally {
      await act(async () => root.unmount());
      global.fetch = original;
      container.remove();
    }
  });
}
