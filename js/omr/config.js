// OMR engine defaults. Contract: docs/PLAN.md section 4.2. Pure JS, no DOM.

export const DEFAULTS = {
  maxSide: 1600, // image is downscaled so the longest side <= 1600 px
  detectMaxSide: 800, // resolution used for marker detection
  minSide: 600, // below this -> IMAGE_TOO_SMALL
  thresholdWindowFrac: 1 / 8, // adaptive window = odd(round(min(w,h) * frac)); MUST exceed marker size
  thresholdC: 7, // ink pixel if gray < local mean - C
  markerSideFrac: [0.008, 0.08], // marker side (sqrt area) relative to min(w,h)
  markerMinFill: 0.45, // area / bbox area (tolerates +-30 deg rotation)
  markerAspect: [0.6, 1.67], // covariance eigenvalue ratio (isotropic blobs)
  markerAreaSpread: 3.0, // max area / min area among the 4 chosen markers
  minContrast: 40, // white - black gray level; below -> LOW_CONTRAST
  sampleRadiusFrac: 0.6, // sample inside a disc of 0.6 r (avoid the printed outline)
  sampleGrid: 7, // 7x7 grid inside the disc (~37 points)
  thresholds: { blank: 0.2, mark: 0.45, multiRatio: 0.75, minGap: 0.2 },
};
