const { test } = require("node:test");
const assert = require("node:assert/strict");
const { React, act, createRoot, loadSource } = require("./helpers/react.cjs");

test("microfone grava um arquivo de áudio e libera a captura ao parar", async () => {
  const { UazapiAudioRecorder } = await loadSource(
    "features/nutritionist/components/UazapiAudioRecorder.tsx",
  );
  const originalRecorder = global.MediaRecorder;
  const originalFile = global.File;
  const originalDevices = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const busy = [];
  const recorded = [];
  const errors = [];
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async (constraints) => {
        assert.deepEqual(constraints, { audio: true });
        return stream;
      },
    },
  });
  global.File = window.File;
  global.MediaRecorder = class {
    static isTypeSupported(type) {
      return type === "audio/webm;codecs=opus";
    }
    constructor(source) {
      this.stream = source;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new window.Blob(["audio"]) });
      this.onstop();
    }
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        React.createElement(UazapiAudioRecorder, {
          disabled: false,
          onBusy: (value) => busy.push(value),
          onRecorded: (file) => recorded.push(file),
          onError: (error) => {
            if (error) errors.push(error);
          },
        }),
      ),
    );
    const button = container.querySelector('button[aria-label="Gravar áudio"]');
    await act(async () => button.click());
    assert.equal(button.getAttribute("aria-label"), "Parar gravação");
    await act(async () => button.click());
    assert.equal(recorded[0].type, "audio/webm");
    assert.equal(recorded[0].size, 5);
    assert.deepEqual(busy, [true, false]);
    assert.deepEqual(errors, []);
    assert.equal(stopped, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (originalDevices)
      Object.defineProperty(navigator, "mediaDevices", originalDevices);
    else delete navigator.mediaDevices;
    global.MediaRecorder = originalRecorder;
    global.File = originalFile;
  }
});
