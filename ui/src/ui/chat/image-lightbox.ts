let activeOverlay: HTMLDivElement | null = null;
let activeKeyListener: ((event: KeyboardEvent) => void) | null = null;

export function closeImageLightbox(): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (activeKeyListener) {
    document.removeEventListener("keydown", activeKeyListener);
    activeKeyListener = null;
  }
}

export function openImageLightbox(imageUrl: string, alt = "Image preview"): void {
  openMediaLightbox({ kind: "image", src: imageUrl, alt });
}

export function openMediaLightbox(params: {
  kind: "image" | "video";
  src: string;
  alt?: string;
}): void {
  closeImageLightbox();

  const overlay = document.createElement("div");
  overlay.className = "chat-image-lightbox";

  const content = document.createElement("div");
  content.className = "chat-image-lightbox__content";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "chat-image-lightbox__close";
  closeButton.setAttribute("aria-label", "Close image preview");
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => closeImageLightbox());

  if (params.kind === "video") {
    const video = document.createElement("video");
    video.className = "chat-image-lightbox__video";
    video.src = params.src;
    video.controls = true;
    video.autoplay = true;
    video.preload = "metadata";
    content.append(video, closeButton);
  } else {
    const image = document.createElement("img");
    image.className = "chat-image-lightbox__image";
    image.src = params.src;
    image.alt = params.alt ?? "Image preview";
    content.append(image, closeButton);
  }
  overlay.append(content);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeImageLightbox();
    }
  });

  activeKeyListener = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeImageLightbox();
    }
  };
  document.addEventListener("keydown", activeKeyListener);

  document.body.append(overlay);
  activeOverlay = overlay;
}
