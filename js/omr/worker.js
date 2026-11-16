// Module Web Worker. Protocol: docs/PLAN.md section 4.3.
import { scanImage, detectMarkers } from "./scan.js";

function toImage(m) {
  return { width: m.width, height: m.height, data: new Uint8ClampedArray(m.buffer) };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "scan") {
      const result = scanImage(toImage(msg.image), msg.layout, msg.opts);
      self.postMessage({ type: "scanResult", id: msg.id, result });
    } else if (msg.type === "detect") {
      const result = detectMarkers(toImage(msg.image), msg.opts);
      self.postMessage({ type: "detectResult", id: msg.id, result });
    }
  } catch (e) {
    self.postMessage({ type: "error", id: msg.id, message: String((e && e.message) || e) });
  }
};
