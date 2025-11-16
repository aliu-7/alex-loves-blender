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

function paintify() {
  const img = sourceImage;
  if (!img) return;

  // --- 1. Canvas sizing ---
  const maxSide = 768; // performance cap; good for texture work
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

  // --- 2. Posterize the image to preserve chunky color blocks ---
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

  // --- 3. Black background (plays nice with stone / dark materials) ---
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // --- 4. Randomized brush strokes ---
  const density = parseFloat(densitySlider.value);
  const baseSize = parseFloat(sizeSlider.value);

  // You can tune this factor depending on how heavy you want the brushwork
  const strokes = Math.floor(width * height * 0.25 * density);

  for (let i = 0; i < strokes; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;

    // Sample posterized color
    const sx = Math.max(0, Math.min(width - 1, x | 0));
    const sy = Math.max(0, Math.min(height - 1, y | 0));
    const idx = (sy * width + sx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Stroke parameters
    const size = baseSize * (0.6 + Math.random() * 0.8);
    const length = size * (1.6 + Math.random() * 1.4);
    const angle = Math.random() * Math.PI * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.globalAlpha = 0.85 + Math.random() * 0.15;
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    // Rectangular "brush" dab
    ctx.fillRect(-length / 2, -size / 2, length, size);

    ctx.restore();
  }

  downloadBtn.disabled = false;
}
