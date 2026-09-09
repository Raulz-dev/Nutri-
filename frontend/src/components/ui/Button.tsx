import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  children,
  loading,
  loadingLabel = "Carregando...",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button className="button" disabled={disabled || loading} {...props}>
      {loading ? <span className="button__loader" aria-hidden="true" /> : null}
      {loading ? loadingLabel : children}
    </button>
  );
}
