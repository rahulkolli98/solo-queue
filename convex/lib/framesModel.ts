import { z } from "zod";

/**
 * Story frames: the beat structures the drafting prompt follows. They are
 * data (Library > Story frames) so the founder's scripting skill, not the
 * model, decides the shape of a post. Pure helpers, unit-tested.
 */

export type FrameFit = "thread" | "single" | "reel" | "carousel";

export interface FrameBeat {
  label: string;
  hint: string;
}

export interface FrameInput {
  key: string;
  name: string;
  beats: FrameBeat[];
  fits: FrameFit[];
  color: string;
}

export const DEFAULT_FRAMES: FrameInput[] = [
  {
    key: "confession",
    name: "Confession",
    beats: [
      { label: "Admit", hint: "What you got wrong or hid. One plain sentence." },
      { label: "Cost", hint: "What it cost you, with a number if you have one." },
      { label: "Fix", hint: "What you changed. Concrete, not a lesson." },
      { label: "Invite", hint: "Ask them to follow along, not to buy." },
    ],
    fits: ["thread", "reel"],
    color: "pillar-build",
  },
  {
    key: "hook-tension-turn-payoff",
    name: "Hook, tension, turn, payoff",
    beats: [
      { label: "Hook", hint: "The line that stops the scroll. Specific, no setup." },
      { label: "Tension", hint: "Why it was a problem, in one or two lines." },
      { label: "Turn", hint: "The moment it changed." },
      { label: "Payoff", hint: "What you got, and what it means for them." },
    ],
    fits: ["thread"],
    color: "pillar-tools",
  },
  {
    key: "receipt",
    name: "The receipt",
    beats: [
      { label: "Claim", hint: "The thing you say is true." },
      { label: "Proof", hint: "The number, screenshot or log that shows it." },
      { label: "Takeaway", hint: "What to do with it." },
    ],
    fits: ["single", "carousel"],
    color: "pillar-craft",
  },
  {
    key: "teardown",
    name: "Teardown",
    beats: [
      { label: "Target", hint: "The thing you took apart." },
      { label: "Works", hint: "What it does well." },
      { label: "Breaks", hint: "Where it fails." },
      { label: "Steal", hint: "The part worth copying." },
    ],
    fits: ["reel", "carousel"],
    color: "pillar-screen",
  },
  {
    key: "hot-take",
    name: "Hot take",
    beats: [
      { label: "Take", hint: "The opinion, stated flat." },
      { label: "Why", hint: "The reason, from your own work." },
      { label: "Catch", hint: "The fair objection." },
    ],
    fits: ["thread"],
    color: "pillar-build",
  },
  {
    key: "before-after",
    name: "Before / after",
    beats: [
      { label: "Before", hint: "How it was." },
      { label: "After", hint: "How it is now, and what changed it." },
    ],
    fits: ["carousel"],
    color: "pillar-tools",
  },
];

const fitSchema = z.enum(["thread", "single", "reel", "carousel"]);

export const frameInputSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "Lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(60),
  beats: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(30),
        hint: z.string().trim().max(200),
      })
    )
    .min(2, "A frame needs at least 2 beats")
    .max(5, "A frame has at most 5 beats"),
  fits: z
    .array(fitSchema)
    .min(1, "Choose at least one place the frame fits")
    .transform((list) => [...new Set(list)]),
  color: z.string().regex(/^pillar-[a-z]+$/, "Use a pillar color token"),
});

export type FrameValidation =
  | { ok: true; frame: FrameInput }
  | { ok: false; message: string };

export function validateFrame(input: unknown): FrameValidation {
  const parsed = frameInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, frame: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
  return { ok: false, message: `${issue.message}${where}` };
}

/** Renders a frame as numbered guidance lines for the drafting prompt. */
export function frameToPrompt(frame: { name: string; beats: FrameBeat[] }): string {
  const lines = frame.beats.map((b, i) => `${i + 1}. ${b.label}: ${b.hint}`.trim());
  return `Story frame "${frame.name}". Follow these beats in order:\n${lines.join("\n")}`;
}
