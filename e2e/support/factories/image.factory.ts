/**
 * Image factory for the article-images tests. Produces in-memory
 * `Buffer`s — no test writes bytes to disk. Two accessors:
 *
 * - `.tinyPng()` / `.tinyJpeg()` / `.tinyWebp()` / `.tinyGif()` — the
 *   smallest well-formed file of each type the upload endpoint
 *   accepts. Perfect for happy-path smoke / regression coverage.
 * - `.oversizedBuffer()` — a `Buffer` deliberately larger than the
 *   `MAX_UPLOAD_BYTES` cap. `type = 'image/png'` so MIME sniffing
 *   doesn't reject it first; the server must fail on size alone.
 * - `.textBuffer()` — a plain-text buffer for the wrong-MIME test.
 *
 * The byte strings are the canonical "smallest valid" encodings and
 * are copied from public spec examples (PNG spec §11 / JFIF spec).
 * They're a few dozen bytes each, so no bandwidth concern in CI.
 */
import { Buffer } from "node:buffer";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/policy";

/** 1×1 transparent PNG, ~67 bytes. */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** 1×1 white JPEG, ~125 bytes. */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

/** 1×1 GIF, ~35 bytes. */
const TINY_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** 1×1 lossless WebP, ~30 bytes. */
const TINY_WEBP_B64 =
  "UklGRiIAAABXRUJQVlA4TAYAAAAvAAAAAAcRERGIiP4HAA==";

function fromB64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export class ImageFactory {
  tinyPng(): { buffer: Buffer; mime: string; filename: string } {
    return { buffer: fromB64(TINY_PNG_B64), mime: "image/png", filename: "tiny.png" };
  }
  tinyJpeg(): { buffer: Buffer; mime: string; filename: string } {
    return { buffer: fromB64(TINY_JPEG_B64), mime: "image/jpeg", filename: "tiny.jpg" };
  }
  tinyGif(): { buffer: Buffer; mime: string; filename: string } {
    return { buffer: fromB64(TINY_GIF_B64), mime: "image/gif", filename: "tiny.gif" };
  }
  tinyWebp(): { buffer: Buffer; mime: string; filename: string } {
    return { buffer: fromB64(TINY_WEBP_B64), mime: "image/webp", filename: "tiny.webp" };
  }

  /**
   * A PNG-typed buffer just above the size cap. The MIME check must
   * pass; the size check must be what rejects it. Using `alloc` +
   * `fill` keeps this cheap — the bytes are meaningless.
   */
  oversizedBuffer(): { buffer: Buffer; mime: string; filename: string } {
    const buf = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0);
    return { buffer: buf, mime: "image/png", filename: "too-big.png" };
  }

  /** Plain-text buffer for the wrong-MIME test. */
  textBuffer(): { buffer: Buffer; mime: string; filename: string } {
    return {
      buffer: Buffer.from("not an image, just text", "utf-8"),
      mime: "text/plain",
      filename: "notes.txt",
    };
  }
}
