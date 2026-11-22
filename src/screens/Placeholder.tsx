export default function Placeholder({ title, text, step }: { title: string; text: string; step: number }) {
  return (
    <>
      <header className="page-head"><h1>{title}</h1></header>
      <section className="card empty">
        <p className="empty-icon" aria-hidden>🛠️</p>
        <p>{text}</p>
        <p className="tag">Coming in step {step}</p>
      </section>
    </>
  )
}
