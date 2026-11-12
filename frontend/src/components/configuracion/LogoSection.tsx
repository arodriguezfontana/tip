import type { ChangeEvent, RefObject } from 'react';

interface LogoSectionProps {
  logoUrl: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveLogo: () => void;
}

/** Logo del local: subirlo, cambiarlo o quitarlo. */
export function LogoSection({ logoUrl, fileInputRef, handleFileChange, handleRemoveLogo }: LogoSectionProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
        Logo Principal
      </h2>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 relative shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo del local" className="w-full h-full object-contain p-2" />
          ) : (
            <div className="text-center text-gray-400 p-2">
              <span className="text-xs font-medium">Sin logo</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center sm:text-left">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Subir logo"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition"
            >
              {logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 rounded-xl transition"
              >
                Quitar logo
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">Formatos recomendados: PNG, JPG, SVG o WebP. Máximo 2 MB.</p>
        </div>
      </div>
    </section>
  );
}
