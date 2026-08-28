"""Tools de LangChain para que el chatbot consulte datos reales del local."""

from langchain_core.tools import tool

from app.db.session import SessionLocal
from app.modules.menu import Category, Product


@tool
def consultar_productos(categoria: str | None = None) -> str:
    """Devuelve el listado real de productos activos del local (nombre, precio,
    categoría y descripción), tal como están cargados en la base de datos.
    Se debe usar SIEMPRE que el cliente pregunte por el menú, productos, precios
    o disponibilidad. Si se pasa 'categoria' (ej. 'Pizzas', 'Bebidas', 'Postres'),
    filtra solo esa categoría. Si no devuelve resultados, informarlo con sinceridad
    en vez de inventar productos.
    """
    db = SessionLocal()
    try:
        query = db.query(Product).filter(Product.is_active.is_(True))
        if categoria:
            query = query.join(Category).filter(Category.name.ilike(f"%{categoria}%"))

        productos = query.order_by(Product.category_id, Product.name).all()
        if not productos:
            return "No hay productos cargados que coincidan con esa búsqueda."

        lineas = [
            f"- {p.name} (${p.price:.2f}) [{p.category.name}]: {p.description or 'sin descripción'}"
            for p in productos
        ]
        return "\n".join(lineas)
    finally:
        db.close()
