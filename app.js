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

// ------------------- color utilities -------------------

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
  let [h, s, l] = rgbToHsl(r, g, b);
  l = clamp01(l + amount);
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return { r: nr, g: ng, b: nb };
}

// ------------------- main painter -------------------

function paintify() {
  const img = sourceImage;
  if (!img) return;

  // 1. Canvas sizing
  const maxSide = 768;
  let { width, height } = img;
  const ratio = Math.min(maxSide / width, maxSide / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Offscreen canvas to preprocess image
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");
  off.width = width;
  off.height = height;

  offCtx.drawImage(img, 0, 0, width, height);
  let imgData = offCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 2. Posterize (keep blocky color regions)
  const levels = 6;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      const newV = Math.round(v / step) * step;
      data[i + c] = newV;
    }
  }
  offCtx.putImageData(imgData, 0, 0);

  // 3. Black background
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // 4. Painterly strokes
  const density = parseFloat(densitySlider.value);
  const baseSize = parseFloat(sizeSlider.value);

  // Slightly lower than before, strokes are more detailed now
  const strokes = Math.floor(width * height * 0.12 * density);

  for (let i = 0; i < strokes; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;

    // Sample base color from posterized image
    const sx = Math.max(0, Math.min(width - 1, x | 0));
    const sy = Math.max(0, Math.min(height - 1, y | 0));
    const idx = (sy * width + sx) * 4;
    const baseR = data[idx];
    const baseG = data[idx + 1];
    const baseB = data[idx + 2];

    // Stroke params
    const size = baseSize * (0.9 + Math.random() * 0.8);
    const length = size * (2.6 + Math.random() * 1.8);
    const thickness = size * (0.7 + Math.random() * 0.5);
    const angle = Math.random() * Math.PI * 2;

    // Number of "dabs" inside the stroke
    const dabs = 6 + (Math.random() * 5) | 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    for (let d = 0; d < dabs; d++) {
      const t = dabs === 1 ? 0.5 : d / (dabs - 1);
      // position along the stroke, slightly jittered
      const along = (t - 0.5) * length + (Math.random() - 0.5) * (length * 0.1);
      const across =
        (Math.random() - 0.5) * thickness * 0.4; // small perpendicular jitter

      // slight brightness variation per dab
      const brightnessJitter = (Math.random() - 0.5) * 0.25;
      const { r, g, b } = varyBrightness(
        baseR,
        baseG,
        baseB,
        brightnessJitter
      );

      // softer edges: use ellipses with lower alpha
      const rx = (thickness / 2) * (0.7 + Math.random() * 0.4);
      const ry = rx * (0.5 + Math.random() * 0.5);

      ctx.globalAlpha = 0.35 + Math.random() * 0.35;
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.beginPath();
      ctx.ellipse(along, across, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  downloadBtn.disabled = false;
}
