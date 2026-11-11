const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  React,
  act,
  createRoot,
  loadSource,
  reply,
} = require("./helpers/react.cjs");

test("mídia do WhatsApp exibe imagem, player de áudio e prévia de PDF", async () => {
  const { UazapiMedia } = await loadSource(
    "features/nutritionist/components/UazapiMedia.tsx",
  );
  const originalFetch = global.fetch;
  const formats = {
    image: ["image/png", "iVBORw0KGgo="],
    audio: ["audio/mpeg", "SUQz"],
    pdf: ["application/pdf", "JVBERi0xLjQ="],
  };
  global.fetch = async (url) => {
    const id = new URL(url).pathname.split("/").at(-2);
    const [mime_type, base64] = formats[id];
    return reply({ mime_type, base64 });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        Object.keys(formats).map((id) =>
          React.createElement(UazapiMedia, {
            key: id,
            token: "synthetic-token",
            chatId: "chat",
            messageId: id,
            label: id,
          }),
        ),
      ),
    );
    assert.match(
      container.querySelector("img").src,
      /^data:image\/png;base64,/,
    );
    assert.match(
      container.querySelector("audio[controls]").src,
      /^data:audio\/mpeg;base64,/,
    );
    const preview = container.querySelector("iframe");
    const download = container.querySelector("a[download]");
    assert.match(preview.src, /^blob:.*#page=1/);
    assert.equal(preview.src.split("#")[0], download.href);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    global.fetch = originalFetch;
  }
});
