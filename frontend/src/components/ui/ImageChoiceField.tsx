import type { ImageChoice } from '@/hooks/useImageChoice';
import { LABEL_CLASS } from '@/styles/forms';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_MB } from '@/utils/catalog';

interface ImageChoiceFieldProps {
  choice: ImageChoice;
  previewAlt: string;
  inputLabel: string;
}

/** Campo de imagen opcional de un formulario: vista previa, elegir/cambiar y quitar. */
export function ImageChoiceField({ choice, previewAlt, inputLabel }: ImageChoiceFieldProps) {
  const { shownImage, fileInput, chooseFile, removeImage, imageError } = choice;
  return (
    <div>
      <span className={LABEL_CLASS}>Imagen (opcional)</span>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
          {shownImage ? (
            <img src={shownImage} alt={previewAlt} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] text-gray-400 text-center px-1">Sin imagen</span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="text-xs font-semibold rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition"
            >
              {shownImage ? 'Cambiar imagen' : 'Elegir imagen'}
            </button>
            {shownImage && (
              <button
                type="button"
                onClick={removeImage}
                className="text-xs font-semibold rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50 transition"
              >
                Quitar imagen
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500">JPG o PNG, hasta {MAX_IMAGE_MB} MB.</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            aria-label={inputLabel}
            onChange={(e) => chooseFile(e.target.files?.[0])}
            className="hidden"
          />
        </div>
      </div>
      {imageError && <p className="text-xs text-red-600 mt-2">{imageError}</p>}
    </div>
  );
}
