// Confete curto (menos de 2 s) para quando algo grande termina: inventário fechado, NF
// lançada inteira (2.7.25). Só no nível "Completo"; nos outros não faz nada.

const DURATION_MS = 1800;

export function fireConfetti(level: string): void {
  if (level !== "completo" || typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.className = "vv-confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);
  const css = getComputedStyle(document.documentElement);
  const colors = ["--accent", "--accent-2", "--success", "--warning"].map(
    (name) => css.getPropertyValue(name).trim() || "#38bdf8",
  );
  const pieces = Array.from({ length: 110 }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 120,
    y: height * 0.45,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 11 - 4,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
    size: 5 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.32;
      p.vx *= 0.99;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -2, p.size, 4);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) window.requestAnimationFrame(frame);
    else canvas.remove();
  };
  window.requestAnimationFrame(frame);
}
