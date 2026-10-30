import { useEffect, useRef } from "react";
import { useBackdrop, useGlow } from "../../lib/appearance";
import { useMotionLevel } from "../../lib/motionContext";

const GRID = 32;

type Pulse = { horizontal: boolean; line: number; head: number; speed: number };
type Particle = { x: number; y: number; vx: number; vy: number };

// Fundo atrás de tudo (Configurações > Aparência > Fundo).
// - Manchas: as três manchas de cor de sempre (só se mexem no "Completo").
// - Malha viva: a malha do Painel em todas as telas, com riscos de luz correndo nas linhas.
// - Partículas: pontos que flutuam e se ligam quando ficam perto.
// - Liso: só a cor de fundo.
// O desenho para quando a janela está escondida; fora do "Completo" fica parado.
export default function LiveBackdrop() {
  const [backdrop] = useBackdrop();
  const [glow] = useGlow();
  const level = useMotionLevel();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const usesCanvas = backdrop === "malha" || backdrop === "particulas";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !usesCanvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const moving = level === "completo";
    let width = 0;
    let height = 0;
    let frame = 0;
    let raf = 0;
    let accent = "#38bdf8";
    let pulses: Pulse[] = [];
    let particles: Particle[] = [];

    const readColors = () => {
      accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || accent;
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.round((width * height) / 24000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
      draw();
    };

    const drawPulses = () => {
      if (pulses.length < 8 && Math.random() < 0.035) {
        const horizontal = Math.random() < 0.5;
        const span = horizontal ? height : width;
        pulses.push({
          horizontal,
          line: Math.floor((Math.random() * span) / GRID) * GRID + 0.5,
          head: -140,
          speed: 1.2 + Math.random() * 1.6,
        });
      }
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.3 + glow / 250;
      pulses = pulses.filter((pulse) => {
        pulse.head += pulse.speed;
        const tail = pulse.head - 140;
        const gradient = pulse.horizontal
          ? ctx.createLinearGradient(tail, 0, pulse.head, 0)
          : ctx.createLinearGradient(0, tail, 0, pulse.head);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(1, accent);
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        if (pulse.horizontal) {
          ctx.moveTo(tail, pulse.line);
          ctx.lineTo(pulse.head, pulse.line);
        } else {
          ctx.moveTo(pulse.line, tail);
          ctx.lineTo(pulse.line, pulse.head);
        }
        ctx.stroke();
        return tail < (pulse.horizontal ? width : height);
      });
      ctx.globalAlpha = 1;
    };

    const drawParticles = () => {
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent;
      for (const p of particles) {
        if (moving) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        }
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance > 120) continue;
          ctx.globalAlpha = (1 - distance / 120) * (0.1 + glow / 600);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    function draw() {
      if (frame % 60 === 0) readColors();
      frame += 1;
      ctx!.clearRect(0, 0, width, height);
      if (backdrop === "malha") {
        if (moving) drawPulses();
      } else {
        drawParticles();
      }
    }

    const loop = () => {
      if (!document.hidden) draw();
      raf = window.requestAnimationFrame(loop);
    };

    readColors();
    resize();
    window.addEventListener("resize", resize);
    if (moving) raf = window.requestAnimationFrame(loop);
    // Trocar paleta ou claro/escuro: redesenha com a cor nova mesmo parado.
    const observer = new MutationObserver(() => {
      readColors();
      if (!moving) draw();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-mantine-color-scheme"] });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, [backdrop, level, glow, usesCanvas]);

  return (
    <div className="app-backdrop" data-kind={backdrop} aria-hidden="true">
      {backdrop === "manchas" ? (
        <>
          <span className="app-blob" data-blob="1" />
          <span className="app-blob" data-blob="2" />
          <span className="app-blob" data-blob="3" />
        </>
      ) : null}
      {usesCanvas ? <canvas ref={canvasRef} className="vv-backdrop-canvas" /> : null}
    </div>
  );
}
