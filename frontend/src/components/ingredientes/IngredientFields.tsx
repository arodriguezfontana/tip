import type { ReactNode } from 'react';
import { INPUT_CLASS } from '@/styles/forms';
import type { IngredientPayload } from '@/types/ingredient';

const amountFrom = (text: string) => (text === '' ? 0 : Number(text));

interface IngredientFieldsProps {
  value: IngredientPayload;
  onChange: (value: IngredientPayload) => void;
  /** Cómo se nombra al ingrediente en las etiquetas de accesibilidad: "del ingrediente" o "del nuevo ingrediente". */
  subject: string;
  /** Distinto tamaño de cada campo según dónde se muestre. */
  classes: { name: string; unit: string; cost: string; extra: string };
  /** Dentro de una tabla cada campo va en su celda; en el formulario de alta, con textos de ayuda. */
  inTableCells?: boolean;
}

/** Los cuatro campos de un ingrediente: nombre, unidad, costo unitario y precio extra. */
export function IngredientFields({ value, onChange, subject, classes, inTableCells = false }: IngredientFieldsProps) {
  const hint = (text: string) => (inTableCells ? undefined : text);
  const place = (input: ReactNode, key: string) =>
    inTableCells ? (
      <td key={key} className="py-2 px-5">
        {input}
      </td>
    ) : (
      input
    );

  return (
    <>
      {place(
        <input
          type="text"
          aria-label={`Nombre ${subject}`}
          placeholder={hint('Nombre (ej. Harina 000)')}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={100}
          className={`${INPUT_CLASS} ${classes.name}`}
        />,
        'name'
      )}
      {place(
        <input
          type="text"
          aria-label={`Unidad ${subject}`}
          placeholder={hint('Unidad (ej. gramos)')}
          list="ingredient-units"
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value })}
          maxLength={30}
          className={`${INPUT_CLASS} ${classes.unit}`}
        />,
        'unit'
      )}
      {place(
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label={`Costo unitario ${subject}`}
          placeholder={hint('Costo ($)')}
          value={value.cost || ''}
          onChange={(e) => onChange({ ...value, cost: amountFrom(e.target.value) })}
          className={`${INPUT_CLASS} ${classes.cost}`}
        />,
        'cost'
      )}
      {place(
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label={`Precio extra ${subject}`}
          placeholder={hint('Precio extra ($)')}
          value={value.extra_price || ''}
          onChange={(e) => onChange({ ...value, extra_price: amountFrom(e.target.value) })}
          className={`${INPUT_CLASS} ${classes.extra}`}
        />,
        'extra'
      )}
    </>
  );
}
