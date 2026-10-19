import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ImageCarousel } from "./ImageCarousel";
import "./landing.css";

const resources = [
  {
    number: "01",
    title: "Um plano que acompanha a rotina.",
    text: "Refeições, orientações e alternativas organizadas para o paciente consultar no dia a dia.",
    label: "PLANEJAMENTO ALIMENTAR",
  },
  {
    number: "02",
    title: "Cada evolução tem uma história.",
    text: "Registre avaliações e acompanhe a evolução com as informações do paciente reunidas no mesmo lugar.",
    label: "ACOMPANHAMENTO CLÍNICO",
  },
  {
    number: "03",
    title: "A conversa continua após a consulta.",
    text: "Um espaço de mensagens entre paciente e nutricionista para manter o acompanhamento próximo.",
    label: "CONEXÃO E CUIDADO",
  },
];

export function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Nutri+ | Nutrição que aproxima";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="landing">
      <a className="landing-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="landing-header landing-container">
        <Link className="landing-brand" to="/" aria-label="Nutri Mais — início">
          <svg className="landing-brand-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M12 27C10 14 20 9 30 10c1 11-5 21-18 17Z" stroke="currentColor" strokeWidth="2"/><path d="m10 31 14-15M17 24v-7m0 7h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          <div><div>Nutri<span>+</span></div><small>Nutrição que aproxima</small></div>
        </Link>
        <nav aria-label="Navegação principal">
          <a href="#conteudo">Início</a>
          <a href="#recursos">Recursos</a>
          <a href="#galeria">Galeria</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className="landing-header-actions">
        <Link className="landing-signup" to="/cadastro">Criar conta</Link>
        <Link className="landing-login" to="/login">
          Entrar <span aria-hidden="true">↗</span>
        </Link>
        </div>
      </header>

      <main id="conteudo">
        <section className="landing-hero landing-container" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span /> MAIS PROXIMIDADE. MAIS CUIDADO.
            </p>
            <h1 id="landing-title">
              Nutrição que
              <br />
              conecta.
              <br />
              <em>
                Cuidado que
                <br />
                transforma.
              </em>
            </h1>
            <p className="landing-intro">
              Entre a consulta e o dia a dia, existe uma rotina inteira. O Nutri+ aproxima nutricionistas e pacientes em cada etapa do acompanhamento.
            </p>
            <div className="landing-actions">
              <a className="landing-button" href="#recursos">
                Conheça o Nutri+ <span aria-hidden="true">↗</span>
              </a>
              <Link className="landing-text-link" to="/login">
                Acessar minha conta <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="landing-hero-visual">
            <img src="/assets/landing-meal.webp" alt="Refeição com arroz, feijão, legumes e folhas em uma tigela" width="1024" height="1536" fetchPriority="high" />
            <div className="landing-photo-caption">
              <span>ALIMENTAÇÃO É CUIDADO</span>
              <p>
                Pequenas escolhas.
                <br />
                Novas possibilidades.
              </p>
            </div>
            <div className="landing-floating">
              <span className="landing-floating-icon" aria-hidden="true">
                ✦
              </span>
              <div>
                <strong>Mais perto de você.</strong>
                <span>Dentro e fora da consulta.</span>
              </div>
            </div>
          </div>
        </section>

        <div className="landing-ribbon">
          <div className="landing-container">
            <span>Um espaço para cuidar melhor</span>
            <span>Plano alimentar</span>
            <i aria-hidden="true">✦</i>
            <span>Evolução</span>
            <i aria-hidden="true">✦</i>
            <span>Mensagens</span>
            <i aria-hidden="true">✦</i>
            <span>Consultas</span>
          </div>
        </div>

        <section className="landing-section landing-container" id="recursos" aria-labelledby="resources-title">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">CUIDADO EM CADA DETALHE</p>
            <h2 id="resources-title">
              Menos informação espalhada.
              <br />
              <em>Mais espaço para acompanhar.</em>
            </h2>
            <p>Da organização do atendimento à rotina do paciente, ferramentas que se conectam ao cuidado nutricional.</p>
          </div>
          <div className="landing-resources">
            {resources.map((resource) => (
              <article key={resource.number}>
                <span className="landing-resource-number">
                  {resource.number} <span aria-hidden="true">↗</span>
                </span>
                <p className="landing-eyebrow">{resource.label}</p>
                <h3>{resource.title}</h3>
                <p>{resource.text}</p>
              </article>
            ))}
          </div>
        </section>

        <ImageCarousel />

        <section className="landing-section landing-container landing-faq" id="duvidas" aria-labelledby="faq-title">
          <div>
            <p className="landing-eyebrow">VAMOS SIMPLIFICAR</p>
            <h2 id="faq-title">
              Antes de
              <br />
              <em>começar.</em>
            </h2>
          </div>
          <div>
            <details>
              <summary>O que é o Nutri+?</summary>
              <p>
                É uma plataforma de acompanhamento nutricional que reúne plano alimentar, registros de evolução, consultas e comunicação entre nutricionista e paciente.
              </p>
            </details>
            <details>
              <summary>Sou paciente. Como começo?</summary>
              <p>Crie sua conta de paciente e acesse a plataforma. O acompanhamento e o plano alimentar dependem do vínculo com seu nutricionista.</p>
              <Link to="/cadastro">Criar conta de paciente →</Link>
            </details>
            <details>
              <summary>Sou nutricionista. Como acesso?</summary>
              <p>
                Se você já possui uma conta profissional, entre com seu e-mail e senha. O cadastro público é destinado a pacientes; o acesso profissional é gerenciado
                pela administração da plataforma.
              </p>
              <Link to="/login">Acessar minha conta →</Link>
            </details>
            <details>
              <summary>A plataforma substitui a consulta?</summary>
              <p>Não. O Nutri+ apoia o acompanhamento feito pelo nutricionista. As orientações e os planos alimentares são definidos pelo profissional responsável.</p>
            </details>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-grid">
            <div className="landing-footer-about">
              <Link className="landing-brand" to="/" aria-label="Nutri Mais — início">
                Nutri<span>+</span>
              </Link>
              <p>Nutrição que aproxima.</p>
            </div>
            <nav aria-label="Links do rodapé">
              <h3>Explore</h3>
              <a href="#recursos">Recursos</a>
              <a href="#duvidas">Dúvidas frequentes</a>
            </nav>
            <nav aria-label="Acesso à plataforma">
              <h3>Faça parte</h3>
              <Link to="/login">Entrar na plataforma</Link>
              <Link to="/cadastro">Criar conta de paciente</Link>
            </nav>
            <div className="landing-footer-creators">
              <h3>Desenvolvido por</h3>
              <ul>
                <li>Raul Pontes</li>
                <li>João Pedro Ribeiro</li>
              </ul>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <p>© {new Date().getFullYear()} Nutri+. Todos os direitos reservados.</p>
            <a href="#conteudo">
              Voltar ao início <span aria-hidden="true">↑</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
