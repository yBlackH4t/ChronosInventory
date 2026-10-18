import { Modal, Image, ActionIcon } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconX } from "@tabler/icons-react";
import type { ProductImageItem } from "../../lib/api";

type ImageGalleryModalProps = {
  opened: boolean;
  onClose: () => void;
  images: ProductImageItem[];
  initialSlide?: number;
};

export function ImageGalleryModal({
  opened,
  onClose,
  images,
  initialSlide = 0,
}: ImageGalleryModalProps) {
  if (!images || images.length === 0) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
        onClick={onClose}
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

      <Carousel
        withIndicators
        initialSlide={initialSlide}
        height="100vh"
        classNames={{ indicator: "gallery-indicator", control: "gallery-control" }}
      >
        {images.map((img) => (
          <Carousel.Slide key={img.id} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Image
              src={`data:${img.mime_type};base64,${img.image_base64}`}
              alt={`Imagem ${img.id}`}
              fit="contain"
              style={{ maxHeight: "90vh", maxWidth: "90vw" }}
            />
          </Carousel.Slide>
        ))}
      </Carousel>
    </Modal>
  );
}
