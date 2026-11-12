import { PanelBgPicker } from '@/components/PanelBgPicker';
import type { PanelBgOption, ThemeOption } from '@/types/storeConfig';

interface PanelBackgroundSectionProps {
  panelBg: PanelBgOption;
  setPanelBg: (option: PanelBgOption) => void;
  panelBgImage: string | null;
  setPanelBgImage: (image: string | null) => void;
  panelBgColor: string | null;
  setPanelBgColor: (color: string | null) => void;
  currentTheme: ThemeOption;
  onError: (message: string | null) => void;
}

/** Fondo del panel de administración: liso, un color, una imagen o una propia. */
export function PanelBackgroundSection({ panelBg, setPanelBg, panelBgImage, setPanelBgImage, panelBgColor, setPanelBgColor, currentTheme, onError }: PanelBackgroundSectionProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Fondo del Panel</h2>
        <p className="text-xs text-gray-500 mt-1">
          Color o imagen de fondo del panel de control.
        </p>
      </div>
      <PanelBgPicker
        value={panelBg}
        image={panelBgImage}
        color={panelBgColor}
        accentColor={currentTheme.hex}
        onChange={setPanelBg}
        onImageChange={setPanelBgImage}
        onColorChange={setPanelBgColor}
        onError={onError}
      />
    </section>
  );
}
