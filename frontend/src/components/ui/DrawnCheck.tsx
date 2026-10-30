// ✓ que se desenha (traço que corre), para botões de salvar e confirmações (2.7.25).
export default function DrawnCheck({ size = 16 }: { size?: number }) {
  return (
    <svg className="vv-drawn-check" width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
