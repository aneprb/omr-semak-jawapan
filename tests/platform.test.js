import { assert, assertEqual, assertClose } from "./harness.js";
import {
  detectIOS, detectIOSSafari, detectStandalone, canvasScale, shouldShowInstallBanner, IOS_CANVAS_MAX_PIXELS,
} from "../js/util/platform.js";
import { formatBytes } from "../js/data/persist.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

export default [
  {
    name: "detectIOS: iPhone, iPadOS (UA Mac + sentuh), bukan Windows/Mac sebenar",
    fn() {
      assert(detectIOS({ ua: IPHONE }));
      assert(detectIOS({ ua: IPAD_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 5 }));
      assert(!detectIOS({ ua: IPAD_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 0 }));
      assert(!detectIOS({ ua: WIN_CHROME, platform: "Win32" }));
      assert(!detectIOS({}));
    },
  },
  {
    name: "detectIOSSafari: Safari ya, Chrome iOS dan Windows tidak",
    fn() {
      assert(detectIOSSafari({ ua: IPHONE }));
      assert(!detectIOSSafari({ ua: IPHONE_CHROME }));
      assert(!detectIOSSafari({ ua: WIN_CHROME }));
    },
  },
  {
    name: "detectStandalone: navigator.standalone atau display-mode",
    fn() {
      assert(detectStandalone({ navStandalone: true }));
      assert(detectStandalone({ matchMedia: (q) => ({ matches: q.includes("standalone") }) }));
      assert(!detectStandalone({ matchMedia: () => ({ matches: false }) }));
      assert(!detectStandalone({ matchMedia: () => { throw new Error("x"); } }));
      assert(!detectStandalone({}));
    },
  },
  {
    name: "shouldShowInstallBanner: hanya iOS Safari, bukan standalone, belum ditutup",
    fn() {
      assert(shouldShowInstallBanner({ iosSafari: true, standalone: false, dismissed: false }));
      assert(!shouldShowInstallBanner({ iosSafari: true, standalone: true, dismissed: false }));
      assert(!shouldShowInstallBanner({ iosSafari: true, standalone: false, dismissed: true }));
      assert(!shouldShowInstallBanner({ iosSafari: false, standalone: false, dismissed: false }));
    },
  },
  {
    name: "canvasScale: had sisi, had piksel iOS, tidak membesarkan",
    fn() {
      assertEqual(canvasScale(800, 600, 1600), 1);
      assertClose(canvasScale(4032, 3024, 1600), 1600 / 4032, 1e-9);
      // 12 MP foto iPhone 4032x3024 -> sisi 1600 -> 2.4 MP, jauh di bawah had
      const s = canvasScale(8000, 8000, 99999); // 64 MP, tiada had sisi berkesan
      assert(8000 * 8000 * s * s <= IOS_CANVAS_MAX_PIXELS + 1, "melebihi had piksel");
      assert(s < 1);
      assertEqual(canvasScale(0, 10, 100), 1);
    },
  },
  {
    name: "formatBytes",
    fn() {
      assertEqual(formatBytes(512), "512 B");
      assertEqual(formatBytes(2048), "2.0 KB");
      assertEqual(formatBytes(5 * 1024 * 1024), "5.0 MB");
      assertEqual(formatBytes(null), "-");
    },
  },
];
