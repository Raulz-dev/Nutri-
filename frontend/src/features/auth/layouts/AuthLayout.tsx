import type { ReactNode } from "react";

type AuthLayoutProps = {
  titleId: string;
  title: string;
  eyebrow: string;
  description?: string;
  image?: string;
  badge: string;
  visualText: string;
  className?: string;
  children: ReactNode;
};

export function AuthLayout({ titleId, title, eyebrow, description, image = "/assets/runner-health.webp", badge, visualText, className = "", children }: AuthLayoutProps) {
  return (
    <main className={`login-page${className ? ` ${className}` : ""}`}>
      <section className="login-card" aria-labelledby={titleId}>
        <div className="login-card__content">
          <div className="brand" aria-label="Nutri Mais">
            <span>Nutri</span>
            <span className="brand__symbol">+</span>
          </div>
          <div className="login-card__heading">
            <span className="eyebrow">{eyebrow}</span>
            <h1 id={titleId}>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {children}
        </div>
        <div className="login-card__visual" aria-hidden="true">
          <img src={image} alt="" />
          <div className="visual-copy">
            <span className="visual-copy__badge">{badge}</span>
            <p>{visualText}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
