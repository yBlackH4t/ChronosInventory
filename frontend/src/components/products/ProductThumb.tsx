import { IconPhoto } from "@tabler/icons-react";

// Foto pequena do produto; sem foto, um ícone discreto no mesmo espaço.
export default function ProductThumb({
  base64,
  size = 38,
  alt,
}: {
  base64?: string | null;
  size?: number;
  alt: string;
}) {
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
