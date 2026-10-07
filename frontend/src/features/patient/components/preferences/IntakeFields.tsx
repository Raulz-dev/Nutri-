import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export function IntakeCard({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="intake-card">
      <header>
        <span>{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const errorId = useId();
  const control =
    error && isValidElement(children)
      ? cloneElement(
          children as ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": errorId },
        )
      : children;
  return (
    <label className={`intake-field ${className}`}>
      <span>
        {label}
        {required ? <b> *</b> : null}
        {hint ? <small>{hint}</small> : null}
      </span>
      {control}
      {error ? <em className="visually-hidden-error" id={errorId}>{error}</em> : null}
    </label>
  );
}

export function RestrictionTags({
  label,
  placeholder,
  values,
  maxItems,
  hasNone,
  onValuesChange,
  onNoneChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  maxItems: number;
  hasNone: boolean;
  onValuesChange: (values: string[]) => void;
  onNoneChange: (value: boolean) => void;
}) {
  return (
    <div className="restriction-field">
      <TagInput
        label={label}
        placeholder={placeholder}
        values={values}
        maxItems={maxItems}
        disabled={hasNone}
        onChange={onValuesChange}
      />
      <label className="none-check">
        <input
          type="checkbox"
          checked={hasNone}
          onChange={(event) => onNoneChange(event.target.checked)}
        />
        Não possuo
      </label>
    </div>
  );
}

export function TagInput({
  label,
  placeholder,
  values,
  maxItems,
  disabled = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  maxItems: number;
  disabled?: boolean;
  onChange: (values: string[]) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (values.length >= maxItems) {
      setMessage(`Limite de ${maxItems} itens atingido.`);
      return;
    }
    if (
      values.some(
        (item) =>
          item.localeCompare(value, "pt-BR", { sensitivity: "accent" }) === 0,
      )
    ) {
      setMessage("Este item já foi adicionado.");
      return;
    }
    onChange([...values, value]);
    setDraft("");
    setMessage("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addTag();
  }

  return (
    <div className={`tag-field${disabled ? " is-disabled" : ""}`}>
      <div className="tag-field-heading">
        <label htmlFor={inputId}>{label}</label>
        <small>
          {values.length}/{maxItems}
        </small>
      </div>
      <div className="tag-entry">
        <input
          id={inputId}
          maxLength={80}
          disabled={disabled || values.length >= maxItems}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? "Marcado como não possuo"
              : values.length >= maxItems
                ? `Limite de ${maxItems} itens atingido`
                : placeholder
          }
        />
        <button
          type="button"
          disabled={disabled || values.length >= maxItems || !draft.trim()}
          onClick={addTag}
        >
          Adicionar
        </button>
      </div>
      {message ? (
        <p className="tag-message" role="status">
          {message}
        </p>
      ) : null}
      {values.length ? (
        <ul className="tag-list" aria-label={`${label} adicionados`}>
          {values.map((value) => (
            <li key={value}>
              {value}
              <button
                type="button"
                onClick={() => {
                  onChange(values.filter((item) => item !== value));
                  setMessage("");
                }}
                aria-label={`Remover ${value}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
