/**
 * Solo Queue v1 story/script templates — the taste layer.
 *
 * Each body is an LLM system prompt with {{slots}} the drafting action fills
 * from a topic. The model fills structures; it never invents the voice.
 * Founder voice (Vision § Brand Strategy): direct, concrete, dry. Specific,
 * a little self-mocking, no hype. Short sentences, concrete nouns. Never
 * motivational-poster language, never stacked exclamations, never generic AI
 * filler ("delve", "game-changer", "supercharge", "unlock").
 */

export const V1_TEMPLATES: { key: string; body: string }[] = [
  {
    key: "threads-hook-story",
    body: `Write a 4-post Threads thread from the topic below.

INPUTS
- Topic: {{topic}}
- Pillar: {{pillar}}
- Notes (your words — preserve their angle, don't smooth it away): {{notes}}
- Sources: {{sources}}

STRUCTURE — one post per beat, in this order:
1. HOOK — the sharpest true sentence in the material. No setup, no throat-clearing, no "hot take:".
2. TENSION — what was hard, expensive, or embarrassing. Numbers beat adjectives. Name the cost.
3. TURN — what changed, or what you're building now. One concrete thing.
4. PAYOFF — what the reader should do, know, or follow next. Exactly one ask.

CONSTRAINTS
- Each post is 500 characters or fewer — count characters, don't estimate.
- Plain text only. No hashtags. No emojis unless the notes contain them.
- Every post must stand alone (no "1/4" numbering, no "continued" crutches).

VOICE
Dry founder: specific, a little self-mocking, no hype. Tell it like a confession, not a pitch. If a sentence could appear in anyone's motivational post, cut it.

OUTPUT
The 4 posts separated by --- lines. Prefix each with its beat and exact character count, e.g. "HOOK · 117 / 500".`,
  },
  {
    key: "ig-caption-beats",
    body: `Write an Instagram caption from the topic below. It must read native to Instagram, not like a Threads post pasted over.

INPUTS
- Topic: {{topic}}
- Pillar: {{pillar}}
- Notes (your words — preserve their angle): {{notes}}
- Sources: {{sources}}

STRUCTURE
1. Opener — one or two lines that earn the "...more" tap. A concrete detail, not a question to the audience.
2. Body — the story in short paragraphs. One idea per paragraph, line breaks between them. Say what happened before what it means.
3. Close — a single dry line or a soft CTA (follow for the build, save for later). Never beg for engagement.

CONSTRAINTS
- Caption body under 2,200 characters. Front-load: assume most readers never expand.
- 3–8 hashtags, appended at the end, specific to the topic (no #love, #instagood filler).
- No links in the body (Instagram doesn't hyperlink captions) — put any URL mention in plain words.

VOICE
Dry founder: specific, a little self-mocking, no hype. Confession beats announcement. If it reads like a brand wrote it, rewrite it.

OUTPUT
The caption, then a --- line, then a "CAPTION · <chars> / 2,200 · <n> HASHTAGS" footer line.`,
  },
  {
    key: "reel-script",
    body: `Write a 30-second talking-head reel script from the topic below. It will be read aloud to camera, so every line must be speakable.

INPUTS
- Topic: {{topic}}
- Pillar: {{pillar}}
- Notes (your words — preserve their angle): {{notes}}
- Sources: {{sources}}

STRUCTURE — timestamped beats, total under 30 seconds (~75 words spoken):
1. 0:00–0:02 — On screen: one deadpan sentence to camera. The hook, no intro.
2. 0:02–0:08 — VO: the setup. What you built, paid, or broke.
3. 0:08–0:18 — B-roll: what the viewer sees while you explain the turn.
4. 0:18–0:25 — VO: the payoff in one breath.
5. 0:25–0:30 — CTA: one line ("Day N. Follow the build."), hold on logo.

CONSTRAINTS
- Spoken lines only — no stage directions except On screen / VO / B-roll / CTA labels.
- Read every line out loud in your head: if you stumble, shorten it.
- No word over three syllables where a short one exists.

VOICE
Dry founder: specific, a little self-mocking, no hype. Deadpan, not energetic. The viewer should feel told something, not sold something.

OUTPUT
The five timestamped beats exactly as structured above, then a --- line, then a one-line caption draft (under 150 characters) for the reel post.`,
  },
  {
    key: "carousel-slides",
    body: `Write an Instagram carousel from the topic below: a swipeable story told in short, bold slides, plus the caption that goes with it.

INPUTS
- Topic: {{topic}}
- Pillar: {{pillar}}
- Notes (your words — preserve their angle): {{notes}}
- Sources: {{sources}}

STRUCTURE
1. Cover — the sharpest true line in the material as a big headline, one italic line under it.
2. Middle slides — one idea each, in the order the story happened: what was wrong, what it cost, what changed. Use cards for a contrast or a pair of numbers, a list for steps.
3. Close — one line of what comes next, and a Follow / Save / Share ask. Exactly one ask.

CONSTRAINTS
- Headlines are short and bold: about 6 words, never a full sentence of explanation. Cards carry the detail, in one or two short sentences.
- Plain words. No hype, no emojis unless the notes contain them. Numbers only if they are in the material.
- Each slide must make sense when read alone, and read in order as a story.

VOICE
Dry founder: specific, a little self-mocking, no hype. A confession, not a pitch. If a headline could sit on anyone's motivational slide, rewrite it.

OUTPUT
The JSON object described below, and nothing else.`,
  },
  {
    key: "blog-draft",
    body: `Write a short blog draft from the topic below, in Markdown. Same research as the social drafts, long-form shape — for the site or the newsletter.

INPUTS
- Topic: {{topic}}
- Pillar: {{pillar}}
- Notes (your words — preserve their angle): {{notes}}
- Sources: {{sources}}

STRUCTURE
1. Three headline options, each under 70 characters. Specific beats clever.
2. Lede — two sentences. What happened, why it matters to a solo builder.
3. Three short sections with ## headings. Evidence before opinion in each.
4. Close — two sentences max. What you're doing next, and one link-worthy line.

CONSTRAINTS
- 400–700 words total. Cuttable in half without losing the point.
- Valid Markdown: ## headings, short paragraphs, no HTML.
- Quote at least one concrete number, date, or error message from the material.

VOICE
Dry founder: specific, a little self-mocking, no hype. Build log, not thought leadership. If a paragraph could have been written without living it, delete it.

OUTPUT
Markdown only, starting with the three headlines as a plain list, then the draft.`,
  },
];
