import { IconPhoto } from "@tabler/icons-react";

// Foto pequena do produto. Sem foto: a sigla da marca/tipo (monogram) na cor da marca, ou um
// ícone discreto no mesmo espaço (ou nada, com hideEmpty).
export default function ProductThumb({
  base64,
  size = 38,
  alt,
  monogram,
  color,
  hideEmpty = false,
}: {
  base64?: string | null;
  size?: number;
  alt: string;
  monogram?: string;
  /** Cor do Mantine (blue, pink...) para o fundo da sigla. */
  color?: string;
  /** Sem foto e sem sigla, deixa o espaço vazio em vez do ícone de foto. */
  hideEmpty?: boolean;
}) {
  if (!base64 && monogram) {
    return (
      <span
        className="product-thumb product-monogram"
        data-len={monogram.length}
        style={{
          width: size,
          height: size,
          ["--mono-color" as string]: `var(--mantine-color-${color ?? "gray"}-filled)`,
        }}
        aria-hidden
      >
        {monogram}
      </span>
    );
  }
  if (!base64 && hideEmpty) return <span style={{ display: "inline-block", width: size, height: size }} aria-hidden />;
  return (
    <span className="product-thumb" style={{ width: size, height: size }}>
      {base64 ? (
        <img src={`data:image/jpeg;base64,${base64}`} alt={alt} loading="lazy" />
      ) : (
        <IconPhoto size={Math.round(size * 0.45)} stroke={1.4} aria-hidden />
      )}
    </span>
  );
}
