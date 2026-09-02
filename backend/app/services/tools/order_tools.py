"""Tools de LangChain para analizar, calcular y persistir pedidos de forma exacta."""

import json
from langchain_core.tools import tool
from app.db.session import SessionLocal
from app.modules.menu import Product
from app.modules.order import Order, OrderItem


@tool
def calcular_y_preparar_pedido(items_solicitados: str, customer_name: str | None = None, shipping_address: str | None = None) -> str:
    """Calcula de forma exacta el total de un pedido consultando los precios reales en la base de datos.
    Debe llamarse cuando el cliente mencione qué quiere comer.
    
    Args:
        items_solicitados: Un JSON string con una lista de diccionarios con el nombre del producto 
                           (o parte de él) y la cantidad deseada. Ej: '[{"nombre": "muzzarella", "cantidad": 1}, {"nombre": "agua", "cantidad": 2}]'
        customer_name: Nombre del cliente (si ya lo dio).
        shipping_address: Dirección de envío (si ya la dio).
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

        resultado_json = {
            "items": items_validados,
            "total": total_general,
            "cliente": customer_name,
            "direccion": shipping_address,
            "faltan_datos": not customer_name or not shipping_address
        }

        texto_respuesta = "Queremos confirmar tu pedido:\n" + "\n".join(resumen_lineas) + f"\n\nTotal: ${total_general:,.2f}"
        
        if not customer_name or not shipping_address:
            texto_respuesta += "\n\n(Falta que me digas tu nombre y tu dirección de envío para continuar)."
        else:
            texto_respuesta += f"\nEnvío a: {shipping_address} (Cliente: {customer_name}). ¿Es correcto?"

        return json.dumps({"mensaje_para_usuario": texto_respuesta, "datos_temporales": resultado_json}, ensure_ascii=False)

    except Exception as e:
        return f"Error procesando el cálculo del pedido: {str(e)}"
    finally:
        db.close()


@tool
def confirmar_y_guardar_pedido(datos_pedido_json: str) -> str:
    """Persiste definitivamente la orden en la base de datos con estado 'Pendiente'.
    Se ejecuta únicamente cuando el usuario confirma explícitamente con un 'Sí'.
    
    Args:
        datos_pedido_json: El objeto JSON con los items, total, nombre y dirección validados previamente.
    """
    db = SessionLocal()
    try:
        datos = json.loads(datos_pedido_json)
        
        if not datos.get("cliente") or not datos.get("direccion"):
            return "Faltan datos obligatorios (nombre o dirección) para registrar la orden."

        nueva_orden = Order(
            customer_name=datos["cliente"],
            shipping_address=datos["direccion"],
            total_amount=datos["total"],
            status="Pendiente"
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
        return f"Error al guardar la orden: {str(e)}"
    finally:
        db.close()