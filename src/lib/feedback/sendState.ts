// what the feedback dialog's Send button and the line under it do, as plain logic (tested): Send is
// the one primary action and always shown; without an endpoint it is disabled, and when a POST
// fails it can be tried again. In both cases one notice line offers the GitHub issue as the way out.
export type SendPhase = "idle" | "sending" | "sent" | "failed";

export interface SendUi {
  /** Send is disabled */
  disabled: boolean;
  /** the notice's words before the issue link, or null for no notice */
  notice: { before: string; link: string; after: string } | null;
}

const LINK = "open a GitHub issue";

export function sendUi(o: { endpoint: string | null; note: string; emailOk: boolean; phase: SendPhase }): SendUi {
  const disabled = !o.endpoint || !o.note.trim() || !o.emailOk || o.phase === "sending" || o.phase === "sent";
  if (!o.endpoint) return { disabled, notice: { before: "Sending is not set up yet; ", link: LINK, after: " instead." } };
  if (o.phase === "failed") return { disabled, notice: { before: "It could not be sent; ", link: LINK, after: " instead." } };
  return { disabled, notice: null };
}
