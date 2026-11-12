import { INPUT_CLASS } from '@/styles/forms';
import type { ImageCollectionLabels } from '@/hooks/useImageCollection';

interface LinkSectionProps {
  labels: ImageCollectionLabels;
  link: string;
  onChange: (link: string) => void;
  saving: boolean;
  hasChanged: boolean;
  onSave: () => void;
}

/** Link externo (a la carta o a las promociones del local) que el bot manda junto con las imágenes. */
export function LinkSection({ labels, link, onChange, saving, hasChanged, onSave }: LinkSectionProps) {
  return (
    <section className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-2">
      <h2 className="text-sm font-bold text-gray-900">Link externo {labels.linkTitle}</h2>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          placeholder={labels.linkPlaceholder}
          value={link}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 ${INPUT_CLASS}`}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !hasChanged}
          className="px-4 py-2 bg-black hover:bg-gray-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-xs"
        >
          Guardar link
        </button>
      </div>
    </section>
  );
}
