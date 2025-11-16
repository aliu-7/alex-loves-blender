const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const densitySlider = document.getElementById("density");
const sizeSlider = document.getElementById("size");
const downloadBtn = document.getElementById("downloadBtn");

let sourceImage = null;

fileInput.addEventListener("change", handleFile);
densitySlider.addEventListener("input", () => sourceImage && paintify());
sizeSlider.addEventListener("input", () => sourceImage && paintify());
downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "painterly.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    sourceImage = img;
    paintify();
  };
  img.onerror = () => alert("Could not load image.");
  img.src = URL.createObjectURL(file);
}

// --- small helpers ----------------------------------------------------------

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function varyBrightness(r, g, b, amount) {
  // amount in [-0.4, 0.4] roughly
  let [h, s, l] = rgbToHsl(r, g, b);
  l = clamp01(l + amount);
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return { r: nr, g: ng, b: nb };
}

// ---------------------------------------------------------------------------

function paintify() {
  const img = sourceImage;
  if (!img) return;

  // --- 1. Canvas sizing ---
  const maxSide = 768; // performance cap
  let { width, height } = img;
  const ratio = Math.min(maxSide / width, maxSide / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Offscreen canvas for preprocessing
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");
  off.width = width;
  off.height = height;

  // --- 2. Posterize the image to keep big color blocks ---
  offCtx.drawImage(img, 0, 0, width, height);
  let imgData = offCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const levels = 6; // fewer = bigger color regions
  const step = 255 / (levels - 1);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      const newV = Math.round(v / step) * step;
      data[i + c] = newV;
    }
  }
  offCtx.putImageData(imgData, 0, 0);

  // --- 3. Black background (matches your stone / normal-map idea) ---
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // --- 4. Textured brush strokes -------------------------------------
  const density = parseFloat(densitySlider.value);
  const baseSize = parseFloat(sizeSlider.value);

  // heavier factor gives thicker coverage; tweak if needed
  const strokes = Math.floor(width * height * 0.16 * density);

  for (let i = 0; i < strokes; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;

    // Sample base color from posterized image
    const sx = Math.max(0, Math.min(width - 1, x | 0));
    const sy = Math.max(0, Math.min(height - 1, y | 0));
    const idx = (sy * width + sx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Stroke parameters
    const size = baseSize * (0.8 + Math.random() * 0.7);
    const length = size * (3.0 + Math.random() * 2.5); // longer, brush-like
    const angle = Math.random() * Math.PI * 2;

    // Number of "bristles" / sub-strokes within this stroke
    const bristles = 5 + (Math.random() * 4) | 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    for (let j = 0; j < bristles; j++) {
      // Slight offset perpendicular to the stroke to simulate brush width
      const offset = (j - bristles / 2) * (size / bristles);

      // Little variation in brightness for inner vs outer bristles
      const brightnessJitter = (Math.random() - 0.5) * 0.25; // -0.125..0.125
      const { r: rr, g: gg, b: bb } = varyBrightness(r, g, b, brightnessJitter);

      ctx.globalAlpha = 0.6 + Math.random() * 0.35;

      // Using a roundedRect-ish dab makes edges softer / more organic
      const localLength =
        length * (0.85 + Math.random() * 0.3); // small jitter in length
      const thickness =
        size * (0.35 + Math.random() * 0.25); // thinner than blobs

      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;

      // draw the bristle rect slightly jittered along the stroke
      const jitterAlong = (Math.random() - 0.5) * (length * 0.15);
      ctx.fillRect(
        -localLength / 2 + jitterAlong,
        offset - thickness / 2,
        localLength,
        thickness
      );
    }

    ctx.restore();
  }

  downloadBtn.disabled = false;
}
