"""Tools de LangChain para analizar, calcular y persistir pedidos de forma exacta."""

import json
import logging
from typing import Annotated
from langchain_core.tools import tool, InjectedToolArg
from app.db.session import SessionLocal
from app.modules.menu import Product
from app.modules.order import Order, OrderItem

logger = logging.getLogger(__name__)


@tool
def calcular_y_preparar_pedido(
    items_solicitados: str,
    customer_name: str | None = None,
    shipping_address: str | None = None,
    metodo_entrega: str | None = None,
) -> str:
    """Calcula de forma exacta el total de un pedido consultando los precios reales en la base de datos.
    Debe llamarse cuando el cliente mencione qué quiere comer.

    Args:
        items_solicitados: Un JSON string con una lista de diccionarios con el nombre del producto
                           (o parte de él) y la cantidad deseada. Ej: '[{"nombre": "muzzarella", "cantidad": 1}, {"nombre": "agua", "cantidad": 2}]'
        customer_name: Nombre del cliente (si ya lo dio).
        shipping_address: Dirección de envío (si ya la dio y eligió envío a domicilio).
        metodo_entrega: 'domicilio' si el cliente quiere que le enviemos el pedido, o 'retiro' si
                        va a pasar a buscarlo por el local (si ya lo dijo).
    """
    db = SessionLocal()
    try:
        lista_items = json.loads(items_solicitados)
        resumen_lineas = []
        total_general = 0.0
        items_validados = []

        for item in lista_items:
            nombre_buscado = item.get("nombre", "").strip()
            cantidad = item.get("cantidad", 1)

            producto = db.query(Product).filter(
                Product.is_active.is_(True),
                Product.name.ilike(f"%{nombre_buscado}%")
            ).first()

            if not producto:
                resumen_lineas.append(f"- No pudimos encontrar el producto: '{nombre_buscado}'")
                continue

            subtotal = producto.price * cantidad
            total_general += subtotal
            
            resumen_lineas.append(f"- {producto.name} (x{cantidad}) ${subtotal:,.2f}")
            items_validados.append({
                "product_id": producto.id,
                "quantity": cantidad,
                "unit_price": producto.price
            })

        if not items_validados:
            return "No se pudieron reconocer productos válidos en el menú para tu pedido."

        es_retiro = metodo_entrega == "retiro"
        falta_direccion = not es_retiro and not shipping_address
        faltan_datos = metodo_entrega is None or not customer_name or falta_direccion

        resultado_json = {
            "items": items_validados,
            "total": total_general,
            "cliente": customer_name,
            "direccion": "Retiro en el local" if es_retiro else shipping_address,
            "metodo_entrega": metodo_entrega,
            "faltan_datos": faltan_datos,
        }

        texto_respuesta = "Queremos confirmar tu pedido:\n" + "\n".join(resumen_lineas) + f"\n\nTotal: ${total_general:,.2f}"

        if faltan_datos:
            faltantes = []
            if metodo_entrega is None:
                faltantes.append("si retirás por el local o te lo enviamos a domicilio")
            if not customer_name:
                faltantes.append("tu nombre")
            if falta_direccion:
                faltantes.append("tu dirección de envío")
            texto_respuesta += f"\n\n(Me falta que me digas {', '.join(faltantes)} para continuar)."
        else:
            destino = "Retirás en el local" if es_retiro else f"Envío a: {shipping_address}"
            texto_respuesta += f"\n{destino} (Cliente: {customer_name}). ¿Es correcto?"

        return json.dumps({"mensaje_para_usuario": texto_respuesta, "datos_temporales": resultado_json}, ensure_ascii=False)

    except Exception as e:
        logger.exception("Error procesando el cálculo del pedido. items_solicitados=%s", items_solicitados)
        return f"Error procesando el cálculo del pedido: {str(e)}"
    finally:
        db.close()


@tool
def confirmar_y_guardar_pedido(
    datos_pedido_json: str,
    telegram_chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Persiste definitivamente la orden en la base de datos con estado 'Pendiente'.
    Se ejecuta únicamente cuando el usuario confirma explícitamente con un 'Sí'.

    Args:
        datos_pedido_json: El objeto JSON con los items, total, nombre y dirección validados previamente.
    """
    db = SessionLocal()
    try:
        datos = json.loads(datos_pedido_json)

        metodo_entrega = datos.get("metodo_entrega")
        delivery_method = metodo_entrega if metodo_entrega in ("domicilio", "retiro") else "domicilio"
        es_retiro = delivery_method == "retiro"

        if not datos.get("cliente") or (not es_retiro and not datos.get("direccion")):
            return "Faltan datos obligatorios (nombre o dirección) para registrar la orden."

        nueva_orden = Order(
            customer_name=datos["cliente"],
            shipping_address=datos.get("direccion") or "Retiro en el local",
            total_amount=datos["total"],
            status="Pendiente",
            delivery_method=delivery_method,
            telegram_chat_id=telegram_chat_id,
        )
        db.add(nueva_orden)
        db.flush()

        for item in datos["items"]:
            db.add(
                OrderItem(
                    order_id=nueva_orden.id,
                    product_id=item["product_id"],
                    quantity=item["quantity"],
                    unit_price=item["unit_price"]
                )
            )

        db.commit()
        return f"¡Pedido confirmado y registrado con éxito! Tu número de orden es el #{nueva_orden.id}. ¡Gracias por tu compra!"
    except Exception as e:
        db.rollback()
        logger.exception("Error al guardar la orden. datos_pedido_json=%s", datos_pedido_json)
        return f"Error al guardar la orden: {str(e)}"
    finally:
        db.close()