import { useState } from "react";

const slides = [
  {
    image: "/assets/carousel-preparo.webp",
    alt: "Homem preparando legumes em uma cozinha iluminada",
    title: "Cuidar começa nas pequenas escolhas.",
    text: "Uma alimentação que faz sentido para a sua rotina.",
  },
  {
    image: "/assets/carousel-feira.webp",
    alt: "Mulher escolhendo frutas e verduras em uma feira",
    title: "Mais cores nas suas escolhas.",
    text: "Descubra sabores e possibilidades para o seu dia a dia.",
  },
  {
    image: "/assets/carousel-rotina.webp",
    alt: "Duas amigas caminhando em um parque arborizado",
    title: "Bem-estar no seu ritmo.",
    text: "Encontre espaço para o cuidado na sua rotina.",
  },
  {
    image: "/assets/carousel-mesa.webp",
    alt: "Família compartilhando uma refeição à mesa",
    title: "À mesa, a gente se aproxima.",
    text: "Alimentação também é encontro, afeto e prazer.",
  },
];

export function ImageCarousel() {
  const [active, setActive] = useState(0);
  const slide = slides[active];

  return (
    <section id="galeria" className="landing-gallery" aria-label="Cuidado que faz parte da vida" aria-roledescription="carrossel">
      <div id="landing-gallery-slide" className="landing-gallery-slide" role="group" aria-roledescription="slide" aria-label={`${active + 1} de ${slides.length}`}>
        <img src={slide.image} alt={slide.alt} loading="lazy" />
        <div className="landing-gallery-caption">
          <h2>{slide.title}</h2>
          <p>{slide.text}</p>
        </div>
      </div>
      <div className="landing-gallery-controls">
        <button className="landing-gallery-prev" type="button" aria-label="Imagem anterior" aria-controls="landing-gallery-slide" onClick={() => setActive((active + slides.length - 1) % slides.length)}>←</button>
        <div className="landing-gallery-dots" role="group" aria-label="Selecionar imagem">
          {slides.map((item, index) => (
            <button key={item.image} type="button" aria-label={`Ver imagem ${index + 1}: ${item.title}`} aria-current={active === index ? "true" : undefined} aria-controls="landing-gallery-slide" onClick={() => setActive(index)}><span /></button>
          ))}
        </div>
        <span className="landing-gallery-count" aria-live="polite" aria-atomic="true">{active + 1} / {slides.length}</span>
        <button className="landing-gallery-next" type="button" aria-label="Próxima imagem" aria-controls="landing-gallery-slide" onClick={() => setActive((active + 1) % slides.length)}>→</button>
      </div>
    </section>
  );
}
