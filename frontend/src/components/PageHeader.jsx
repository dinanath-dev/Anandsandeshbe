export default function PageHeader({ eyebrow, title, description }) {
  return (
    <header className="mb-8 text-center sm:mb-10">
      {eyebrow ? (
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#5f9345]">{eyebrow}</p>
      ) : null}
      <h1 className="mx-auto max-w-3xl text-3xl font-black tracking-normal text-ink sm:text-5xl">{title}</h1>
      {description ? (
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">{description}</p>
      ) : null}
    </header>
  );
}
