import { useRef } from 'react';
import { DEFAULT_PANEL_COLOR, PANEL_BG_PRESETS } from '@/utils/panelBackground';
import { resizeImageToDataUrl } from '@/utils/images';
import type { PanelBgOption } from '@/types/storeConfig';

interface PanelBgPickerProps {
  value: PanelBgOption;
  image: string | null;
  /** Color elegido para el fondo liso (#rrggbb), si ya eligió uno. */
  color: string | null;
  /** Color del tilde de la opción elegida. */
  accentColor: string;
  onChange: (value: PanelBgOption) => void;
  onImageChange: (image: string | null) => void;
  onColorChange: (color: string) => void;
  onError: (message: string | null) => void;
}

const MAX_FILE_MB = 15;

const cardClasses = (selected: boolean) =>
  `relative text-left rounded-2xl overflow-hidden border-2 transition-all p-3 flex flex-col ${
    selected ? 'border-black bg-gray-50 shadow-md ring-2 ring-black/10' : 'border-gray-200 hover:border-gray-300 bg-white'
  }`;

function Check({ color }: { color: string }) {
  return (
    <span className="absolute top-2 right-2 rounded-full p-1 text-white shadow" style={{ backgroundColor: color }}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/** Selector del fondo del panel de administración: liso, una imagen incluida o una propia. */
export function PanelBgPicker({ value, image, color, accentColor, onChange, onImageChange, onColorChange, onError }: PanelBgPickerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('Por favor seleccioná un archivo de imagen válido (PNG, JPG o WebP).');
      return;
    }
    // La imagen se achica antes de guardarla, así que se acepta una foto pesada del celular.
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      onError(`La imagen de fondo no debe superar los ${MAX_FILE_MB} MB.`);
      return;
    }
    try {
      onImageChange(await resizeImageToDataUrl(file));
      onChange('custom');
      onError(null);
    } catch {
      onError('No se pudo leer la imagen seleccionada.');
    }
  };

  const removeImage = () => {
    onImageChange(null);
    if (value === 'custom') onChange('none');
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
      <button
        type="button"
        onClick={() => onChange('none')}
        aria-pressed={value === 'none'}
        aria-label="Panel: fondo liso"
        className={`${cardClasses(value === 'none')} group`}
      >
        <div className="relative aspect-video w-full rounded-xl bg-gray-50 border border-gray-200 mb-2.5 flex items-center justify-center text-xs text-gray-400">
          Sin imagen
          {value === 'none' && <Check color={accentColor} />}
        </div>
        <span className="text-sm font-bold text-gray-900">Liso</span>
      </button>

      {/* Color liso a elección, igual que el color principal: sin elegir todavía se ve la paleta de colores */}
      <div className={cardClasses(value === 'color')}>
        <input
          ref={colorInput}
          type="color"
          aria-label="Elegir color de fondo del panel"
          value={color ?? DEFAULT_PANEL_COLOR}
          onChange={(e) => {
            onColorChange(e.target.value);
            onChange('color');
          }}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => (color ? onChange('color') : colorInput.current?.click())}
          aria-pressed={value === 'color'}
          aria-label="Panel: color liso"
          className="relative aspect-video w-full rounded-xl overflow-hidden border border-gray-200 mb-2.5"
          style={{
            background:
              color ??
              'conic-gradient(from 180deg at 50% 50%, #FF0000 0deg, #FFA500 51deg, #FFFF00 102deg, #008000 153deg, #0000FF 204deg, #4B0082 255deg, #EE82EE 306deg, #FF0000 360deg)',
          }}
        >
          {value === 'color' && <Check color={accentColor} />}
        </button>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900">Color liso</span>
          {color && (
            <button
              type="button"
              onClick={() => colorInput.current?.click()}
              className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 underline"
            >
              Cambiar
            </button>
          )}
        </div>
      </div>

      {PANEL_BG_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange(preset.id)}
          aria-pressed={value === preset.id}
          aria-label={`Panel: ${preset.name}`}
          className={`${cardClasses(value === preset.id)} group`}
        >
          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-gray-100 mb-2.5">
            <img
              src={preset.image}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
            {value === preset.id && <Check color={accentColor} />}
          </div>
          <span className="text-sm font-bold text-gray-900">{preset.name}</span>
        </button>
      ))}

      <div className={cardClasses(value === 'custom')}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label="Subir imagen de fondo del panel"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={() => (image ? onChange('custom') : fileInput.current?.click())}
          aria-pressed={value === 'custom'}
          aria-label="Panel: imagen propia"
          className="group relative aspect-video w-full rounded-xl overflow-hidden bg-gray-100 mb-2.5"
        >
          {image ? (
            <img src={image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
              <span className="text-xl leading-none">+</span>
              <span className="text-xs font-medium">Subir desde el dispositivo</span>
            </span>
          )}
          {value === 'custom' && <Check color={accentColor} />}
        </button>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900">Imagen propia</span>
          {image && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 underline"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={removeImage}
                aria-label="Quitar imagen propia del panel"
                className="text-[11px] font-semibold text-red-600 hover:text-red-700 underline"
              >
                Quitar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
