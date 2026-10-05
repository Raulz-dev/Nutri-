import { useId, useRef, type ReactNode } from "react";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useModalBehavior(ref, onClose);
  return (
    <div
      className="nutri-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="nutri-modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
