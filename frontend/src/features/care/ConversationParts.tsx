import type { FormEvent, ReactNode } from "react";

type MessageComposerProps = {
  id: string;
  draft: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  compact?: boolean;
  attachmentControl?: ReactNode;
  hasAttachment?: boolean;
};

export function MessageComposer({
  id,
  draft,
  busy,
  onChange,
  onSubmit,
  compact = false,
  attachmentControl,
  hasAttachment = false,
}: MessageComposerProps) {
  const canSend = Boolean(draft.trim() || hasAttachment) && !busy;
  return (
    <form
      className={`chat-composer${compact ? " chat-composer-compact" : ""}`}
      onSubmit={onSubmit}
    >
      {attachmentControl}
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
          if (!event.repeat && canSend)
            event.currentTarget.form?.requestSubmit();
        }}
        id={id}
        rows={compact ? 1 : undefined}
        value={draft}
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Escreva uma mensagem..."
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label={compact ? "Enviar mensagem" : undefined}
      >
        {compact ? <span aria-hidden="true">➤</span> : "Enviar"}
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
