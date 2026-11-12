import type { ImageCollectionLabels, ImageList } from '@/hooks/useImageCollection';
import { productImageSrc } from '@/utils/catalog';
import { formatSize } from '@/utils/files';
import { formatUpdatedAt } from '@/utils/dateTime';

const ACTION_CLASS = 'rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition';

type GalleryImage = ImageList['images'][number];

interface ImageCardProps {
  image: GalleryImage;
  index: number;
  isLast: boolean;
  labels: ImageCollectionLabels;
  saving: boolean;
  confirmingRemoval: boolean;
  onMove: (index: number, offset: -1 | 1) => void;
  onReplace: (id: number) => void;
  onAskRemoval: (id: number | null) => void;
  onRemove: (id: number) => void;
}

function ImageCard({
  image,
  index,
  isLast,
  labels,
  saving,
  confirmingRemoval,
  onMove,
  onReplace,
  onAskRemoval,
  onRemove,
}: ImageCardProps) {
  const position = index + 1;
  return (
    <li className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="rounded-lg bg-gray-50 min-h-40 flex items-center justify-center overflow-hidden">
        <img src={productImageSrc(image.image_url)} alt={labels.imageAlt(position)} className="max-h-64 w-full object-contain" />
      </div>
      <p className="text-xs text-gray-500">
        <span className="font-bold text-gray-700">Imagen {position}</span> · {formatSize(image.size_bytes)} · actualizada el{' '}
        {formatUpdatedAt(image.updated_at)}
      </p>

      {confirmingRemoval ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-700">¿Quitar esta imagen?</span>
          <button
            type="button"
            onClick={() => onRemove(image.id)}
            disabled={saving}
            className="font-semibold rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1.5 transition"
          >
            Sí, quitar
          </button>
          <button
            type="button"
            onClick={() => onAskRemoval(null)}
            className="font-semibold rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={saving || index === 0}
            aria-label={`Subir la imagen ${position}`}
            className={ACTION_CLASS}
          >
            ↑ Subir
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={saving || isLast}
            aria-label={`Bajar la imagen ${position}`}
            className={ACTION_CLASS}
          >
            ↓ Bajar
          </button>
          <button
            type="button"
            onClick={() => onReplace(image.id)}
            disabled={saving}
            aria-label={`Reemplazar la imagen ${position}`}
            className={ACTION_CLASS}
          >
            Reemplazar
          </button>
          <button
            type="button"
            onClick={() => onAskRemoval(image.id)}
            disabled={saving}
            aria-label={`Quitar la imagen ${position}`}
            className="rounded-lg px-2.5 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30 transition"
          >
            Quitar
          </button>
        </div>
      )}
    </li>
  );
}

interface ImageGalleryProps {
  images: GalleryImage[];
  maxImages: number;
  labels: ImageCollectionLabels;
  saving: boolean;
  confirmingRemovalOf: number | null;
  onMove: (index: number, offset: -1 | 1) => void;
  onReplace: (id: number) => void;
  onAskRemoval: (id: number | null) => void;
  onRemove: (id: number) => void;
}

/** Las imágenes cargadas de una colección, con sus acciones: subir, bajar, reemplazar y quitar. */
export function ImageGallery({ images, maxImages, labels, ...actions }: ImageGalleryProps) {
  return (
    <>
      <h2 className="text-sm font-bold text-gray-900">
        {labels.imagesTitle} ({images.length} de {maxImages})
      </h2>
      {images.length === 0 ? (
        <p className="text-sm text-gray-400 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center">
          {labels.noImages}
        </p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2">
          {images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              isLast={index === images.length - 1}
              labels={labels}
              saving={actions.saving}
              confirmingRemoval={actions.confirmingRemovalOf === image.id}
              onMove={actions.onMove}
              onReplace={actions.onReplace}
              onAskRemoval={actions.onAskRemoval}
              onRemove={actions.onRemove}
            />
          ))}
        </ol>
      )}
    </>
  );
}
