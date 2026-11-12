"""Motor de clasificación de exclusiones y extras (NLP).

Clasifica modificadores positivos ("con", "extra", "agregale", "ponele", "sumale")
y negativos ("sin", "quitale", "no le pongas", "sacale").
Calcula precios asociados a modificadores positivos y valida los modificadores contra cada producto.
"""

import difflib
import re
from typing import TYPE_CHECKING, Any

from app.core.text import sin_acentos
from app.repositories import ingredient_repository
from app.services.catalog_service import find_available_products_by_name

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.menu import Ingredient, Product

# Triggers negativos: "sin", "quitale", "no le pongas", "sacale", etc.
PATRON_NEGATIVO = re.compile(
    r'\b(?:no\s+(?:le\s+|me\s+)?(?:pongas|agregues|metas|mandes)|no\s+poner|sin|quitale|quitame|quitar|quita|sacale|sacame|sacar|saca)\b',
    re.IGNORECASE,
)

PATRON_COMBINADO = re.compile(
    r'(\b(?:no\s+(?:le\s+|me\s+)?(?:pongas|agregues|metas|mandes)|no\s+poner|quitale|quitame|quitar|quita|sacale|sacame|sacar|saca|sin|con\s+extra|agregale|agregame|agregar|agrega|sumale|sumame|sumar|suma|ponele|poneme|poner|pone|doble|extra|con)\b)',
    re.IGNORECASE,
)


def limpiar_nombre_ingrediente(ing: str) -> str:
    """Limpia artículos y puntuación de un ingrediente o extra."""
    s = ing.strip()
    s = re.sub(r'^(?:el|la|los|las|un|una|unos|unas|de|del)\s+', '', s, flags=re.IGNORECASE)
    s = re.sub(r'(?:\s+por\s+favor|\s+gracias|\s+plis|\s+porfa)$', '', s, flags=re.IGNORECASE)
    s = s.strip(' ,;.|[]()')
    return s.strip()


def clasificar_modificador(tipo_str: str, texto_ingrediente: str) -> dict:
    """Clasifica un modificador como positivo o negativo según el trigger del cliente."""
    tipo_str_norm = sin_acentos(tipo_str.lower().strip())

    if PATRON_NEGATIVO.search(tipo_str_norm) or tipo_str_norm in (
        "sin", "quitale", "no le pongas", "sacale", "quitar", "sacar", "negative", "remove"
    ):
        tipo = "negative"
        action = "remove"
    else:
        tipo = "positive"
        action = "add"

    nombre_limpio = limpiar_nombre_ingrediente(texto_ingrediente)
    tag = f"[SIN {nombre_limpio.upper()}]" if tipo == "negative" else f"[EXTRA {nombre_limpio.upper()}]"

    return {
        "type": tipo,
        "action": action,
        "name": nombre_limpio,
        "raw": f"{tipo_str} {texto_ingrediente}".strip(),
        "tag": tag,
        "price": 0.0,
        "ingredient_id": None,
    }


_PATRON_CORCHETES = re.compile(
    r"\[(SIN|EXTRA|CON|QUITALE|NO LE PONGAS|SACALE|AGREGALE|PONELE)\s+([^\]]+)\]", re.IGNORECASE
)


def _es_producto_del_menu(db: "Session", nombre: str) -> bool:
    """El nombre completo coincide exactamente con un producto disponible del menú."""
    nombre_normalizado = sin_acentos(nombre.lower())
    return any(
        sin_acentos(producto.name.lower()) == nombre_normalizado
        for producto in find_available_products_by_name(db, nombre)
    )


def _extraer_con_corchetes(texto: str) -> tuple[str, list[dict]] | None:
    """Producto base y modificadores de 'Hamburguesa [SIN CEBOLLA] [EXTRA QUESO]'; None si no usa corchetes."""
    corchetes = _PATRON_CORCHETES.findall(texto)
    if not corchetes:
        return None
    base = _PATRON_CORCHETES.sub("", texto).strip()
    return base, [clasificar_modificador(trigger, ingrediente) for trigger, ingrediente in corchetes]


def _separar_nombre_base(
    db: "Session | None", texto: str, triggers: list[re.Match]
) -> tuple[str, list[re.Match]]:
    """Nombre del producto (lo que va antes del primer trigger) y los triggers que quedan por procesar.

    Si el producto lleva "con" en su nombre y después hay una exclusión ("Milanesa con papas sin cebolla"), el
    nombre llega hasta la exclusión y solo se procesan los triggers desde ahí.
    """
    nombre_base = texto[: triggers[0].start()].strip()
    if db is None:
        return nombre_base, triggers
    negativos = [t for t in triggers if PATRON_NEGATIVO.search(sin_acentos(t.group(1).lower()))]
    if not negativos:
        return nombre_base, triggers
    antes_del_negativo = texto[: negativos[0].start()].strip()
    if not _es_producto_del_menu(db, antes_del_negativo):
        return nombre_base, triggers
    return antes_del_negativo, [t for t in triggers if t.start() >= negativos[0].start()]


def _modificadores_del_trigger(texto: str, trigger: re.Match, fin: int) -> list[dict]:
    """Modificadores que pide un trigger, con los ingredientes que nombra hasta el siguiente trigger (`fin`)."""
    contenido = texto[trigger.end() : fin].strip()
    contenido = re.sub(r"^(?:y|pero|,|\s)+", "", contenido, flags=re.IGNORECASE)
    contenido = re.sub(r"(?:y|pero|,|\s)+$", "", contenido, flags=re.IGNORECASE)
    # Cortar en fin de oración o delimitador de frase fuerte (. ; ! ? \n)
    contenido = re.split(r"[\.\;\!\?\n\r]+", contenido)[0].strip()
    ingredientes = (limpiar_nombre_ingrediente(i) for i in re.split(r"\s*(?:,| y )\s*", contenido))
    return [clasificar_modificador(trigger.group(1), ingrediente) for ingrediente in ingredientes if ingrediente]


def extraer_modificadores_de_texto(texto: str, db: "Session | None" = None) -> tuple[str, list[dict]]:
    """Extrae el producto base y la lista de modificadores clasificados (positivos y negativos).

    Soporta formato con corchetes (ej. 'Hamburguesa [SIN CEBOLLA] [EXTRA QUESO]') y
    lenguaje natural (ej. '1 Hamburguesa completa sin cebolla y con extra queso').
    """
    texto_limpio = texto.strip()
    if not texto_limpio:
        return "", []

    con_corchetes = _extraer_con_corchetes(texto_limpio)
    if con_corchetes:
        return con_corchetes

    # Si el texto completo coincide exactamente con un producto del menú, no se extrae "con ..."
    # (ej. 'Milanesa con papas', 'Pizza con jamon y morrones').
    if db is not None and _es_producto_del_menu(db, texto_limpio):
        return texto_limpio, []

    triggers = list(PATRON_COMBINADO.finditer(texto_limpio))
    if not triggers:
        return texto_limpio, []

    nombre_base, triggers = _separar_nombre_base(db, texto_limpio, triggers)
    fines = [siguiente.start() for siguiente in triggers[1:]] + [len(texto_limpio)]
    modificadores = [
        modificador
        for trigger, fin in zip(triggers, fines, strict=True)
        for modificador in _modificadores_del_trigger(texto_limpio, trigger, fin)
    ]
    return nombre_base, modificadores


def _es_negativo(modificador: dict) -> bool:
    return (modificador.get("type") or modificador.get("action")) in ("negative", "remove")


def _buscar_ingrediente(nombre: str, ingredientes_por_nombre: dict[str, "Ingredient"]) -> "Ingredient | None":
    """Ingrediente con ese nombre, o el que lo contiene o se le parece lo suficiente."""
    nombre_normalizado = sin_acentos(nombre.lower())
    exacto = ingredientes_por_nombre.get(nombre_normalizado)
    if exacto:
        return exacto
    parcial = next(
        (
            ingrediente
            for clave, ingrediente in ingredientes_por_nombre.items()
            if nombre_normalizado in clave or clave in nombre_normalizado
        ),
        None,
    )
    if parcial:
        return parcial
    parecidos = difflib.get_close_matches(nombre_normalizado, list(ingredientes_por_nombre), n=1, cutoff=0.75)
    return ingredientes_por_nombre[parecidos[0]] if parecidos else None


def _precio_del_adicional(db: "Session", nombre: str, ingrediente: "Ingredient | None") -> float:
    """Precio de un extra: el del ingrediente o, si no tiene, el del producto adicional con ese nombre
    (ej. "Extra Queso", "Papas Fritas")."""
    if ingrediente is not None and getattr(ingrediente, "extra_price", None):
        return float(ingrediente.extra_price)
    productos = find_available_products_by_name(db, f"extra {nombre}") or find_available_products_by_name(db, nombre)
    return float(productos[0].price) if productos else 0.0


def _vincular_modificador(db: "Session", modificador: dict, ingredientes_por_nombre: dict[str, "Ingredient"]) -> dict:
    vinculado = dict(modificador)
    nombre = vinculado.get("name", "").strip()
    ingrediente = _buscar_ingrediente(nombre, ingredientes_por_nombre)
    if ingrediente:
        vinculado["ingredient_id"] = ingrediente.id
        vinculado["name"] = ingrediente.name.lower()
        nombre = ingrediente.name

    if _es_negativo(vinculado):
        vinculado.update(type="negative", action="remove", price=0.0, tag=f"[SIN {nombre.upper()}]")
        return vinculado
    vinculado.update(type="positive", action="add", tag=f"[EXTRA {nombre.upper()}]")
    # Si ya trae un precio explícito mayor a 0, se respeta.
    if float(vinculado.get("price") or 0.0) <= 0:
        vinculado["price"] = _precio_del_adicional(db, nombre, ingrediente)
    return vinculado


def vincular_modificadores_con_db(db: "Session", mods: list[dict]) -> list[dict]:
    """Asocia cada modificador con ingredientes o productos del menú para determinar precios e IDs de inventario."""
    if not mods:
        return []
    ingredientes_por_nombre = {
        sin_acentos(ingrediente.name.lower()): ingrediente for ingrediente in ingredient_repository.list_all(db)
    }
    return [_vincular_modificador(db, mod, ingredientes_por_nombre) for mod in mods]


def _ingredientes_de_la_receta(productos: list["Product"]) -> tuple[set[int], set[str]]:
    """(ids, nombres sin acentos) de los ingredientes de las recetas de los productos."""
    items = [item for producto in productos for item in getattr(producto, "recipe_items", [])]
    ids = {item.ingredient_id for item in items if getattr(item, "ingredient_id", None) is not None}
    nombres = {
        sin_acentos(item.ingredient.name.lower())
        for item in items
        if getattr(item, "ingredient", None) and getattr(item.ingredient, "name", None)
    }
    return ids, nombres


def _adicionales_permitidos(productos: list["Product"]) -> tuple[dict[int, Any], dict[str, Any]]:
    """Ingredientes que se pueden agregar como extra a los productos, por id y por nombre sin acentos."""
    ingredientes = [
        ingrediente
        for producto in productos
        for item in getattr(producto, "allowed_extra_items", [])
        if (ingrediente := getattr(item, "ingredient", None))
    ]
    por_id = {ingrediente.id: ingrediente for ingrediente in ingredientes}
    por_nombre = {sin_acentos(ingrediente.name.lower()): ingrediente for ingrediente in ingredientes}
    return por_id, por_nombre


def _restriccion_aplicable(modificador: dict, receta: tuple[set[int], set[str]]) -> dict | None:
    """La exclusión, si lo que se quita forma parte de la receta; si no, None."""
    ids, nombres = receta
    nombre = modificador.get("name", "").strip()
    nombre_normalizado = sin_acentos(nombre.lower())
    ingrediente_id = modificador.get("ingredient_id")
    en_la_receta = (ingrediente_id is not None and ingrediente_id in ids) or any(
        nombre_normalizado in clave or clave in nombre_normalizado for clave in nombres
    )
    if not en_la_receta:
        return None
    return {**modificador, "type": "negative", "action": "remove", "price": 0.0, "tag": f"[SIN {nombre.upper()}]"}


def _adicional_permitido(modificador: dict, adicionales: tuple[dict[int, Any], dict[str, Any]]) -> dict | None:
    """El extra con el precio configurado en su ingrediente, si el producto lo admite; si no, None."""
    por_id, por_nombre = adicionales
    nombre_normalizado = sin_acentos(modificador.get("name", "").strip().lower())
    ingrediente_id = modificador.get("ingredient_id")
    if ingrediente_id is not None and ingrediente_id in por_id:
        ingrediente = por_id[ingrediente_id]
    elif nombre_normalizado in por_nombre:
        ingrediente = por_nombre[nombre_normalizado]
    else:
        ingrediente = next(
            (
                candidato
                for clave, candidato in por_nombre.items()
                if nombre_normalizado in clave or clave in nombre_normalizado
            ),
            None,
        )
    if ingrediente is None:
        return None
    return {
        **modificador,
        "type": "positive",
        "action": "add",
        "ingredient_id": ingrediente.id,
        "name": ingrediente.name.lower(),
        "price": float(ingrediente.extra_price or 0.0),
        "tag": f"[EXTRA {ingrediente.name.upper()}]",
    }


def filtrar_modificadores_para_producto(
    mods: list[dict],
    product: "Product | None",
    secondary_product: "Product | None" = None,
) -> list[dict]:
    """Filtra y valida modificadores para un producto específico:
    - Restricciones ([SIN ...]): solo se aplican si el ingrediente forma parte de la receta del producto.
    - Adicionales ([EXTRA ...]): solo se aplican si el ingrediente está en los allowed_extras del producto,
      y se les asigna el precio extra_price configurado en el ingrediente.
    """
    if not mods or product is None:
        return []
    productos = [product] if secondary_product is None else [product, secondary_product]
    receta = _ingredientes_de_la_receta(productos)
    adicionales = _adicionales_permitidos(productos)
    aplicados = [
        _restriccion_aplicable(mod, receta) if _es_negativo(mod) else _adicional_permitido(mod, adicionales)
        for mod in mods
    ]
    return [mod for mod in aplicados if mod is not None]
