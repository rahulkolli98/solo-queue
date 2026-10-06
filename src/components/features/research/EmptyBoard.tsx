/**
 * Board 07j: the yellow board before any topic exists, with three example
 * notes. On phones (board MStatesResearchEmpty) it is shorter: "Nothing saved
 * yet.", label-and-title notes only, and the paste hint sits under the card.
 */
export default function EmptyBoard() {
  return (
    <div className="rs-empty">
      <section className="rs-board" aria-label="Topic board">
        <div className="rs-board-head">
          <div className="rs-board-titles">
            <span className="t-eyebrow">Topic board · empty</span>
            <h2 className="rs-board-title">
              <span className="rs-long">Your first topic board lands here</span>
              <span className="rs-short">
                Nothing saved <em>yet.</em>
              </span>
            </h2>
          </div>
        </div>
        <div className="rs-examples">
          <div className="rs-example rs-example-1">
            <span className="rs-tape rs-tape-coral" aria-hidden="true" />
            <span className="t-meta">01 · A LINK</span>
            <b>Something you read</b>
            <span className="rs-example-copy">Docs, a thread, an article. It becomes a source with a short brief.</span>
          </div>
          <div className="rs-example rs-example-2">
            <span className="rs-tape rs-tape-cream" aria-hidden="true" />
            <span className="t-meta">02 · A THOUGHT</span>
            <b>A half-formed take</b>
            <span className="rs-example-copy">&ldquo;The token is the real limit.&rdquo; That is enough to start a topic.</span>
          </div>
          <div className="rs-example rs-example-3">
            <span className="t-meta">03 · A BUILD MOMENT</span>
            <b>Something that broke</b>
            <span className="rs-example-copy">
              Bugs and wins from flofield or postship make the best build-in-public posts.
            </span>
          </div>
        </div>
        <div className="rs-angles-empty">
          <span className="t-eyebrow">Angles to try</span>
          <span>appear once a topic has a source or two.</span>
        </div>
      </section>
      <span className="t-meta rs-empty-hint">↑ PASTE ANYTHING ABOVE TO START</span>
    </div>
  );
}
