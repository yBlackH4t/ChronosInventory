import { useEffect, useRef } from "react";
import { Modal, Image, ActionIcon } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconX } from "@tabler/icons-react";
import type { ProductImageItem } from "../../lib/api";
import { useMotionLevel } from "../../lib/motionContext";

const ZOOM_MS = 320;
const ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Transform que leva a foto grande (to) até o lugar da miniatura (from). */
function zoomFrom(from: DOMRect, to: DOMRect): string {
  const scale = Math.min(from.width / to.width, from.height / to.height);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

type ImageGalleryModalProps = {
  opened: boolean;
  onClose: () => void;
  images: ProductImageItem[];
  initialSlide?: number;
  /** Onde estava a miniatura clicada: a foto cresce dali e volta para lá ao fechar. */
  originRect?: DOMRect | null;
};

export function ImageGalleryModal({
  opened,
  onClose,
  images,
  initialSlide = 0,
  originRect = null,
}: ImageGalleryModalProps) {
  const level = useMotionLevel();
  const zoomRef = useRef<HTMLDivElement>(null);
  const canZoom = level === "completo" && originRect !== null && typeof Element.prototype.animate === "function";

  const activeImage = () =>
    zoomRef.current?.querySelector<HTMLElement>(`[data-slide="${initialSlide}"] img`) ?? null;

  useEffect(() => {
    if (!opened || !canZoom || !originRect) return;
    const frame = requestAnimationFrame(() => {
      const img = activeImage();
      if (!img) return;
      img.animate([{ transform: zoomFrom(originRect, img.getBoundingClientRect()), opacity: 0.6 }, { transform: "none", opacity: 1 }], {
        duration: ZOOM_MS,
        easing: ZOOM_EASE,
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [opened]);

  const close = () => {
    const img = canZoom ? activeImage() : null;
    if (!img || !originRect) return onClose();
    const anim = img.animate([{ transform: "none" }, { transform: zoomFrom(originRect, img.getBoundingClientRect()), opacity: 0.4 }], {
      duration: ZOOM_MS * 0.8,
      easing: ZOOM_EASE,
      fill: "forwards",
    });
    anim.onfinish = () => onClose();
  };

  if (!images || images.length === 0) return null;

  return (
    <Modal
      opened={opened}
      onClose={close}
      fullScreen
      withCloseButton={false}
      transitionProps={{ transition: "fade", duration: 200 }}
      styles={{
        content: {
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          backdropFilter: "blur(10px)",
        },
      }}
    >
      <ActionIcon
        size="xl"
        radius="xl"
        variant="subtle"
        color="gray"
        onClick={close}
        aria-label="Fechar galeria"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 1000,
          color: "rgba(255, 255, 255, 0.7)",
        }}
      >
        <IconX size={32} />
      </ActionIcon>

      <div ref={zoomRef}>
      <Carousel
        withIndicators
        initialSlide={initialSlide}
        height="100vh"
        classNames={{ indicator: "gallery-indicator", control: "gallery-control" }}
      >
        {images.map((img, index) => (
          <Carousel.Slide key={img.id} data-slide={index} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Image
              src={`data:${img.mime_type};base64,${img.image_base64}`}
              alt={`Imagem ${img.id}`}
              fit="contain"
              style={{ maxHeight: "90vh", maxWidth: "90vw" }}
            />
          </Carousel.Slide>
        ))}
      </Carousel>
      </div>
    </Modal>
  );
}
