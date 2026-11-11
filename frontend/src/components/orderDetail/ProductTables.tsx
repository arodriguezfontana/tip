import { SectorIcon } from '@/components/Icons';
import { SECTOR_CONFIG } from '@/types/order';
import type { PreparationSector, WebOrderItem } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { cleanModTag } from '@/utils/modifications';
import type { SectorRowItem } from '@/utils/orderSectors';

function NewBadge() {
  return (
    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900">Nuevo</span>
  );
}

function sectorLabel(sector: string): string {
  return SECTOR_CONFIG[sector as PreparationSector]?.label ?? sector.charAt(0).toUpperCase() + sector.slice(1);
}

function VariantModifications({ variants }: { variants: SectorRowItem['variants'] }) {
  const modified = variants.filter((variant) => variant.modifications && variant.modifications.length > 0);
  if (modified.length === 0) return null;
  const hasMultipleVariants = variants.length > 1;
  return (
    <div className="mt-1 space-y-1">
      {modified.map((variant, variantIndex) => (
        <div key={variantIndex} className="flex items-center gap-1.5 flex-wrap text-[10px]">
          {hasMultipleVariants && <span className="font-bold text-gray-500 whitespace-nowrap">{variant.quantity}x</span>}
          {variant.modifications.map((mod, modIndex) => (
            <span
              key={modIndex}
              className={`font-semibold text-[10px] px-1.5 py-0.2 rounded ${
                mod.type === 'negative' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {cleanModTag(mod)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function SectorRow({ item }: { item: SectorRowItem }) {
  return (
    <tr className={`transition ${item.added_later ? 'bg-amber-50' : 'hover:bg-gray-50/50'}`}>
      <td className="py-2 px-3 align-top font-semibold text-gray-800">
        <div className="text-sm font-bold">{item.total_quantity}</div>
        {item.has_promo_units && (
          <div className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">({item.promo_quantity} en promo)</div>
        )}
      </td>
      <td className="py-2 pr-2 text-gray-900 font-medium">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{item.product_name}</span>
          {item.added_later && <NewBadge />}
        </div>
        <VariantModifications variants={item.variants} />
      </td>
      <td className="py-2 pr-3 text-right align-top font-semibold whitespace-nowrap text-gray-900">
        {item.has_normal_units ? (
          <div>
            <span>{formatCurrency(item.normal_subtotal)}</span>
            {item.has_promo_units && (
              <div className="text-[10px] text-amber-800 font-normal italic">No incluye precios de promo</div>
            )}
          </div>
        ) : (
          <span className="text-amber-800 font-medium italic text-xs">Precio de promo</span>
        )}
      </td>
    </tr>
  );
}

/** Productos de un sector de preparación (cocina, pizzería, barra) con sus cantidades y modificaciones. */
export function SectorTable({ sector, items }: { sector: string; items: SectorRowItem[] }) {
  const totalItems = items.reduce((total, item) => total + item.total_quantity, 0);
  return (
    <div className="rounded-xl border border-gray-200/80 overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 border-b border-gray-100 text-xs font-bold text-gray-800">
        <span className="flex items-center gap-1.5">
          <SectorIcon sector={sector} className="w-3.5 h-3.5 shrink-0" />
          <span>{sectorLabel(sector)}</span>
        </span>
        <span className="text-[11px] font-medium text-gray-500">
          {totalItems} {totalItems === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50/40">
            <th scope="col" className="py-1 px-3 text-left w-14">Cant.</th>
            <th scope="col" className="py-1 pr-2 text-left">Producto</th>
            <th scope="col" className="py-1 pr-3 text-right w-36">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <SectorRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromoRow({ promo }: { promo: WebOrderItem }) {
  return (
    <tr className={`transition ${promo.added_later ? 'bg-amber-100/60' : 'hover:bg-amber-50/40'}`}>
      <td className="py-2 px-3 align-top font-semibold text-gray-800">{promo.quantity}</td>
      <td className="py-2 pr-2 text-gray-900 font-medium">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-xs">{promo.product_name}</span>
          {promo.added_later && <NewBadge />}
        </div>
        {promo.promotion_description && (
          <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{promo.promotion_description}</p>
        )}
      </td>
      <td className="py-2 pr-3 text-right align-top font-bold text-gray-900 whitespace-nowrap">
        {formatCurrency(promo.subtotal)}
      </td>
    </tr>
  );
}

/** Las promociones que pidió el cliente, con su precio. */
export function PromoTable({ promos }: { promos: WebOrderItem[] }) {
  const totalPromos = promos.reduce((total, promo) => total + promo.quantity, 0);
  return (
    <div className="rounded-xl border-2 border-amber-200/90 overflow-hidden bg-gradient-to-b from-amber-50/40 to-white shadow-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-100/70 border-b border-amber-200 text-xs font-bold text-amber-900">
        <span className="flex items-center gap-1.5">
          <span>Promos</span>
        </span>
        <span className="text-[11px] font-medium text-amber-700">
          {totalPromos} {totalPromos === 1 ? 'promo' : 'promos'}
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-amber-200/70 text-[10px] font-bold text-amber-900/70 uppercase tracking-wider bg-amber-50/50">
            <th scope="col" className="py-1 px-3 text-left w-14">Cant.</th>
            <th scope="col" className="py-1 pr-2 text-left">Promoción</th>
            <th scope="col" className="py-1 pr-3 text-right w-36">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100">
          {promos.map((promo, index) => (
            <PromoRow key={promo.id ?? promo.promotion_id ?? index} promo={promo} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
