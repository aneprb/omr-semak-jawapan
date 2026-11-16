// SPEC 3.2: tangkap auto selepas 3 bingkai stabil (anjakan sudut < 2% lebar bingkai).
import { assert, assertEqual } from "./harness.js";
import { createAutoCapture } from "../js/ui/camera.js";

function fakeVideo() {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 320, 240);
  Object.defineProperty(c, "videoWidth", { value: 320 });
  Object.defineProperty(c, "videoHeight", { value: 240 });
  return c;
}
const sq = (dx = 0, dy = 0) => [{ x: 50 + dx, y: 40 + dy }, { x: 250 + dx, y: 40 + dy }, { x: 250 + dx, y: 200 + dy }, { x: 50 + dx, y: 200 + dy }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = (dx = 0, dy = 0) => ({ found: true, corners: sq(dx, dy), error: null });
const none = { found: false, corners: null, error: "NO_MARKERS" };

async function run(sequence) {
  const statuses = [];
  let captures = 0;
  let calls = 0;
  let cap = null;
  const auto = createAutoCapture({
    intervalMs: 15,
    detect: async () => {
      const r = sequence[Math.min(calls, sequence.length - 1)];
      calls++;
      return r;
    },
    onStatus: (s) => statuses.push(s),
    onCapture: (img) => {
      captures++;
      cap = img;
    },
  });
  auto.start(fakeVideo());
  await sleep(500);
  auto.stop();
  return { statuses, captures, calls, cap };
}

export default [
  {
    name: "3 bingkai stabil berturut-turut -> captured, onCapture sekali dengan ImageData",
    async fn() {
      const r = await run([found(), found(), found(), found()]);
      assertEqual(r.captures, 1);
      assert(r.statuses.includes("captured"), r.statuses.join());
      assertEqual(r.statuses[0], "searching");
      assertEqual(r.cap.width, 320);
      assertEqual(r.calls, 3, "berhenti selepas tangkapan");
    },
  },
  {
    name: "2 bingkai stabil sahaja (kemudian hilang) -> tiada tangkapan",
    async fn() {
      const r = await run([found(), found(), none]);
      assertEqual(r.captures, 0);
      assert(!r.statuses.includes("captured"));
    },
  },
  {
    name: "anjakan sudut 0.6% dibenarkan; anjakan 12% menetapkan semula kiraan",
    async fn() {
      const ok = await run([found(0), found(2), found(4)]);
      assertEqual(ok.captures, 1, "anjakan kecil patut tangkap");
      const bad = await run([found(0), found(40), found(0), found(40), found(0), found(40), none]);
      assertEqual(bad.captures, 0, "anjakan besar tidak patut tangkap");
    },
  },
  {
    name: "BAD_GEOMETRY -> partial; tiada penanda -> searching",
    async fn() {
      const r = await run([{ found: false, corners: null, error: "BAD_GEOMETRY" }, none, none]);
      assert(r.statuses.includes("partial"), r.statuses.join());
      assertEqual(r.statuses[r.statuses.length - 1], "searching");
      assertEqual(r.captures, 0);
    },
  },
  {
    name: "ralat dalam detect tidak mematikan gelung",
    async fn() {
      let n = 0;
      let captured = 0;
      const auto = createAutoCapture({
        intervalMs: 15,
        detect: async () => {
          if (n++ === 0) throw new Error("x");
          return found();
        },
        onCapture: () => {
          captured++;
        },
      });
      auto.start(fakeVideo());
      await sleep(500);
      auto.stop();
      assertEqual(captured, 1);
    },
  },
];
