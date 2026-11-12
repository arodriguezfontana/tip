import { useEffect, useRef, useState } from 'react';
import { AddImageSection } from '@/components/imagenes/AddImageSection';
import { ImageGallery } from '@/components/imagenes/ImageGallery';
import { LinkSection } from '@/components/imagenes/LinkSection';
import { PanelNote } from '@/components/ui/PanelNote';
import { Toast } from '@/components/ui/Toast';
import { MENU_COLLECTION, PROMOTIONS_COLLECTION, useImageCollection } from '@/hooks/useImageCollection';
import { useToast } from '@/hooks/useToast';
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from '@/utils/catalog';
import { getErrorMessage } from '@/utils/errors';

type ConfigTab = 'menu' | 'promociones';

const TABS: { key: ConfigTab; label: string }[] = [
  { key: 'menu', label: 'Menú' },
  { key: 'promociones', label: 'Promociones' },
];

export function MenuImagenView() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('menu');
  const menu = useImageCollection(MENU_COLLECTION);
  const promotions = useImageCollection(PROMOTIONS_COLLECTION);
  const active = activeTab === 'menu' ? menu : promotions;
  const { labels } = active.kind;

  const [formError, setFormError] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [saving, setSaving] = useState(false);

  // Archivo elegido para sumar y archivo que reemplaza a una imagen existente
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmingRemovalOf, setConfirmingRemovalOf] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);

  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const clearAddInput = () => {
    if (addInput.current) addInput.current.value = '';
  };

  const discardFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormError(null);
    clearAddInput();
  };

  const handleFileChange = (file: File | undefined) => {
    clearAddInput();
    if (!file) return;
    const error = validateImageFile(file);
    setFormError(error);
    setSelectedFile(error ? null : file);
    setPreviewUrl(error ? null : URL.createObjectURL(file));
  };

  /** Hace un cambio sobre las imágenes: mientras se guarda bloquea los botones y, si falla, muestra el motivo. */
  const saveChange = async (change: () => Promise<void>, failureMessage: string) => {
    setSaving(true);
    setFormError(null);
    try {
      await change();
    } catch (err) {
      setFormError(getErrorMessage(err, failureMessage));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLink = async () => {
    setSavingLink(true);
    setFormError(null);
    try {
      const savedLink = await active.saveLink();
      toast.show(savedLink ? labels.linkSaved : labels.linkRemoved);
    } catch (err) {
      setFormError(getErrorMessage(err, labels.linkSaveError));
    } finally {
      setSavingLink(false);
    }
  };

  const handlePublishFile = async () => {
    if (!selectedFile || saving) return;
    await saveChange(async () => {
      await active.add(selectedFile);
      toast.show(labels.added);
      discardFile();
    }, 'No se pudo guardar la imagen. Intentá nuevamente.');
  };

  const handleReplaceFile = async (file: File | undefined) => {
    const id = replacingId;
    if (replaceInput.current) replaceInput.current.value = '';
    setReplacingId(null);
    if (!file || id == null) return;
    const error = validateImageFile(file);
    if (error) {
      setFormError(error);
      return;
    }
    await saveChange(async () => {
      await active.replace(id, file);
      toast.show(labels.replaced);
    }, 'No se pudo guardar la imagen. Intentá nuevamente.');
  };

  const handleRemoveImage = (id: number) =>
    saveChange(async () => {
      await active.remove(id);
      toast.show(labels.removed);
      setConfirmingRemovalOf(null);
    }, 'No se pudo quitar la imagen. Intentá nuevamente.');

  const handleMoveImage = (index: number, offset: -1 | 1) =>
    saveChange(() => active.move(index, offset), 'No se pudo cambiar el orden. Intentá nuevamente.');

  const handleReplaceRequest = (id: number) => {
    setReplacingId(id);
    replaceInput.current?.click();
  };

  const selectTab = (tab: ConfigTab) => {
    setActiveTab(tab);
    discardFile();
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto relative">
      <Toast message={toast.message} />

      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Menú y promociones</h1>
          <p className="text-xs text-gray-500">
            Son las imágenes y links que el bot les manda a los clientes cuando piden el menú o las promociones.
          </p>
        </div>

        <div role="tablist" aria-label="Secciones" className="inline-flex rounded-xl bg-gray-100 p-1 self-start sm:self-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => selectTab(tab.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                activeTab === tab.key ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {menu.loadError && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{menu.loadError}</div>}
      {!menu.list && !menu.loadError && <PanelNote>Cargando menú...</PanelNote>}

      {menu.list && (
        <>
          <LinkSection
            labels={labels}
            link={active.link}
            onChange={active.setLink}
            saving={savingLink}
            hasChanged={active.hasLinkChanged}
            onSave={handleSaveLink}
          />

          <section aria-label={labels.imagesTitle} className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3">
            <ImageGallery
              images={active.images}
              maxImages={active.maxImages}
              labels={labels}
              saving={saving}
              confirmingRemovalOf={confirmingRemovalOf}
              onMove={handleMoveImage}
              onReplace={handleReplaceRequest}
              onAskRemoval={setConfirmingRemovalOf}
              onRemove={handleRemoveImage}
            />
            <input
              ref={replaceInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              aria-label={labels.replaceInput}
              onChange={(e) => handleReplaceFile(e.target.files?.[0])}
              className="hidden"
            />
          </section>

          <AddImageSection
            labels={labels}
            maxImages={active.maxImages}
            isFull={active.images.length >= active.maxImages}
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            saving={saving}
            formError={formError}
            fileInputRef={addInput}
            onFileChange={handleFileChange}
            onPublish={handlePublishFile}
            onDiscard={discardFile}
          />
        </>
      )}
    </div>
  );
}
