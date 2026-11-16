import { assert } from "./harness.js";

async function loadAssets() {
  const r = await fetch(new URL("./fixtures/assets.json", import.meta.url), { cache: "no-store" });
  return r.json();
}
const root = (p) => new URL("../" + p, import.meta.url);

export default [
  {
    name: "precache-manifest: versi dan senarai sepadan assets.json",
    fn: async () => {
      const fx = await loadAssets();
      const src = await (await fetch(root("precache-manifest.js"), { cache: "no-store" })).text();
      const sandbox = {};
      new Function("self", src)(sandbox);
      assert(sandbox.CACHE_VERSION === fx.version, "versi tidak sepadan");
      assert(JSON.stringify(sandbox.PRECACHE) === JSON.stringify(fx.assets), "senarai tidak sepadan");
    },
  },
  {
    name: "precache: tiada tests/tools/docs; ada index.html, manifest, ikon",
    fn: async () => {
      const { assets } = await loadAssets();
      for (const a of assets) assert(!/^(tests|tools|docs)\//.test(a), "tidak patut dalam pra-cache: " + a);
      for (const need of ["./", "index.html", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon-180.png"]) {
        assert(assets.includes(need), "tiada: " + need);
      }
    },
  },
  {
    name: "precache: setiap aset boleh dicapai (HTTP 200)",
    fn: async () => {
      const { assets } = await loadAssets();
      for (const a of assets) {
        const r = await fetch(root(a === "./" ? "index.html" : a), { cache: "no-store" });
        assert(r.ok, "gagal " + a + " -> " + r.status);
      }
    },
  },
  {
    name: "manifest.json: medan PWA wajib",
    fn: async () => {
      const m = await (await fetch(root("manifest.json"))).json();
      assert(m.display === "standalone" && m.start_url === "./" && m.scope === "./", "display/start_url/scope");
      assert(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"), "ikon");
    },
  },
];
