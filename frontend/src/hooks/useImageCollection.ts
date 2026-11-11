import { useCallback, useEffect, useState } from 'react';
import {
  addMenuImage,
  deleteMenuImage,
  fetchMenuConfig,
  fetchMenuImages,
  reorderMenuImages,
  replaceMenuImage,
  updateMenuConfig,
} from '@/services/menuImageService';
import {
  addPromotionImage,
  deletePromotionImage,
  fetchPromotionImages,
  reorderPromotionImages,
  replacePromotionImage,
} from '@/services/promotionImageService';
import { fetchPromotionsConfig, updatePromotionsConfig } from '@/services/promotionService';
import type { MenuImages } from '@/types/menuImage';
import type { PromotionImages } from '@/types/promotion';

export type ImageList = MenuImages | PromotionImages;

/** Los textos de pantalla de una colección de imágenes (el menú o las promociones). */
export interface ImageCollectionLabels {
  linkTitle: string;
  linkPlaceholder: string;
  imagesTitle: string;
  noImages: string;
  imageAlt: (position: number) => string;
  full: (max: number) => string;
  addAction: string;
  addNote: string;
  replaceInput: string;
  addInput: string;
  linkSaved: string;
  linkRemoved: string;
  linkSaveError: string;
  added: string;
  replaced: string;
  removed: string;
}

/** Cómo se leen y se cambian las imágenes y el link de una colección: cada una tiene sus propios servicios. */
export interface ImageCollectionKind {
  id: 'menu' | 'promociones';
  labels: ImageCollectionLabels;
  /** Mensaje si no se pueden cargar las imágenes (solo el menú lo avisa; las promociones fallan en silencio). */
  loadErrorMessage?: string;
  fetchImages: () => Promise<ImageList | undefined>;
  fetchLink: () => Promise<string | null | undefined>;
  saveLink: (link: string | null) => Promise<string | null | undefined>;
  addImage: (file: File) => Promise<ImageList | undefined>;
  replaceImage: (id: number, file: File) => Promise<ImageList | undefined>;
  removeImage: (id: number) => Promise<void>;
  reorderImages: (ids: number[]) => Promise<ImageList | undefined>;
}

export const MENU_COLLECTION: ImageCollectionKind = {
  id: 'menu',
  labels: {
    linkTitle: 'del menú',
    linkPlaceholder: 'https://mi-restaurante.com/menu',
    imagesTitle: 'Imágenes del menú',
    noImages: 'Todavía no cargaste ninguna imagen del menú.',
    imageAlt: (position) => `Imagen ${position} del menú`,
    full: (max) => `El menú ya tiene el máximo de ${max} imágenes. Quitá alguna para sumar otra.`,
    addAction: 'Agregar al menú',
    addNote: 'se suma al final del menú',
    replaceInput: 'Archivo para reemplazar una imagen del menú',
    addInput: 'Archivo de imagen del menú',
    linkSaved: 'Link del menú guardado.',
    linkRemoved: 'Se eliminó el link del menú.',
    linkSaveError: 'No se pudo guardar el link del menú.',
    added: 'Se sumó la imagen al menú.',
    replaced: 'La imagen se actualizó: el bot ya envía la nueva.',
    removed: 'Se quitó la imagen del menú.',
  },
  loadErrorMessage: 'No se pudo cargar el menú en imagen.',
  fetchImages: fetchMenuImages,
  fetchLink: async () => (await fetchMenuConfig())?.menu_link,
  saveLink: async (link) => (await updateMenuConfig(link))?.menu_link,
  addImage: addMenuImage,
  replaceImage: replaceMenuImage,
  removeImage: deleteMenuImage,
  reorderImages: reorderMenuImages,
};

export const PROMOTIONS_COLLECTION: ImageCollectionKind = {
  id: 'promociones',
  labels: {
    linkTitle: 'de promociones',
    linkPlaceholder: 'https://instagram.com/promos',
    imagesTitle: 'Imágenes de promociones',
    noImages: 'Todavía no cargaste ninguna imagen de promociones.',
    imageAlt: (position) => `Imagen ${position} de promociones`,
    full: (max) => `La sección de promociones ya tiene el máximo de ${max} imágenes. Quitá alguna para sumar otra.`,
    addAction: 'Agregar a promociones',
    addNote: 'se suma al final de las promociones',
    replaceInput: 'Archivo para reemplazar una imagen de promociones',
    addInput: 'Archivo de imagen de promociones',
    linkSaved: 'Link de promociones guardado.',
    linkRemoved: 'Se eliminó el link de promociones.',
    linkSaveError: 'No se pudo guardar el link de promociones.',
    added: 'Se sumó la imagen a promociones.',
    replaced: 'La imagen de promoción se actualizó.',
    removed: 'Se quitó la imagen de promoción.',
  },
  fetchImages: fetchPromotionImages,
  fetchLink: async () => (await fetchPromotionsConfig())?.promotions_link,
  saveLink: async (link) => (await updatePromotionsConfig(link))?.promotions_link,
  addImage: addPromotionImage,
  replaceImage: replacePromotionImage,
  removeImage: deletePromotionImage,
  reorderImages: reorderPromotionImages,
};

const DEFAULT_MAX_IMAGES = 5;

/** Las imágenes y el link externo de una colección (menú o promociones) y lo que se puede hacer con ellos. */
export function useImageCollection(kind: ImageCollectionKind) {
  const [list, setList] = useState<ImageList | null>(null);
  const [link, setLink] = useState('');
  const [savedLink, setSavedLink] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(kind.fetchImages())
      .then((data) => {
        if (!cancelled && data) setList(data);
      })
      .catch(() => {
        if (!cancelled && kind.loadErrorMessage) setLoadError(kind.loadErrorMessage);
      });
    kind
      .fetchLink()
      .then((saved) => {
        if (cancelled) return;
        setLink(saved ?? '');
        setSavedLink(saved ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind]);

  /** Guarda el link (vacío = sin link) y devuelve lo que quedó guardado. */
  const saveLink = useCallback(async (): Promise<string | null> => {
    const wanted = link.trim() || null;
    const saved = (await kind.saveLink(wanted)) ?? '';
    setLink(saved);
    setSavedLink(saved);
    return wanted;
  }, [kind, link]);

  const showUpdated = (updated: ImageList | undefined) => {
    if (updated) setList(updated);
  };

  return {
    kind,
    list,
    images: list?.images ?? [],
    maxImages: list?.max_images ?? DEFAULT_MAX_IMAGES,
    loadError,
    link,
    setLink,
    hasLinkChanged: link.trim() !== savedLink.trim(),
    saveLink,
    add: async (file: File) => showUpdated(await kind.addImage(file)),
    replace: async (id: number, file: File) => showUpdated(await kind.replaceImage(id, file)),
    remove: async (id: number) => {
      await kind.removeImage(id);
      showUpdated(await kind.fetchImages());
    },
    /** Intercambia la imagen de esa posición con la vecina (-1 la sube, 1 la baja). */
    move: async (index: number, offset: -1 | 1) => {
      const ids = (list?.images ?? []).map((image) => image.id);
      [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
      showUpdated(await kind.reorderImages(ids));
    },
  };
}
