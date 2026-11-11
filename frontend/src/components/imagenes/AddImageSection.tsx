import type { RefObject } from 'react';
import type { ImageCollectionLabels } from '@/hooks/useImageCollection';
import { ACCEPTED_IMAGE_TYPES } from '@/utils/catalog';
import { formatSize } from '@/utils/files';

interface AddImageSectionProps {
  labels: ImageCollectionLabels;
  maxImages: number;
  isFull: boolean;
  selectedFile: File | null;
  previewUrl: string | null;
  saving: boolean;
  formError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (file: File | undefined) => void;
  onPublish: () => void;
  onDiscard: () => void;
}

function SelectedFilePreview({
  labels,
  file,
  previewUrl,
  saving,
  onPublish,
  onDiscard,
}: Pick<AddImageSectionProps, 'labels' | 'saving' | 'onPublish' | 'onDiscard'> & { file: File; previewUrl: string }) {
  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-gray-50 min-h-48 flex items-center justify-center overflow-hidden">
        <img src={previewUrl} alt="Vista previa de la imagen nueva" className="max-h-96 w-full object-contain" />
      </div>
      <p className="text-xs text-gray-500 break-all">
        {file.name} · {formatSize(file.size)} · {labels.addNote}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="font-bold text-sm rounded-xl bg-black hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-2 transition"
        >
          {saving ? 'Guardando...' : labels.addAction}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="font-semibold text-sm rounded-xl px-4 py-2 text-gray-600 hover:bg-gray-100 transition"
        >
          Descartar
        </button>
      </div>
    </>
  );
}

/** Para sumar una imagen: elegir el archivo, ver cómo queda y confirmarlo (o avisar que ya no entran más). */
export function AddImageSection(props: AddImageSectionProps) {
  const { labels, maxImages, isFull, selectedFile, previewUrl, fileInputRef } = props;
  const hasSelection = Boolean(selectedFile && previewUrl);
  return (
    <section aria-label="Agregar una imagen" className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3">
      <h2 className="text-sm font-bold text-gray-900">Agregar imagen</h2>

      {isFull && <p className="text-xs text-gray-500">{labels.full(maxImages)}</p>}
      {!isFull && hasSelection && selectedFile && previewUrl && (
        <SelectedFilePreview
          labels={labels}
          file={selectedFile}
          previewUrl={previewUrl}
          saving={props.saving}
          onPublish={props.onPublish}
          onDiscard={props.onDiscard}
        />
      )}
      {!isFull && !hasSelection && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-4 py-10 text-sm font-semibold text-gray-600 transition"
        >
          Elegir imagen (JPG o PNG)
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        aria-label={labels.addInput}
        onChange={(e) => props.onFileChange(e.target.files?.[0])}
        className="hidden"
      />
      {props.formError && (
        <p role="alert" className="text-xs text-red-600">
          {props.formError}
        </p>
      )}
    </section>
  );
}
