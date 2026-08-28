import React from "react";

// Extra karusellsida: rubrik + en eller flera bilder centrerat. Samma mall som
// övriga vyer, men utan data/diagram.
export default function LogoSlide({ title, images = [] }) {
  return (
    <section className="view view--logos">
      <header className="view__header">
        <h1 className="view__title">{title}</h1>
      </header>
      <div className="logo-slide">
        {images.map((img, i) => (
          <img
            key={i}
            className={`logo-slide__img${img.invert ? " logo-slide__img--invert" : ""}`}
            src={img.src}
            alt={img.alt || ""}
            style={img.height ? { height: `${img.height}px` } : undefined}
          />
        ))}
      </div>
    </section>
  );
}
