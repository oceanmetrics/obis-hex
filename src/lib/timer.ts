// timeouts that measure the network, not a busy page. A startup request's timer can fire after a long
// task (MapLibre and deck.gl building the map: seconds on a slow device or with software WebGL) although
// the response arrived long before and only waits in the task queue; aborting then reads a fast reply as
// a timeout. Headless Chromium did exactly that (0.11.1): latest.json answered in 0.36 s, the page was
// busy for 17 s, the 3 s timer won, and the app fell back to the constant release and saw the h3t
// health probe as down. So a timer that fires late re-arms for a moment, letting queued responses run
// first, and only a timer that fires on time gives up.

/** a timer firing more than this late (ms) means the page was busy rather than the network slow */
export const LATE_MS = 200;

/** Call `onTimeout` once `ms` have passed and the page was free to handle a response; a timer that fires
 * more than {@link LATE_MS} late re-arms for {@link LATE_MS} instead. Returns the cancel function. */
export function patientTimeout(ms: number, onTimeout: () => void, now: () => number = () => performance.now()): () => void {
  let id: ReturnType<typeof setTimeout> | undefined;
  const arm = (wait: number) => {
    const due = now() + wait;
    id = setTimeout(() => {
      if (now() - due > LATE_MS) arm(LATE_MS);
      else onTimeout();
    }, wait);
  };
  arm(ms);
  return () => clearTimeout(id);
}
