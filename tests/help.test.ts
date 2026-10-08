import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cardPosition, tourKey, tourStep, TOUR_STOPS } from "../src/lib/help/tour";
import { DOORS, onLoad, parseHelpQuery, QUESTIONS, startState } from "../src/lib/help/start";
import { shortcutFor } from "../src/lib/help/keys";
import { sources } from "../src/lib/help/sources";
import { issueTitle, issueUrl, MAX_ISSUE_URL_LENGTH, reportBody, type FeedbackReport } from "../src/lib/feedback/issue";
import { arrowHead, rectBox, toImage } from "../src/lib/feedback/annotate";
import { DEFAULT_STATE, formatHash, parseHash } from "../src/lib/state/url";

describe("tour", () => {
  it("stops in the page's order: sentence, ① ② ③, legend, Time, Cell, ④, Help", () => {
    expect(TOUR_STOPS.map((s) => s.id)).toEqual(["sentence", "taxon", "place", "indicator", "legend", "time", "cell", "share", "help"]);
    expect(TOUR_STOPS.filter((s) => s.tab).map((s) => s.tab)).toEqual(["taxon", "place", "indicator", "share"]);
  });
  it("each stop is one or two sentences and has a target", () => {
    for (const s of TOUR_STOPS) {
      expect(s.target.length).toBeGreaterThan(0);
      const n = s.text.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
      expect(n, s.id).toBeLessThanOrEqual(2);
    }
  });
  it("keys: arrows and PageUp/PageDown move, Home/End jump, Esc closes, others pass through", () => {
    expect(tourKey("ArrowRight")).toBe("next");
    expect(tourKey("PageDown")).toBe("next");
    expect(tourKey("ArrowLeft")).toBe("back");
    expect(tourKey("PageUp")).toBe("back");
    expect(tourKey("Home")).toBe("first");
    expect(tourKey("End")).toBe("last");
    expect(tourKey("Escape")).toBe("close");
    expect(tourKey("Enter")).toBeNull(); // Enter activates the focused button
    expect(tourKey("a")).toBeNull();
  });
  it("steps: Next on the last stop is Done (-1), Back stops at the first", () => {
    const n = TOUR_STOPS.length;
    expect(tourStep(0, "next")).toBe(1);
    expect(tourStep(n - 1, "next")).toBe(-1);
    expect(tourStep(0, "back")).toBe(0);
    expect(tourStep(3, "back")).toBe(2);
    expect(tourStep(4, "first")).toBe(0);
    expect(tourStep(0, "last")).toBe(n - 1);
    expect(tourStep(4, "close")).toBe(-1);
    expect(tourStep(4, null)).toBe(4);
    expect(tourStep(0, "next", 0)).toBe(-1);
  });
  it("the card goes below the target, else above, else beside, and stays in the window", () => {
    const win = { width: 1000, height: 800 };
    const card = { width: 300, height: 150 };
    expect(cardPosition({ left: 100, top: 50, width: 200, height: 40 }, card, win)).toEqual({ left: 100, top: 102 });
    expect(cardPosition({ left: 100, top: 700, width: 200, height: 40 }, card, win)).toEqual({ left: 100, top: 538 });
    // a tall target: beside it on the right
    expect(cardPosition({ left: 10, top: 20, width: 300, height: 760 }, card, win)).toEqual({ left: 322, top: 20 });
    // clamped at the right edge
    expect(cardPosition({ left: 900, top: 50, width: 80, height: 30 }, card, win).left).toBe(692);
  });
});

describe("?tour= and ?modal=", () => {
  it("parses tour on/off and the three modals; anything else is null", () => {
    expect(parseHelpQuery("?tour=off")).toEqual({ tour: "off", modal: null });
    expect(parseHelpQuery("?tour=on")).toEqual({ tour: "on", modal: null });
    expect(parseHelpQuery("?tour=1&modal=sources")).toEqual({ tour: "on", modal: "sources" });
    expect(parseHelpQuery("?modal=ABOUT")).toEqual({ tour: null, modal: "about" });
    expect(parseHelpQuery("?modal=keys")).toEqual({ tour: null, modal: "keys" });
    expect(parseHelpQuery("?modal=nope&tour=maybe")).toEqual({ tour: null, modal: null });
    expect(parseHelpQuery("")).toEqual({ tour: null, modal: null });
  });
  it("first visit shows the welcome card; a later visit does not", () => {
    expect(onLoad({ tour: null, modal: null }, false)).toEqual({ welcome: true, tour: false, modal: null });
    expect(onLoad({ tour: null, modal: null }, true)).toEqual({ welcome: false, tour: false, modal: null });
  });
  it("?tour=off suppresses the welcome card and the tour (screenshots), but keeps a ?modal=", () => {
    expect(onLoad({ tour: "off", modal: null }, false)).toEqual({ welcome: false, tour: false, modal: null });
    expect(onLoad({ tour: "off", modal: "sources" }, false)).toEqual({ welcome: false, tour: false, modal: "sources" });
  });
  it("?tour=on replays the tour even after a visit; ?modal= opens the modal instead of the card", () => {
    expect(onLoad({ tour: "on", modal: null }, true)).toEqual({ welcome: false, tour: true, modal: null });
    expect(onLoad({ tour: null, modal: "sources" }, false)).toEqual({ welcome: false, tour: false, modal: "sources" });
  });
});

describe("welcome card views", () => {
  const st = { ...DEFAULT_STATE, theme: "light" as const, tab: "share" as const };
  it("door 1: seabirds EOV, res 3, worldwide; keeps the theme and layout", () => {
    const h = formatHash(startState(st, DOORS[0]));
    expect(h).toBe("#i=es&l=eov:seabirds&p=all&r=3&o=0.85&t=light&d=release&g=flat&c=-20,5,1.4&k=share");
  });
  it("door 2: class Aves, res 7, Monterey Bay", () => {
    const s = startState({ ...st, decade: 1990, cell: "831f8dfffffffff" }, DOORS[1]);
    expect([s.layer, s.res, s.resMode, s.lon, s.lat, s.zoom, s.decade, s.cell]).toEqual(["taxon:class:Aves", 7, "manual", -122.05, 36.75, 9.2, null, null]);
  });
  it("every question is a valid URL state that round-trips", () => {
    expect(QUESTIONS).toHaveLength(3);
    for (const q of QUESTIONS) {
      const s = startState(DEFAULT_STATE, q);
      expect(parseHash(formatHash(s)).layer, q.label).toBe(s.layer);
      expect(parseHash(formatHash(s)).decade).toBe(s.decade);
    }
    expect(startState(DEFAULT_STATE, QUESTIONS[1]).decade).toBe(2010);
  });
});

describe("shortcuts", () => {
  it("the keyboard map", () => {
    expect(shortcutFor({ key: "?" })).toEqual({ kind: "tour" });
    expect(shortcutFor({ key: "t" })).toEqual({ kind: "theme" });
    expect(shortcutFor({ key: "g" })).toEqual({ kind: "projection" });
    expect(shortcutFor({ key: "1" })).toEqual({ kind: "tab", tab: "taxon" });
    expect(shortcutFor({ key: "4" })).toEqual({ kind: "tab", tab: "share" });
    expect(shortcutFor({ key: "5" })).toBeNull();
    expect(shortcutFor({ key: "+" })).toEqual({ kind: "zoom", by: 1 });
    expect(shortcutFor({ key: "-" })).toEqual({ kind: "zoom", by: -1 });
    expect(shortcutFor({ key: "Escape" })).toEqual({ kind: "escape" });
  });
  it("never while typing, with a modifier, or while a dialog or the tour is open (except Esc)", () => {
    expect(shortcutFor({ key: "t", targetTag: "input" })).toBeNull();
    expect(shortcutFor({ key: "g", targetTag: "TEXTAREA" })).toBeNull();
    expect(shortcutFor({ key: "1", targetEditable: true })).toBeNull();
    expect(shortcutFor({ key: "t", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "?", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "t" }, { busy: true })).toBeNull();
    expect(shortcutFor({ key: "Escape", targetTag: "INPUT" }, { busy: true })).toEqual({ kind: "escape" });
  });
});

describe("feedback issue", () => {
  const r: FeedbackReport = {
    kind: "feedback",
    note: "The spike off Peru looks wrong",
    url: "https://oceanmetrics.io/obis-hex/#i=es&l=all",
    appVersion: "0.5.0",
    release: "v20260728",
    snapshot: "2026-07-28",
    viewport: "1280×800",
    theme: "dark",
    sentence: "All taxa, all years, worldwide: ES(50)",
  };
  it("prefills the repo's new-issue page with title, body and label", () => {
    const u = new URL(issueUrl(r));
    expect(u.origin + u.pathname).toBe("https://github.com/oceanmetrics/obis-hex/issues/new");
    expect(u.searchParams.get("title")).toBe("Feedback: The spike off Peru looks wrong");
    expect(u.searchParams.get("labels")).toBe("feedback");
    expect(u.searchParams.get("body")).toBe(
      [
        "**Note**",
        "",
        "The spike off Peru looks wrong",
        "",
        "_Screenshot: paste it here (it is on your clipboard)._",
        "",
        "---",
        "- View: https://oceanmetrics.io/obis-hex/#i=es&l=all",
        "- Showing: All taxa, all years, worldwide: ES(50)",
        "- Release: v20260728 (OBIS snapshot 2026-07-28)",
        "- App: obis-hex v0.5.0",
        "- Viewport: 1280×800",
        "- Theme: dark",
      ].join("\n"),
    );
  });
  it("Register a product: its own title and label; an empty note falls back to the sentence", () => {
    const p = { ...r, kind: "product" as const, note: "" };
    expect(issueTitle(p)).toBe("I built something with this: All taxa, all years, worldwide: ES(50)");
    expect(new URL(issueUrl(p)).searchParams.get("labels")).toBe("product");
    expect(reportBody(p)).toContain("**What I built** (a link helps)\n\n_(no note)_");
  });
  it("a long note is cut to fit the URL limit; the view's details survive", () => {
    const long = { ...r, note: "ö spike ".repeat(3000) };
    const u = issueUrl(long);
    expect(u.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    const body = new URL(u).searchParams.get("body")!;
    expect(body).toContain("… (cut: the full note is on the clipboard)");
    expect(body).toContain("- View: https://oceanmetrics.io/obis-hex/#i=es&l=all");
    expect(body).toContain("- Theme: dark");
    expect(issueUrl(long, 3000).length).toBeLessThanOrEqual(3000);
  });
});

describe("mark-up geometry", () => {
  it("rectangle from any two corners, arrow head behind the tip, pointer to image px", () => {
    expect(rectBox({ x0: 50, y0: 40, x1: 10, y1: 60 })).toEqual({ x: 10, y: 40, w: 40, h: 20 });
    const [p, q] = arrowHead({ x0: 0, y0: 0, x1: 100, y1: 0 }, 10);
    expect(p[0]).toBeLessThan(100);
    expect(q[0]).toBeLessThan(100);
    expect(p[1]).toBeCloseTo(-q[1]);
    expect(toImage(150, 100, { left: 100, top: 50, width: 200, height: 100 }, 800, 400)).toEqual({ x: 200, y: 200 });
  });
});

describe("data sources", () => {
  it("one row each: OBIS, WoRMS (DOI), IOOS MLDN EOVs, CARTO, software", () => {
    const rows = sources({ snapshot: "2026-07-28", release: "v20260728", year: "2026" });
    expect(rows.map((s) => s.name)).toEqual(["OBIS", "WoRMS", "IOOS Marine Life Data Network: EOV definitions", "CARTO basemaps", "Software"]);
    expect(rows[0].citation).toContain("OBIS (2026) Ocean Biodiversity Information System");
    expect(rows[0].role).toContain("snapshot 2026-07-28");
    expect(rows[1].doi).toBe("10.14284/170");
    expect(rows[2].href).toContain("ioos/marine_life_data_network");
  });
});

describe("html-to-image stays lazy", () => {
  const src = join(__dirname, "..", "src");
  const files = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]));
  it("only capture.ts imports html-to-image; capture and the dialog are reached by import() only", () => {
    for (const f of files(src)) {
      const s = readFileSync(f, "utf8");
      if (/from\s+["']html-to-image["']/.test(s)) expect(f).toMatch(/feedback[/\\]capture\.ts$/);
      if (/^\s*import[^(]*["'][^"']*(feedback\/capture|FeedbackDialog\.svelte)["']/m.test(s))
        expect(f, "static import of the lazy feedback code").toMatch(/FeedbackDialog\.svelte$/);
    }
    const app = readFileSync(join(src, "App.svelte"), "utf8");
    expect(app).toContain('import("./components/FeedbackDialog.svelte")');
    expect(app).toContain('import("./lib/feedback/capture")');
  });
});
