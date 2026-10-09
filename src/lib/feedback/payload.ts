// The JSON body the feedback dialog POSTs (the shared Apps Script reads exactly this; runbook in
// erddap-places docs/feedback.md). Pure: no DOM, no network, no globals, so a test asserts the exact
// shape.
//
// Privacy rules, each a tested assertion:
//   - `url` is a key that exists ONLY when the "include a link to this view" box is ticked. (Every
//     obis-hex view is a permalink, so the box is on by default, but it stays a choice.)
//   - `email` exists ONLY when the person typed one. It is optional, goes to the Sheet and the mail
//     only (the script never writes it into the GitHub issue), and is never published.
import type { FeedbackKind } from "./issue";

export const APP_ID = "obis-hex";
export const MAX_TEXT_LENGTH = 4000;
export const MAX_TITLE_LENGTH = 200;
/** a `data:` URL is ~4/3 of the PNG's bytes; the script refuses images over 6 MB decoded */
export const MAX_IMAGE_DATA_URL_LENGTH = 4_500_000;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** true for a plausible address; the dialog blocks Send on a non-empty value that fails this */
export const isEmail = (s: string): boolean => EMAIL_RE.test(s.trim());

export interface FeedbackPayloadInput {
  kind: FeedbackKind;
  title?: string;
  text: string;
  email: string;
  /** the "include a link to this view" checkbox */
  includeUrl: boolean;
  /** the view's permalink (origin + path + hash) */
  url: string;
  /** the obis-h3 release id (release.json `release`), or null before it settles */
  release: string | null;
  /** release.json `obis_snapshot` */
  snapshot?: string | null;
  version: string;
  viewport: string;
  theme: string;
  userAgent: string;
  /** the title sentence, so the issue says what was on screen */
  sentence?: string;
  /** a `data:image/…` URL; left out when absent or over {@link MAX_IMAGE_DATA_URL_LENGTH} */
  image?: string;
  /** the script's honeypot key; the dialog has no trap input (0.7.5: browser autofill filled every one),
   * so it is always empty from the app; the script drops a non-empty one */
  website?: string;
}

export interface FeedbackPayload {
  app: typeof APP_ID;
  kind: FeedbackKind;
  title?: string;
  text: string;
  email?: string;
  url?: string;
  release: string;
  version: string;
  viewport: string;
  theme: string;
  user_agent: string;
  sentence?: string;
  image?: string;
  website: string;
}

/** "v20260728 (OBIS snapshot 2026-07-28)", or "" before the release settles */
export function releaseLine(release: string | null, snapshot?: string | null): string {
  if (!release) return "";
  return snapshot ? `${release} (OBIS snapshot ${snapshot})` : release;
}

export function buildFeedbackPayload(i: FeedbackPayloadInput): FeedbackPayload {
  const p: FeedbackPayload = {
    app: APP_ID,
    kind: i.kind,
    text: i.text.trim().slice(0, MAX_TEXT_LENGTH),
    release: releaseLine(i.release, i.snapshot),
    version: i.version,
    viewport: i.viewport,
    theme: i.theme,
    user_agent: i.userAgent,
    website: i.website ?? "",
  };
  const title = (i.title ?? "").trim();
  if (title) p.title = title.slice(0, MAX_TITLE_LENGTH);
  const email = i.email.trim();
  if (email) p.email = email;
  if (i.includeUrl) p.url = i.url;
  if (i.sentence) p.sentence = i.sentence;
  if (i.image && i.image.length <= MAX_IMAGE_DATA_URL_LENGTH) p.image = i.image;
  return p;
}

/**
 * The screenshot as a data URL under the cap: the PNG when it fits, else a JPEG (the script takes
 * both), else undefined (the report goes without the picture).
 */
export function fitImage(c: { toDataURL(type?: string, quality?: number): string }, max = MAX_IMAGE_DATA_URL_LENGTH): string | undefined {
  const png = c.toDataURL("image/png");
  if (png.length <= max) return png;
  for (const q of [0.85, 0.6]) {
    const jpg = c.toDataURL("image/jpeg", q);
    if (jpg.length <= max) return jpg;
  }
  return undefined;
}
