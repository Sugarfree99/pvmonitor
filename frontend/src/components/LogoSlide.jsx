import React from "react";

// Extra karusellsida: rubrik + en eller flera bilder centrerat. Samma mall som
// övriga vyer, men utan data/diagram. Valfri bakgrundston (backdrop) tonar ut
// bakom varje bild så att även mörka logotyper syns mot den mörka bakgrunden.
export default function LogoSlide({ title, images = [], backdrop = "" }) {
  const chipStyle = backdrop
    ? { background: `radial-gradient(closest-side, ${backdrop} 0%, transparent 100%)` }
    : undefined;
  return (
    <section className="view view--logos">
      <header className="view__header">
        <h1 className="view__title">{title}</h1>
      </header>
      <div className="logo-slide">
        {images.map((img, i) => (
          <div key={i} className="logo-slide__chip" style={chipStyle}>
            <img
              className={`logo-slide__img${img.invert ? " logo-slide__img--invert" : ""}`}
              src={img.src}
              alt={img.alt || ""}
              style={img.height ? { height: `${img.height}px` } : undefined}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
