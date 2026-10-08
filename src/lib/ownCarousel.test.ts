import { describe, expect, it, vi } from "vitest";
import {
  OWN_MAX_BYTES,
  addFiles,
  checkOwnFile,
  imageNotes,
  moveItem,
  removeItem,
  uploadOwnImages,
} from "@/lib/ownCarousel";

const file = (name: string, over: Partial<{ type: string; size: number; lastModified: number }> = {}) => ({
  name,
  type: "image/png",
  size: 1000,
  lastModified: 1,
  ...over,
});

describe("checkOwnFile", () => {
  it("takes PNG and JPEG up to 8 MB and says why anything else cannot go in a carousel", () => {
    expect(checkOwnFile(file("a.png"))).toBeNull();
    expect(checkOwnFile(file("a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(checkOwnFile(file("a.png", { size: OWN_MAX_BYTES }))).toBeNull();
    expect(checkOwnFile(file("a.png", { size: OWN_MAX_BYTES + 1 }))).toContain("too big");
    expect(checkOwnFile(file("a.webp", { type: "image/webp" }))).toBe("a.webp: only PNG and JPEG images can go in an Instagram carousel.");
    expect(checkOwnFile(file("a.gif", { type: "image/gif" }))).toContain("only PNG and JPEG");
    expect(checkOwnFile(file("a.mp4", { type: "video/mp4" }))).toContain("only PNG and JPEG");
  });
});

describe("addFiles", () => {
  it("adds the good files in order and names each refused one", () => {
    const out = addFiles([], [file("a.png"), file("b.gif", { type: "image/gif" }), file("c.png", { size: OWN_MAX_BYTES + 1 }), file("d.png")]);
    expect(out.files.map((f) => f.name)).toEqual(["a.png", "d.png"]);
    expect(out.refused).toHaveLength(2);
    expect(out.refused[0]).toContain("b.gif");
    expect(out.refused[1]).toContain("c.png");
  });

  it("keeps a file once when it is picked twice, and stops at ten", () => {
    const first = [file("a.png")];
    const again = addFiles(first, [file("a.png"), file("b.png")]);
    expect(again.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(again.refused).toEqual(["a.png: already in the carousel."]);
    // Same name but a different file is fine.
    expect(addFiles(first, [file("a.png", { size: 2000 })]).files).toHaveLength(2);

    const nine = Array.from({ length: 9 }, (_, i) => file(`n${i}.png`));
    const out = addFiles(nine, [file("x.png"), file("y.png")]);
    expect(out.files).toHaveLength(10);
    expect(out.refused).toEqual(["y.png: a carousel holds 10 images at most."]);
  });
});

describe("moveItem and removeItem", () => {
  it("moves one place, stays put at either end, and removes without changing the original", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(list, 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(list, 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(list, 5, 1)).toEqual(["a", "b", "c"]);
    expect(removeItem(list, 1)).toEqual(["a", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("imageNotes", () => {
  const sq = { w: 1080, h: 1080 };
  const portrait = { w: 1080, h: 1350 };

  it("says nothing when every image is in range, the same shape and big enough", () => {
    expect(imageNotes([portrait, { w: 1080, h: 1350 }, { w: 1080, h: 1340 }])).toEqual([]);
    expect(imageNotes([])).toEqual([]);
    expect(imageNotes([undefined, undefined])).toEqual([]);
  });

  it("explains that every image is cropped to the first one's shape, naming the odd ones out", () => {
    const notes = imageNotes([portrait, sq, portrait, { w: 1920, h: 1080 }]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("crops every image to the shape of the first (1080 × 1350)");
    expect(notes[0]).toContain("Images 2 and 4 are a different shape");
    expect(imageNotes([portrait, sq])[0]).toContain("Image 2 is a different shape");
  });

  it("warns about a shape Instagram never shows and about very small images", () => {
    const tall = { w: 500, h: 1500 };
    const notes = imageNotes([tall, tall]);
    expect(notes[0]).toContain("Images 1 and 2 are outside the shapes Instagram shows");
    const small = imageNotes([{ w: 300, h: 375 }, portrait]);
    expect(small.some((n) => n.includes("Image 1 is very small"))).toBe(true);
    // 1.91:1 and 4:5 are the edges and are fine.
    expect(imageNotes([{ w: 1910, h: 1000 }])).toEqual([]);
    expect(imageNotes([{ w: 800, h: 1000 }])).toEqual([]);
  });

  it("works while some images have not loaded yet", () => {
    expect(imageNotes([undefined, sq, undefined])).toEqual([]);
    expect(imageNotes([portrait, undefined, sq])[0]).toContain("Image 3 is a different shape");
  });
});

describe("uploadOwnImages", () => {
  const files = [{ name: "a.png" }, { name: "b.png" }, { name: "c.png" }];
  const keyOf = (f: { name: string }) => f.name;
  const errorText = (e: unknown) => (e instanceof Error ? e.message : "failed");

  it("uploads and checks every file and returns the ids in file order, with progress", async () => {
    const progress: number[] = [];
    const ids = await uploadOwnImages({
      files,
      keyOf,
      have: new Map(),
      upload: async (f) => `id-${f.name}`,
      verify: async () => undefined,
      onProgress: (done) => progress.push(done),
      errorText,
    });
    expect(ids).toEqual(["id-a.png", "id-b.png", "id-c.png"]);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(3);
  });

  it("names the image that failed, and a retry uploads only what is left", async () => {
    const have = new Map<string, string>();
    const upload = vi.fn(async (f: { name: string }) => {
      if (f.name === "b.png" && upload.mock.calls.filter(([x]) => x.name === "b.png").length === 1) throw new Error("connection lost");
      return `id-${f.name}`;
    });
    const args = { files, keyOf, have, upload, verify: async () => undefined, errorText };
    await expect(uploadOwnImages(args)).rejects.toThrow("Image 2 (b.png) couldn't be uploaded: connection lost");
    const before = upload.mock.calls.length;
    const ids = await uploadOwnImages(args);
    expect(ids).toEqual(["id-a.png", "id-b.png", "id-c.png"]);
    // Only the files that were not stored the first time are uploaded again.
    const again = upload.mock.calls.slice(before).map(([f]) => f.name).sort();
    expect(again).not.toContain("a.png");
  });

  it("a file that is stored but not reachable is forgotten and named", async () => {
    const have = new Map<string, string>();
    await expect(
      uploadOwnImages({
        files: [{ name: "a.png" }],
        keyOf,
        have,
        upload: async () => "id-a",
        verify: async () => {
          throw new Error("Instagram can't open it");
        },
        errorText,
      })
    ).rejects.toThrow("Image 1 (a.png) isn't reachable: Instagram can't open it");
    expect(have.size).toBe(0);
  });
});
