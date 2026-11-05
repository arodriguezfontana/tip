"""Motor de clasificación de exclusiones y extras (NLP).

Clasifica modificadores positivos ("con", "extra", "agregale", "ponele", "sumale")
y negativos ("sin", "quitale", "no le pongas", "sacale").
Calcula precios asociados a modificadores positivos y prepara el formateo de comandas [SIN ...] [EXTRA ...].
"""

import difflib
import re
import unicodedata
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.menu import Product

# Triggers negativos: "sin", "quitale", "no le pongas", "sacale", etc.
PATRON_NEGATIVO = re.compile(
    r'\b(?:no\s+(?:le\s+|me\s+)?(?:pongas|agregues|metas|mandes)|no\s+poner|sin|quitale|quitame|quitar|quita|sacale|sacame|sacar|saca)\b',
    re.IGNORECASE,
)

# Triggers positivos: "con extra", "extra", "con", "agregale", "ponele", "sumale", "doble", etc.
PATRON_POSITIVO = re.compile(
    r'\b(?:con\s+extra|agregale|agregame|agregar|agrega|sumale|sumame|sumar|suma|ponele|poneme|poner|pone|doble|con|extra)\b',
    re.IGNORECASE,
)

PATRON_COMBINADO = re.compile(
    r'(\b(?:no\s+(?:le\s+|me\s+)?(?:pongas|agregues|metas|mandes)|no\s+poner|quitale|quitame|quitar|quita|sacale|sacame|sacar|saca|sin|con\s+extra|agregale|agregame|agregar|agrega|sumale|sumame|sumar|suma|ponele|poneme|poner|pone|doble|extra|con)\b)',
    re.IGNORECASE,
)


def sin_acentos(texto: str) -> str:
    """Elimina acentos y diacríticos para comparaciones robustas."""
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


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


def extraer_modificadores_de_texto(texto: str, db: "Session | None" = None) -> tuple[str, list[dict]]:
    """Extrae el producto base y la lista de modificadores clasificados (positivos y negativos).

    Soporta formato con corchetes (ej. 'Hamburguesa [SIN CEBOLLA] [EXTRA QUESO]') y
    lenguaje natural (ej. '1 Hamburguesa completa sin cebolla y con extra queso').
    """
    texto_limpio = texto.strip()
    if not texto_limpio:
        return "", []

    mods: list[dict] = []

    # 1. Chequear formato con corchetes: [SIN CEBOLLA] [EXTRA QUESO]
    corchetes = re.findall(
        r'\[(SIN|EXTRA|CON|QUITALE|NO LE PONGAS|SACALE|AGREGALE|PONELE)\s+([^\]]+)\]',
        texto_limpio,
        re.IGNORECASE,
    )
    if corchetes:
        base = re.sub(
            r'\[(SIN|EXTRA|CON|QUITALE|NO LE PONGAS|SACALE|AGREGALE|PONELE)\s+([^\]]+)\]',
            '',
            texto_limpio,
            flags=re.IGNORECASE,
        ).strip()
        for trig, ing in corchetes:
            mods.append(clasificar_modificador(trig, ing))
        return base, mods

    # 2. Si el texto completo coincide exactamente con un producto existente en la base, no extraer "con ..."
    # (ej. 'Milanesa con papas', 'Pizza con jamon y morrones').
    if db is not None:
        from app.services.catalog_service import find_available_products_by_name
        prods = find_available_products_by_name(db, texto_limpio)
        for p in prods:
            if sin_acentos(p.name.lower()) == sin_acentos(texto_limpio.lower()):
                return texto_limpio, []

    # 3. Detectar triggers en lenguaje natural
    matches = list(PATRON_COMBINADO.finditer(texto_limpio))
    if not matches:
        return texto_limpio, []

    # Si el trigger es solo "con" y lo que sigue forma un producto válido del menú,
    # verificar si todo el texto es un producto conocido
    primer_match = matches[0]
    nombre_base = texto_limpio[:primer_match.start()].strip()

    # Si hay db y el trigger fue "con", verificar si nombre_base + " con ..." es un producto
    if db is not None and matches:
        from app.services.catalog_service import find_available_products_by_name
        # Chequear si nombre completo antes de un trigger negativo es un producto
        # ej: "Milanesa con papas sin cebolla"
        neg_matches = [m for m in matches if PATRON_NEGATIVO.search(sin_acentos(m.group(1).lower()))]
        if neg_matches:
            primer_neg = neg_matches[0]
            posible_prod = texto_limpio[:primer_neg.start()].strip()
            prods = find_available_products_by_name(db, posible_prod)
            if any(sin_acentos(p.name.lower()) == sin_acentos(posible_prod.lower()) for p in prods):
                nombre_base = posible_prod
                # Solo procesar triggers a partir del primer negativo
                matches = [m for m in matches if m.start() >= primer_neg.start()]

    # Extraer segmentos
    for i, match in enumerate(matches):
        trigger = match.group(1)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(texto_limpio)
        contenido = texto_limpio[start:end].strip()
        contenido = re.sub(r'^(?:y|pero|,|\s)+', '', contenido, flags=re.IGNORECASE)
        contenido = re.sub(r'(?:y|pero|,|\s)+$', '', contenido, flags=re.IGNORECASE)
        # Cortar en fin de oración o delimitador de frase fuerte (. ; ! ? \n)
        contenido = re.split(r'[\.\;\!\?\n\r]+', contenido)[0].strip()

        sub_ingredientes = re.split(r'\s*(?:,| y )\s*', contenido)
        for sub_ing in sub_ingredientes:
            sub_limpio = limpiar_nombre_ingrediente(sub_ing)
            if sub_limpio:
                mods.append(clasificar_modificador(trigger, sub_limpio))

    return nombre_base, mods


def vincular_modificadores_con_db(db: "Session", mods: list[dict]) -> list[dict]:
    """Asocia cada modificador con ingredientes o productos del menú para determinar precios e IDs de inventario."""
    if not mods:
        return []

    from app.models.menu import Ingredient
    from app.services.catalog_service import find_available_products_by_name

    # Cargar ingredientes existentes para mapear nombres
    ingredientes = db.query(Ingredient).all()
    ing_map = {sin_acentos(i.name.lower()): i for i in ingredientes}

    resultado = []
    for mod in mods:
        m = dict(mod)
        name_clean = m.get("name", "").strip()
        name_norm = sin_acentos(name_clean.lower())

        # Buscar ingrediente por coincidencia exacta o parcial
        matched_ing = ing_map.get(name_norm)
        if not matched_ing:
            for k, ing in ing_map.items():
                if name_norm in k or k in name_norm:
                    matched_ing = ing
                    break
        if not matched_ing:
            close_matches = difflib.get_close_matches(name_norm, list(ing_map.keys()), n=1, cutoff=0.75)
            if close_matches:
                matched_ing = ing_map[close_matches[0]]

        if matched_ing:
            m["ingredient_id"] = matched_ing.id
            name_clean = matched_ing.name
            m["name"] = matched_ing.name.lower()

        m_type = m.get("type") or m.get("action")
        if m_type in ("negative", "remove"):
            m["type"] = "negative"
            m["action"] = "remove"
            m["price"] = 0.0
            m["tag"] = f"[SIN {name_clean.upper()}]"
        else:
            m["type"] = "positive"
            m["action"] = "add"
            m["tag"] = f"[EXTRA {name_clean.upper()}]"

            # Si ya trae un precio explícito mayor a 0, respetarlo
            precio_actual = float(m.get("price") or 0.0)
            if precio_actual <= 0:
                if matched_ing and getattr(matched_ing, "extra_price", None):
                    m["price"] = float(matched_ing.extra_price)
                else:
                    # Buscar si existe un producto adicional con ese nombre (ej. "Extra Queso", "Papas Fritas")
                    prods = find_available_products_by_name(db, f"extra {name_clean}") or find_available_products_by_name(db, name_clean)
                    if prods:
                        m["price"] = float(prods[0].price)
                    else:
                        m["price"] = 0.0

        resultado.append(m)

    return resultado


def formatear_comanda_modificaciones(mods: list[dict]) -> str:
    """Devuelve las modificaciones en el formato destacado para cocina, ej: [SIN CEBOLLA] [EXTRA QUESO]."""
    if not mods:
        return ""
    tags = []
    for m in mods:
        tag = m.get("tag")
        if not tag:
            nombre = m.get("name", "").upper()
            tipo = m.get("type") or m.get("action")
            tag = f"[SIN {nombre}]" if tipo in ("negative", "remove") else f"[EXTRA {nombre}]"
        tags.append(tag)
    return " ".join(tags)


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

    prods = [product]
    if secondary_product is not None:
        prods.append(secondary_product)

    # 1. Ingredientes de la receta (para restricciones)
    recipe_ing_ids: set[int] = set()
    recipe_ing_names: set[str] = set()
    for p in prods:
        for item in getattr(p, "recipe_items", []):
            if getattr(item, "ingredient_id", None) is not None:
                recipe_ing_ids.add(item.ingredient_id)
            if getattr(item, "ingredient", None) and getattr(item.ingredient, "name", None):
                recipe_ing_names.add(sin_acentos(item.ingredient.name.lower()))

    # 2. Adicionales permitidos (para extras)
    allowed_extras_by_id: dict[int, Any] = {}
    allowed_extras_by_name: dict[str, Any] = {}
    for p in prods:
        for item in getattr(p, "allowed_extra_items", []):
            ing = getattr(item, "ingredient", None)
            if ing:
                allowed_extras_by_id[ing.id] = ing
                allowed_extras_by_name[sin_acentos(ing.name.lower())] = ing

    filtrados = []
    for mod in mods:
        m = dict(mod)
        m_type = m.get("type") or m.get("action")
        ing_id = m.get("ingredient_id")
        name_clean = m.get("name", "").strip()
        name_norm = sin_acentos(name_clean.lower())

        if m_type in ("negative", "remove"):
            coincide = False
            if ing_id is not None and ing_id in recipe_ing_ids or name_norm in recipe_ing_names:
                coincide = True
            else:
                for rname in recipe_ing_names:
                    if name_norm in rname or rname in name_norm:
                        coincide = True
                        break

            if coincide:
                m["type"] = "negative"
                m["action"] = "remove"
                m["price"] = 0.0
                m["tag"] = f"[SIN {name_clean.upper()}]"
                filtrados.append(m)
        else:
            matched_extra = None
            if ing_id is not None and ing_id in allowed_extras_by_id:
                matched_extra = allowed_extras_by_id[ing_id]
            elif name_norm in allowed_extras_by_name:
                matched_extra = allowed_extras_by_name[name_norm]
            else:
                for aname, extra_ing in allowed_extras_by_name.items():
                    if name_norm in aname or aname in name_norm:
                        matched_extra = extra_ing
                        break

            if matched_extra is not None:
                m["type"] = "positive"
                m["action"] = "add"
                m["ingredient_id"] = matched_extra.id
                m["name"] = matched_extra.name.lower()
                m["price"] = float(matched_extra.extra_price or 0.0)
                m["tag"] = f"[EXTRA {matched_extra.name.upper()}]"
                filtrados.append(m)

    return filtrados

