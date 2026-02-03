/**
 * useImageAttachments hook — manages image attachments with compression.
 * Extracts image handling logic from ComposeBar for reusability.
 */

import { useState, useCallback } from "react";
import { notifications } from "../lib/notifications";

export interface ImageAttachment {
  id: string;
  dataUrl: string;
  size: number;
  width: number;
  height: number;
}

interface CompressedImage {
  dataUrl: string;
  size: number;
  width: number;
  height: number;
}

// Max dimensions and file size for compression
const MAX_DIMENSION = 1568;
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

/**
 * Compress an image file to fit within size constraints.
 * Uses quality stepping (0.9 → 0.4) until under 4MB.
 */
async function compressImage(file: File | Blob): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      // Calculate resize dimensions (max 1568px on longest side)
      let width = img.width;
      let height = img.height;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Try quality steps until under max size
      const tryQuality = (qualityIndex: number) => {
        if (qualityIndex >= QUALITY_STEPS.length) {
          reject(new Error("Could not compress image to under 4MB"));
          return;
        }

        const quality = QUALITY_STEPS[qualityIndex];
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }

            if (blob.size <= MAX_SIZE_BYTES) {
              // Success! Convert to data URL
              const blobReader = new FileReader();
              blobReader.onload = (e) => {
                resolve({
                  dataUrl: e.target?.result as string,
                  size: blob.size,
                  width,
                  height,
                });
              };
              blobReader.readAsDataURL(blob);
            } else {
              // Try next quality
              tryQuality(qualityIndex + 1);
            }
          },
          "image/jpeg",
          quality,
        );
      };

      tryQuality(0);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    reader.readAsDataURL(file);
  });
}

function generateId(): string {
  return Math.random().toString(36).substring(7);
}

export function useImageAttachments() {
  const [images, setImages] = useState<ImageAttachment[]>([]);

  const addImage = useCallback(async (file: File | Blob) => {
    try {
      const compressed = await compressImage(file);
      const newImage: ImageAttachment = {
        id: generateId(),
        ...compressed,
      };
      setImages((prev) => [...prev, newImage]);
      return newImage;
    } catch (err) {
      console.error("[useImageAttachments] compression failed:", err);
      notifications.error(
        "Image compression failed",
        err instanceof Error ? err.message : undefined,
        err instanceof Error ? { message: err.message, stack: err.stack } : undefined,
      );
      return null;
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  return {
    images,
    addImage,
    removeImage,
    clearImages,
  };
}
