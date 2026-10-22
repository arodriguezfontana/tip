import type { ReactNode } from 'react';
import type { ScheduleGroup } from '@/utils/businessHours';

interface StoreInfoCardProps {
  address?: string | null;
  contactPhone?: string | null;
  /** Horarios de atención ya agrupados por día (ver groupWeeklySchedule). */
  schedule: ScheduleGroup[];
  /** Color principal de la web (hex). */
  accentColor: string;
}

function InfoIcon({ accentColor, children }: { accentColor: string; children: ReactNode }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
      style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">{children}</span>;
}

const CARD = 'flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100';

/** Datos del local en la web de pedidos: dónde está, cómo llamar y cuándo atiende. */
export function StoreInfoCard({ address, contactPhone, schedule, accentColor }: StoreInfoCardProps) {
  const hasSchedule = schedule.length > 0;
  const hasContact = Boolean(address || contactPhone);
  if (!hasSchedule && !hasContact) return null;

  return (
    <section aria-label="Información de contacto del local" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="h-1.5 w-full transition-colors duration-200" style={{ backgroundColor: accentColor }} />
      <div
        className={`p-4 sm:p-5 grid grid-cols-1 gap-3 ${
          hasSchedule && hasContact ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]' : ''
        }`}
      >
        {hasContact && (
          <div className="flex flex-col gap-3">
            {address && (
              <div className={CARD}>
                <InfoIcon accentColor={accentColor}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </InfoIcon>
                <div className="min-w-0">
                  <Label>Dirección</Label>
                  <span className="text-sm font-semibold text-gray-900 break-words block">{address}</span>
                </div>
              </div>
            )}

            {contactPhone && (
              <div className={CARD}>
                <InfoIcon accentColor={accentColor}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </InfoIcon>
                <div className="min-w-0">
                  <Label>Teléfonos</Label>
                  <a
                    href={`tel:${contactPhone.split('/')[0].trim()}`}
                    className="text-sm font-bold text-gray-900 hover:underline break-words block"
                  >
                    {contactPhone}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {hasSchedule && (
          <div className={CARD}>
            <InfoIcon accentColor={accentColor}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </InfoIcon>
            <div className="min-w-0 flex-1">
              <Label>Horarios</Label>
              <dl className="mt-1 divide-y divide-gray-200/70">
                {schedule.map((group) => (
                  <div key={group.label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <dt className="text-sm font-semibold text-gray-900 min-w-0">{group.label}</dt>
                    <dd className="text-sm text-gray-700 tabular-nums flex flex-col items-end">
                      {group.ranges.map((range) => (
                        <span key={range} className="whitespace-nowrap">
                          {range}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
