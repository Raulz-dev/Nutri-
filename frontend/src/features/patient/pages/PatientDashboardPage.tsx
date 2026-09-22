import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { patientMock, type PatientSection } from "../mocks/patient-data";
import "../styles/patient.css";

type IconName = "home" | "meal" | "chart" | "message" | "user" | "logout" | "bell" | "calendar" | "target" | "percent" | "water" | "arrow" | "clock";
const navigation: { id: PatientSection; label: string; icon: IconName }[] = [
  { id: "home", label: "Visão geral", icon: "home" },
  { id: "meal-plan", label: "Plano alimentar", icon: "meal" },
  { id: "progress", label: "Evolução", icon: "chart" },
  { id: "messages", label: "Mensagens", icon: "message" },
  { id: "profile", label: "Meu perfil", icon: "user" },
];
const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  meal: (
    <>
      <path d="M4 3v8a3 3 0 0 0 3 3V3M7 14v7M16 3v18" />
      <path d="M16 3c3 2 4 5 4 8h-4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="m10 17 5-5-5-5M15 12H3" />
      <path d="M15 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  percent: (
    <>
      <path d="m19 5-14 14" />
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  water: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
};
function Icon({ name }: { name: IconName }) {
  return (
    <svg className="patient-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function PatientDashboardPage() {
  const [section, setSection] = useState<PatientSection>("home");
  const { logout } = useAuth();
  const navigate = useNavigate();
  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }
  return (
    <main className="patient-app">
      <aside className="patient-sidebar">
        <div className="brand patient-brand">
          <span>Nutri</span>
          <span className="brand__symbol">+</span>
        </div>
        <div className="patient-menu-label">Menu</div>
        <nav aria-label="Área do paciente">
          {navigation.map((item) => (
            <button key={item.id} aria-label={item.label} className={section === item.id ? "is-active" : ""} type="button" onClick={() => setSection(item.id)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "messages" ? <b>1</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>CF</span>
          <div>
            <strong>{patientMock.fullName}</strong>
            <small>Paciente</small>
          </div>
        </div>
        <button aria-label="Sair da conta" className="patient-logout" type="button" onClick={handleLogout}>
          <Icon name="logout" />
          <span>Sair da conta</span>
        </button>
      </aside>
      <section className="patient-content">
        <aside className="patient-demo-notice" aria-label="Aviso de demonstração">
          <p>Demonstração com dados fictícios. Plano, evolução, mensagens e consultas não estão conectados à sua conta.</p>
          <button type="button" onClick={handleLogout}>
            Sair da conta
          </button>
        </aside>
        <header className="patient-header">
          <div>
            <span className="patient-kicker">{section === "home" ? "Terça-feira, 24 de setembro" : "Área do paciente"}</span>
            <h1>{section === "home" ? `Olá, ${patientMock.name}` : navigation.find((item) => item.id === section)?.label}</h1>
            {section === "home" ? <p>Veja como está seu acompanhamento hoje.</p> : null}
          </div>
          <div className="header-actions">
            <button type="button" aria-label="Notificações">
              <Icon name="bell" />
              <i />
            </button>
            <button className="patient-avatar" type="button" onClick={() => setSection("profile")} aria-label="Abrir perfil">
              CF
            </button>
          </div>
        </header>
        {section === "home" ? <HomeSection onNavigate={setSection} /> : null}
        {section === "meal-plan" ? <MealPlanSection /> : null}
        {section === "progress" ? <ProgressSection /> : null}
        {section === "messages" ? <MessagesSection /> : null}
        {section === "profile" ? <ProfileSection /> : null}
      </section>
      <nav className="patient-mobile-nav" aria-label="Navegação móvel">
        {navigation.map((item) => (
          <button key={item.id} className={section === item.id ? "is-active" : ""} type="button" onClick={() => setSection(item.id)}>
            <Icon name={item.icon} />
            <small>{item.label.split(" ")[0]}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-header">
      <div>
        <span className="card-label">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action ? (
        <button type="button" onClick={onAction}>
          {action}
          <Icon name="arrow" />
        </button>
      ) : null}
    </div>
  );
}
function HomeSection({ onNavigate }: { onNavigate: (section: PatientSection) => void }) {
  const [chartMetric, setChartMetric] = useState<"weight" | "bodyFat">("weight");
  const nextMeal = getNextMeal();
  const chartValues = patientMock.measurements.map((measurement) => measurement[chartMetric]);
  const chartMax = Math.max(...chartValues);
  const chartMin = Math.min(...chartValues);
  const chartPoints = chartValues.map((value, index) => ({
    x: 18 + index * 101,
    y: 138 - ((value - chartMin) / Math.max(chartMax - chartMin, 1)) * 92,
  }));
  const linePoints = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = `18,150 ${linePoints} 321,150`;

  return (
    <div className="home-dashboard">
      <section className="health-summary-grid" aria-label="Resumo de saúde">
        <Summary icon="chart" label="Peso atual" value={patientMock.currentWeight} detail={`${patientMock.weightChange} desde o início`} />
        <Summary icon="percent" label="Percentual de gordura" value={patientMock.bodyFat} detail={patientMock.bodyFatChange} />
        <Summary icon="clock" label="Próxima refeição" value={nextMeal.title} detail={`${nextMeal.time}${nextMeal.isTomorrow ? " · amanhã" : ""}`} />
        <Summary icon="water" label="Água diária" value={patientMock.mealPlan.dailyWaterGoal} detail="Meta diária do plano" />
        <Summary icon="target" label="Calorias diárias" value={patientMock.dailyCalories} detail="Total estimado do plano" />
      </section>

      <section className="dashboard-insights">
        <article className="evolution-chart-card">
          <header className="evolution-chart-header">
            <div>
              <span className="card-label">Sua evolução</span>
              <h2>{chartMetric === "weight" ? "Peso" : "Gordura corporal"}</h2>
              <p>Últimas quatro medições</p>
            </div>
            <div className="chart-toggle" aria-label="Métrica do gráfico">
              <button
                className={chartMetric === "weight" ? "is-active" : ""}
                type="button"
                onClick={() => setChartMetric("weight")}
                aria-pressed={chartMetric === "weight"}
              >
                Peso
              </button>
              <button
                className={chartMetric === "bodyFat" ? "is-active" : ""}
                type="button"
                onClick={() => setChartMetric("bodyFat")}
                aria-pressed={chartMetric === "bodyFat"}
              >
                Gordura
              </button>
            </div>
          </header>
          <div className="line-chart" role="img" aria-label={`Gráfico de linha da evolução de ${chartMetric === "weight" ? "peso" : "gordura corporal"}`}>
            <svg viewBox="0 0 340 170" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="chart-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7542ce" stopOpacity=".28" />
                  <stop offset="100%" stopColor="#7542ce" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line className="chart-grid-line" x1="0" x2="340" y1="46" y2="46" />
              <line className="chart-grid-line" x1="0" x2="340" y1="92" y2="92" />
              <line className="chart-grid-line" x1="0" x2="340" y1="138" y2="138" />
              <polygon className="chart-area" points={areaPoints} />
              <polyline className="chart-line" points={linePoints} />
              {chartPoints.map(({ x, y }, index) => (
                <circle className="chart-point" cx={x} cy={y} r="5" key={patientMock.measurements[index].date} />
              ))}
            </svg>
            <div className="chart-values">
              {patientMock.measurements.map((measurement) => (
                <span key={measurement.date}>
                  <strong>
                    {String(measurement[chartMetric]).replace(".", ",")}
                    {chartMetric === "weight" ? " kg" : "%"}
                  </strong>
                  <small>{measurement.date}</small>
                </span>
              ))}
            </div>
          </div>
          <button className="chart-details-button" type="button" onClick={() => onNavigate("progress")}>
            Ver detalhes <Icon name="arrow" />
          </button>
        </article>

        <article className="next-appointment-card">
          <div className="appointment-icon">
            <Icon name="calendar" />
          </div>
          <span className="appointment-eyebrow">Próxima consulta</span>
          <h2>28 de setembro</h2>
          <strong>14h30</strong>
          <div className="appointment-professional">
            <span>MC</span>
            <div>
              <strong>{patientMock.nutritionist}</strong>
              <small>Consulta de acompanhamento</small>
            </div>
          </div>
          <button type="button">
            Ver detalhes da consulta <Icon name="arrow" />
          </button>
        </article>
      </section>
    </div>
  );
}

function getNextMeal() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const meal = patientMock.meals.find(({ time }) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes >= currentMinutes;
  });
  return meal ? { ...meal, isTomorrow: false } : { ...patientMock.meals[0], isTomorrow: true };
}
function Summary({ icon, label, value, detail }: { icon: IconName; label: string; value: string; detail: string }) {
  return (
    <article className="summary-card">
      <span className="summary-icon">
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function MealPlanSection() {
  const [selectedMeal, setSelectedMeal] = useState<(typeof patientMock.meals)[number] | null>(null);
  const [showSubstitutions, setShowSubstitutions] = useState(false);
  const mealDialog = useRef<HTMLElement>(null);
  const substitutionDialog = useRef<HTMLElement>(null);
  const dailyMacros = patientMock.meals.reduce(
    (total, meal) => ({
      calories: total.calories + Number.parseFloat(meal.macros.calories),
      protein: total.protein + Number.parseFloat(meal.macros.protein),
      carbs: total.carbs + Number.parseFloat(meal.macros.carbs),
      fats: total.fats + Number.parseFloat(meal.macros.fats),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );

  useEffect(() => {
    if (!selectedMeal) return;
    const dialog = showSubstitutions ? substitutionDialog.current : mealDialog.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    buttons[0]?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showSubstitutions) setShowSubstitutions(false);
      else setSelectedMeal(null);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [selectedMeal, showSubstitutions]);

  function closeMeal() {
    setShowSubstitutions(false);
    setSelectedMeal(null);
  }

  return (
    <div className="meal-plan-page">
      <section className="meal-plan-hero">
        <div>
          <span className="card-label">Plano alimentar</span>
          <h2>{patientMock.mealPlan.title}</h2>
          <p>{patientMock.nutritionist}</p>
        </div>
        <dl>
          <div>
            <dt>Período</dt>
            <dd>
              {patientMock.mealPlan.startDate} — {patientMock.mealPlan.validUntil}
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="water" />
              Meta de água
            </dt>
            <dd>{patientMock.mealPlan.dailyWaterGoal}/dia</dd>
          </div>
        </dl>
      </section>
      <section className="meal-plan-content">
        <div className="meal-schedule">
          <PanelHeader eyebrow="Rotina diária" title="Refeições e quantidades" />
          <div className="meal-cards">
            {patientMock.meals.map((meal) => (
              <button className="meal-card meal-card-button" key={meal.time} type="button" onClick={() => setSelectedMeal(meal)}>
                <time>{meal.time}</time>
                <span className="meal-card-title">
                  <strong>{meal.title}</strong>
                  <small>{meal.foods.length} itens</small>
                </span>
                <span className={meal.done ? "meal-status done" : "meal-status"}>{meal.done ? "Concluída" : "Pendente"}</span>
                <span className="meal-open" aria-hidden="true">
                  Ver refeição <Icon name="arrow" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="daily-macros" aria-labelledby="daily-macros-title">
        <div className="daily-macros-heading">
          <span className="card-label">Resumo nutricional</span>
          <h2 id="daily-macros-title">Totais do dia</h2>
        </div>
        <div className="daily-macros-grid">
          <article className="daily-macro daily-macro-calories">
            <small>Calorias</small>
            <strong>
              {dailyMacros.calories.toLocaleString("pt-BR")} <span>kcal</span>
            </strong>
          </article>
          <article className="daily-macro">
            <small>Proteínas</small>
            <strong>
              {dailyMacros.protein} <span>g</span>
            </strong>
          </article>
          <article className="daily-macro">
            <small>Carboidratos</small>
            <strong>
              {dailyMacros.carbs} <span>g</span>
            </strong>
          </article>
          <article className="daily-macro">
            <small>Gorduras</small>
            <strong>
              {dailyMacros.fats} <span>g</span>
            </strong>
          </article>
        </div>
      </section>
      {selectedMeal ? (
        <div className="meal-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeMeal()}>
          <section
            ref={mealDialog}
            className="meal-modal"
            role="dialog"
            aria-modal={!showSubstitutions}
            aria-hidden={showSubstitutions || undefined}
            inert={showSubstitutions}
            aria-labelledby="meal-modal-title"
          >
            <header className="meal-modal-header">
              <div>
                <span className="card-label">{selectedMeal.time}</span>
                <h2 id="meal-modal-title">{selectedMeal.title}</h2>
              </div>
              <button className="meal-modal-close" type="button" onClick={closeMeal} aria-label="Fechar refeição">
                ×
              </button>
            </header>
            <div className="meal-modal-section">
              <div className="meal-modal-section-title">
                <div>
                  <span className="card-label">Refeição principal</span>
                  <h3>Alimentos e quantidades</h3>
                </div>
                <button className="meal-substitution-button" type="button" onClick={() => setShowSubstitutions(true)}>
                  Ver substituições
                </button>
              </div>
              <ul className="meal-modal-foods">
                {selectedMeal.foods.map((food) => (
                  <li key={food}>{food}</li>
                ))}
              </ul>
            </div>

            <div className="meal-macros">
              <span>
                <small>Calorias</small>
                <strong>{selectedMeal.macros.calories}</strong>
              </span>
              <span>
                <small>Proteínas</small>
                <strong>{selectedMeal.macros.protein}</strong>
              </span>
              <span>
                <small>Carboidratos</small>
                <strong>{selectedMeal.macros.carbs}</strong>
              </span>
              <span>
                <small>Gorduras</small>
                <strong>{selectedMeal.macros.fats}</strong>
              </span>
            </div>
          </section>
          {showSubstitutions ? (
            <div className="substitution-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowSubstitutions(false)}>
              <section ref={substitutionDialog} className="substitution-modal" role="dialog" aria-modal="true" aria-labelledby="substitution-modal-title">
                <header className="meal-modal-header">
                  <div>
                    <span className="card-label">Trocas da refeição</span>
                    <h2 id="substitution-modal-title">Substituições</h2>
                  </div>
                  <button className="meal-modal-close" type="button" onClick={() => setShowSubstitutions(false)} aria-label="Fechar substituições">
                    ×
                  </button>
                </header>
                <p className="substitution-intro">
                  Escolha uma das opções abaixo. Cada opção substitui a refeição inteira; consuma todos os alimentos da opção escolhida.
                </p>
                {selectedMeal.substitutions.map((option, index) => (
                  <article className="substitution-meal" key={option.id} aria-label={`Opção ${index + 1}`}>
                    <span className="substitution-meal-label">Opção {index + 1}</span>
                    <ul>
                      {option.foods.map((food) => (
                        <li key={food}>{food}</li>
                      ))}
                    </ul>
                  </article>
                ))}
                <button className="substitution-modal-back" type="button" onClick={() => setShowSubstitutions(false)}>
                  Voltar para a refeição
                </button>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
function ProgressSection() {
  const minimum = Math.min(...patientMock.measurements.map((item) => item.weight)) - 1;
  return (
    <div className="progress-layout">
      <article className="patient-panel chart-panel">
        <PanelHeader eyebrow="Últimas quatro semanas" title="Evolução do peso" />
        <div className="mock-chart">
          {patientMock.measurements.map((item) => (
            <div key={item.date}>
              <strong>{item.weight} kg</strong>
              <span style={{ height: `${(item.weight - minimum) * 45 + 45}px` }} />
              <small>{item.date}</small>
            </div>
          ))}
        </div>
      </article>
      <article className="result-card">
        <span className="summary-icon">
          <Icon name="chart" />
        </span>
        <small>Resultado acumulado</small>
        <strong>{patientMock.weightChange}</strong>
        <p>Evolução gradual e consistente.</p>
      </article>
    </div>
  );
}
function MessagesSection() {
  return (
    <article className="patient-panel section-panel">
      <PanelHeader eyebrow="Acompanhamento" title="Mensagens da nutricionista" />
      <div className="message-list">
        {patientMock.messages.map((message) => (
          <button type="button" key={message.id}>
            <span className="message-avatar">MC</span>
            <span>
              <strong>
                {message.author}
                {message.unread ? <i /> : null}
              </strong>
              <small>{message.preview}</small>
            </span>
            <time>{message.time}</time>
          </button>
        ))}
      </div>
    </article>
  );
}
function ProfileSection() {
  return (
    <article className="patient-panel section-panel">
      <PanelHeader eyebrow="Seus dados" title="Perfil do paciente" />
      <div className="profile-hero">
        <span>CF</span>
        <div>
          <strong>{patientMock.fullName}</strong>
          <small>{patientMock.email}</small>
        </div>
        <span className="status-pill">Acompanhamento ativo</span>
      </div>
      <dl className="profile-data">
        <div>
          <dt>Nome completo</dt>
          <dd>{patientMock.fullName}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd>{patientMock.email}</dd>
        </div>
        <div>
          <dt>Nutricionista responsável</dt>
          <dd>{patientMock.nutritionist}</dd>
        </div>
        <div>
          <dt>Próxima consulta</dt>
          <dd>{patientMock.nextAppointment}</dd>
        </div>
      </dl>
    </article>
  );
}
