import type { FormEvent, ReactNode } from "react";

type MessageComposerProps = {
  id: string;
  draft: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function MessageComposer({
  id,
  draft,
  busy,
  onChange,
  onSubmit,
}: MessageComposerProps) {
  return (
    <form className="chat-composer" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={id}>
        Mensagem
      </label>
      <textarea
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          event.preventDefault();
          if (!event.repeat && !busy && draft.trim())
            event.currentTarget.form?.requestSubmit();
        }}
        id={id}
        value={draft}
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Escreva uma mensagem..."
      />
      <button type="submit" disabled={!draft.trim() || busy}>
        Enviar
      </button>
    </form>
  );
}

export function MessageBubble({
  text,
  own,
  children,
}: {
  text: string;
  own: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`chat-message ${own ? "is-patient" : ""}`}>
      <div>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}
