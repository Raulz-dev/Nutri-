import { PatientIcon } from "./PatientIcon";

type PanelHeaderProps = {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
};

export function PanelHeader({ eyebrow, title, action, onAction }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div>
        <span className="card-label">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action ? (
        <button type="button" onClick={onAction}>
          {action}
          <PatientIcon name="arrow" />
        </button>
      ) : null}
    </div>
  );
}
