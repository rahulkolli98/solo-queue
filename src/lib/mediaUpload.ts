/**
 * Browser side of a media upload: POST the file to the short-lived Convex
 * storage URL and report progress. The mutations around it (generateUploadUrl,
 * store) are called by the component.
 */

export interface UploadHandle {
  /** Resolves with the storage id Convex returns. */
  done: Promise<string>;
  cancel: () => void;
}

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelled";
  }
}

export function postFile(
  url: string,
  file: File,
  onProgress: (percent: number) => void
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const done = new Promise<string>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error("Upload failed. Try again."));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { storageId?: string };
        if (!body.storageId) throw new Error("no id");
        resolve(body.storageId);
      } catch {
        reject(new Error("Upload failed. Try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new UploadCancelled());
    xhr.send(file);
  });
  return { done, cancel: () => xhr.abort() };
}
