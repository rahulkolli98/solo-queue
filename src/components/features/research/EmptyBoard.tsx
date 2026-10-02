/** Board 07j: the yellow board before any topic exists, with three example notes. */
export default function EmptyBoard() {
  return (
    <section className="rs-board" aria-label="Topic board">
      <div className="rs-board-head">
        <div className="rs-board-titles">
          <span className="t-eyebrow">Topic board · empty</span>
          <h2 className="rs-board-title">Your first topic board lands here</h2>
        </div>
      </div>
      <div className="rs-examples">
        <div className="rs-example rs-example-1">
          <span className="rs-tape rs-tape-coral" aria-hidden="true" />
          <span className="t-meta">01 · A LINK</span>
          <b>Something you read</b>
          <span>Docs, a thread, an article. It becomes a source with a short brief.</span>
        </div>
        <div className="rs-example rs-example-2">
          <span className="rs-tape rs-tape-cream" aria-hidden="true" />
          <span className="t-meta">02 · A THOUGHT</span>
          <b>A half-formed take</b>
          <span>&ldquo;The token is the real limit.&rdquo; That is enough to start a topic.</span>
        </div>
        <div className="rs-example rs-example-3">
          <span className="t-meta">03 · A BUILD MOMENT</span>
          <b>Something that broke</b>
          <span>Bugs and wins from flofield or postship make the best build-in-public posts.</span>
        </div>
      </div>
      <div className="rs-angles-empty">
        <span className="t-eyebrow">Angles to try</span>
        <span>appear once a topic has a source or two.</span>
      </div>
    </section>
  );
}
