/**
 * "Use my own images": the founder's own carousel. The rules for picking and ordering the files, what Instagram
 * will do with them (it crops every image to the first one's shape), and the upload sequence. Pure, so each rule
 * is unit tested; the component only wires it to Convex and to React state.
 */
import { OWN_MAX_IMAGES, OWN_MIN_IMAGES } from "../../convex/lib/ownCarousel";

export { OWN_MAX_IMAGES, OWN_MIN_IMAGES };

/** Instagram takes images up to 8 MB. */
export const OWN_MAX_BYTES = 8 * 1024 * 1024;
/** Instagram shows 4:5 (portrait) to 1.91:1 (landscape); anything outside is cropped. */
export const RATIO_MIN = 4 / 5;
export const RATIO_MAX = 1.91;
/** Narrower than this looks soft on a phone. */
export const MIN_WIDTH = 320;
/** How different two shapes may be before the later one is cropped noticeably (3%). */
const SHAPE_TOLERANCE = 0.03;
/** How many images are uploaded and checked at the same time. */
export const UPLOAD_PARALLEL = 2;

export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

/** Why a file cannot be in a carousel, or null. Only PNG and JPEG work (Instagram refuses the rest in a carousel). */
export function checkOwnFile(file: PickedFile): string | null {
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    return `${file.name}: only PNG and JPEG images can go in an Instagram carousel.`;
  }
  if (file.size > OWN_MAX_BYTES) {
    return `${file.name}: too big (8 MB is the most Instagram takes for an image).`;
  }
  return null;
}

/**
 * Add newly chosen files to the ones already picked: refused files are named, a file picked twice is kept once,
 * and the list stops at ten (the extra files are named, not silently dropped).
 */
export function addFiles<F extends PickedFile & { lastModified?: number }>(
  current: readonly F[],
  added: readonly F[],
  room: number = OWN_MAX_IMAGES - current.length
): { files: F[]; refused: string[] } {
  const files = [...current];
  const refused: string[] = [];
  const key = (f: F) => `${f.name}|${f.size}|${f.lastModified ?? 0}`;
  const seen = new Set(files.map(key));
  let space = room;
  for (const file of added) {
    const why = checkOwnFile(file);
    if (why) {
      refused.push(why);
    } else if (seen.has(key(file))) {
      refused.push(`${file.name}: already in the carousel.`);
    } else if (space <= 0) {
      refused.push(`${file.name}: a carousel holds ${OWN_MAX_IMAGES} images at most.`);
    } else {
      files.push(file);
      seen.add(key(file));
      space -= 1;
    }
  }
  return { files, refused };
}

/** The list with item `index` moved one place (-1 up, +1 down); unchanged at either end. */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export interface ImageSize {
  /** "Image 2" in a note; the file name where the file is known. */
  w: number;
  h: number;
}

const shape = (s: ImageSize) => `${s.w} × ${s.h}`;

/**
 * What the founder should know about their images' sizes before queueing, in plain sentences (empty when all is
 * fine). `sizes[i]` is undefined until that image has loaded. None of these block the post; Instagram crops.
 */
export function imageNotes(sizes: readonly (ImageSize | undefined)[]): string[] {
  const notes: string[] = [];
  const known = sizes.map((s, i) => ({ s, n: i + 1 })).filter((x): x is { s: ImageSize; n: number } => !!x.s && x.s.w > 0 && x.s.h > 0);
  if (known.length === 0) return notes;

  const outside = known.filter(({ s }) => s.w / s.h < RATIO_MIN - 0.005 || s.w / s.h > RATIO_MAX + 0.005);
  if (outside.length > 0) {
    notes.push(
      `${list(outside.map((x) => x.n), "Image")} ${outside.length === 1 ? "is" : "are"} outside the shapes Instagram shows (tall 4:5 to wide 1.91:1), so ${outside.length === 1 ? "it" : "they"} will be cropped.`
    );
  }

  const first = sizes[0];
  if (first && first.w > 0 && first.h > 0) {
    const base = first.w / first.h;
    const differ = known.filter(({ s, n }) => n > 1 && Math.abs(s.w / s.h - base) / base > SHAPE_TOLERANCE);
    if (differ.length > 0) {
      notes.push(
        `Instagram crops every image to the shape of the first (${shape(first)}). ${list(differ.map((x) => x.n), "Image")} ${differ.length === 1 ? "is" : "are"} a different shape and will lose some edges.`
      );
    }
  }

  const small = known.filter(({ s }) => s.w < MIN_WIDTH);
  if (small.length > 0) {
    notes.push(`${list(small.map((x) => x.n), "Image")} ${small.length === 1 ? "is" : "are"} very small and may look blurry. 1080 pixels wide is best.`);
  }
  return notes;
}

/** "Image 2", "Images 2 and 4", "Images 1, 3 and 5". */
function list(numbers: number[], noun: string): string {
  if (numbers.length === 1) return `${noun} ${numbers[0]}`;
  return `${noun}s ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** A failed upload, with a sentence the founder can read. */
export class OwnUploadError extends Error {
  readonly image: number;
  constructor(image: number, message: string) {
    super(message);
    this.name = "OwnUploadError";
    this.image = image;
  }
}

/**
 * Upload every file (two at a time), then check each is reachable, and return the library ids in file order.
 * `have` remembers the files already stored in this attempt (key → id), so a retry after one failure uploads only
 * what is left. After a failure nothing new starts; the first error is thrown naming the image.
 */
export async function uploadOwnImages<F extends { name: string }>(args: {
  files: readonly F[];
  keyOf: (file: F) => string;
  have: Map<string, string>;
  upload: (file: F) => Promise<string>;
  verify: (id: string) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
  errorText: (e: unknown) => string;
}): Promise<string[]> {
  const { files, have } = args;
  const ids: (string | undefined)[] = files.map((f) => have.get(args.keyOf(f)));
  let done = ids.filter(Boolean).length;
  args.onProgress?.(done, files.length);
  let next = 0;
  const state: { failure: OwnUploadError | null } = { failure: null };

  const worker = async () => {
    while (!state.failure && next < files.length) {
      const i = next++;
      if (ids[i]) continue;
      const file = files[i];
      try {
        const id = await args.upload(file);
        have.set(args.keyOf(file), id);
        try {
          await args.verify(id);
        } catch (e) {
          // Stored but not reachable by Instagram: forget it so a retry uploads it again.
          have.delete(args.keyOf(file));
          throw new OwnUploadError(i + 1, `Image ${i + 1} (${file.name}) isn't reachable: ${args.errorText(e)}`);
        }
        ids[i] = id;
        done += 1;
        args.onProgress?.(done, files.length);
      } catch (e) {
        state.failure ??= e instanceof OwnUploadError ? e : new OwnUploadError(i + 1, `Image ${i + 1} (${file.name}) couldn't be uploaded: ${args.errorText(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_PARALLEL, files.length) }, worker));
  if (state.failure) throw state.failure;
  return ids as string[];
}
