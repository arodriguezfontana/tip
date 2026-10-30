import asyncio
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.core.errors import NotFoundError
from app.models.order import DeliveryMethod, PaymentMethod
from app.models.promotion import PromotionImage
from app.models.store_config import StoreConfig
from app.schemas.order_schemas import WebOrderCreate, WebOrderItemCreate
from app.schemas.promotion_schemas import PromotionItemPayload
from app.services import order_service, promotion_service
from app.services.channels.base import ImagenParaEnviar
from app.services.tools.menu_image_tools import (
    MENSAJE_MENU_ENVIADO,
    RESULTADO_SIN_IMAGEN,
    enviar_menu_en_imagen,
)
from app.services.tools.promotion_tools import (
    MENSAJE_PROMOS_ENVIADO,
    enviar_promociones,
)
from tests.conftest import TestingSessionLocal


class CanalFalso:
    def __init__(self, resultado=True):
        self.resultado = resultado
        self.imagenes_enviadas: list[tuple[str, ImagenParaEnviar, str]] = []
        self.mensajes_enviados: list[tuple[str, str]] = []

    async def enviar_imagen(self, chat_id, imagen, pie):
        self.imagenes_enviadas.append((chat_id, imagen, pie))
        return self.resultado

    async def enviar_mensaje(self, chat_id, mensaje):
        self.mensajes_enviados.append((chat_id, mensaje))
        return self.resultado


@pytest.fixture()
def canal_falso_promos():
    canal = CanalFalso()
    with patch("app.services.tools.promotion_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.promotion_tools.obtener_canal", return_value=canal), \
         patch("app.services.tools.menu_image_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.menu_image_tools.obtener_canal", return_value=canal):
        yield canal


def test_crud_promotion(db_session, products):
    p1 = products["muzza"]
    p2 = products["coca"]

    # 1. Crear promoción
    items = [
        PromotionItemPayload(product_id=p1.id, quantity=1),
        PromotionItemPayload(product_id=p2.id, quantity=2),
    ]
    promo = promotion_service.create_promotion(
        db_session,
        name="Combo Pizzeros",
        description="1 Muzza + 2 Coca",
        price=15000.0,
        is_active=True,
        items=items,
    )
    assert promo.id is not None
    assert promo.name == "Combo Pizzeros"
    assert promo.price == Decimal("15000.00")
    assert len(promo.items) == 2
    assert promo.is_active is True

    # 2. Obtener y listar
    fetched = promotion_service.get_required_promotion(db_session, promo.id)
    assert fetched.name == "Combo Pizzeros"

    promos = promotion_service.list_promotions(db_session)
    assert any(p.id == promo.id for p in promos)

    availables = promotion_service.list_available_promotions(db_session)
    assert any(p.id == promo.id for p in availables)

    # 3. Actualizar
    updated = promotion_service.update_promotion(
        db_session,
        promotion_id=promo.id,
        name="Super Combo Pizzeros",
        description="1 Muzza + 2 Coca",
        price=16000.0,
        is_active=False,
        items=items,
    )
    assert updated.name == "Super Combo Pizzeros"
    assert updated.price == Decimal("16000.00")
    assert updated.is_active is False

    # Verificar que ya no está en disponibles
    availables_after = promotion_service.list_available_promotions(db_session)
    assert not any(p.id == promo.id for p in availables_after)

    # 4. Eliminar
    promotion_service.delete_promotion(db_session, promo.id)
    with pytest.raises(NotFoundError):
        promotion_service.get_required_promotion(db_session, promo.id)


def test_enviar_promociones_cuatro_casos(db_session, products, canal_falso_promos):
    p1 = products["muzza"]
    items = [PromotionItemPayload(product_id=p1.id, quantity=1)]
    promotion_service.create_promotion(
        db_session,
        name="Promo Dupla",
        description="Muzza",
        price=10000.0,
        is_active=True,
        items=items,
    )

    config = db_session.query(StoreConfig).first()
    if not config:
        config = StoreConfig(store_name="Pizzería Test")
        db_session.add(config)
        db_session.commit()

    # Caso 1: Ni imágenes ni link -> Texto DB
    config.promotions_link = None
    db_session.query(PromotionImage).delete()
    db_session.commit()

    res_db = asyncio.run(enviar_promociones.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert "Promo Dupla" in res_db
    assert len(canal_falso_promos.imagenes_enviadas) == 0

    # Caso 2: Solo link
    config.promotions_link = "https://instagram.com/promos"
    db_session.commit()

    res_link = asyncio.run(enviar_promociones.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_link == MENSAJE_PROMOS_ENVIADO
    assert any("https://instagram.com/promos" in msg for _, msg in canal_falso_promos.mensajes_enviados)
    assert len(canal_falso_promos.imagenes_enviadas) == 0

    # Caso 3: Solo imágenes
    config.promotions_link = None
    canal_falso_promos.mensajes_enviados.clear()
    canal_falso_promos.imagenes_enviadas.clear()

    from app.services import promotion_image_service
    promotion_image_service.add_promotion_image(db_session, b"\x89PNG\r\n\x1a\n" + b"promo-v1" * 20)

    res_img = asyncio.run(enviar_promociones.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_img == MENSAJE_PROMOS_ENVIADO
    assert len(canal_falso_promos.imagenes_enviadas) == 1
    assert "https://" not in canal_falso_promos.imagenes_enviadas[0][2]

    # Caso 4: Ambos (imágenes y link)
    config.promotions_link = "https://instagram.com/promos"
    db_session.commit()
    canal_falso_promos.mensajes_enviados.clear()
    canal_falso_promos.imagenes_enviadas.clear()

    res_both = asyncio.run(enviar_promociones.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_both == MENSAJE_PROMOS_ENVIADO
    assert len(canal_falso_promos.imagenes_enviadas) == 1
    assert "https://instagram.com/promos" in canal_falso_promos.imagenes_enviadas[0][2]
    assert any("https://instagram.com/promos" in msg for _, msg in canal_falso_promos.mensajes_enviados)


def test_enviar_menu_en_imagen_cuatro_casos(db_session, canal_falso_promos):
    from app.models.menu_image import MenuImage

    config = db_session.query(StoreConfig).first()
    if not config:
        config = StoreConfig(store_name="Pizzería Test")
        db_session.add(config)
        db_session.commit()

    # Caso 1: Ni imágenes ni link -> RESULTADO_SIN_IMAGEN
    config.menu_link = None
    db_session.query(MenuImage).delete()
    db_session.commit()

    res_fallback = asyncio.run(enviar_menu_en_imagen.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_fallback == RESULTADO_SIN_IMAGEN

    # Caso 2: Solo link
    config.menu_link = "https://menu.online.com"
    db_session.commit()

    res_link = asyncio.run(enviar_menu_en_imagen.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_link == MENSAJE_MENU_ENVIADO
    assert any("https://menu.online.com" in msg for _, msg in canal_falso_promos.mensajes_enviados)

    # Caso 3: Solo imágenes
    config.menu_link = None
    canal_falso_promos.mensajes_enviados.clear()
    canal_falso_promos.imagenes_enviadas.clear()

    from app.services import menu_image_service
    menu_image_service.add_menu_image(db_session, b"\x89PNG\r\n\x1a\n" + b"menu-v1" * 20)

    res_img = asyncio.run(enviar_menu_en_imagen.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_img == MENSAJE_MENU_ENVIADO
    assert len(canal_falso_promos.imagenes_enviadas) == 1
    assert "https://" not in canal_falso_promos.imagenes_enviadas[0][2]

    # Caso 4: Ambos (imágenes y link)
    config.menu_link = "https://menu.online.com"
    db_session.commit()
    canal_falso_promos.mensajes_enviados.clear()
    canal_falso_promos.imagenes_enviadas.clear()

    res_both = asyncio.run(enviar_menu_en_imagen.ainvoke({"canal": "whatsapp", "chat_id": "12345"}))
    assert res_both == MENSAJE_MENU_ENVIADO
    assert len(canal_falso_promos.imagenes_enviadas) == 1
    assert "https://menu.online.com" in canal_falso_promos.imagenes_enviadas[0][2]
    assert any("https://menu.online.com" in msg for _, msg in canal_falso_promos.mensajes_enviados)


def test_orden_con_promocion_y_comanda(db_session, products):
    from app.schemas.order_schemas import WebOrderItemResponse

    p1 = products["muzza"]
    p2 = products["coca"]
    p1.sector = "pizzeria"
    p2.sector = "barra"
    db_session.commit()

    items = [
        PromotionItemPayload(product_id=p1.id, quantity=2),
        PromotionItemPayload(product_id=p2.id, quantity=1),
    ]
    promo = promotion_service.create_promotion(
        db_session,
        name="Combo Familiar",
        description="2 Muzzas + 1 Coca",
        price=18000.0,
        is_active=True,
        items=items,
    )

    # Crear pedido web con la promoción
    order_req = WebOrderCreate(
        customer_name="Carlos Promo",
        customer_phone="1122334455",
        delivery_method=DeliveryMethod.PICKUP,
        shipping_address=None,
        payment_method=PaymentMethod.CASH,
        items=[
            WebOrderItemCreate(
                promotion_id=promo.id,
                quantity=1,
            )
        ],
    )
    order = order_service.create_web_order(db_session, order_req.to_request())
    assert order.id is not None
    assert order.total_amount == Decimal("18000.00")
    assert len(order.items) == 1

    item = order.items[0]
    assert item.promotion_id == promo.id
    assert item.product_id is None
    assert item.display_name == "Combo Familiar"
    # Verificar comanda_display
    assert item.comanda_display.startswith("PROMO: Combo Familiar (")
    assert "2x Pizza Muzzarella" in item.comanda_display
    assert "1x Coca-Cola" in item.comanda_display

    # Verificar sectores distribuidos en la orden
    assert "pizzeria" in order.sectors
    assert "barra" in order.sectors

    # Verificar serialización en WebOrderItemResponse
    resp = WebOrderItemResponse.from_model(item)
    assert resp.is_promotion is True
    assert len(resp.promotion_products) == 2
    assert resp.promotion_products[0].product_name == "Pizza Muzzarella"
    assert resp.promotion_products[0].quantity == 2
    assert resp.promotion_products[0].sector == "pizzeria"
    assert resp.promotion_products[1].product_name == "Coca-Cola 500ml"
    assert resp.promotion_products[1].quantity == 1
    assert resp.promotion_products[1].sector == "barra"


def test_promotion_image_upload_get_and_delete(client, db_session, products):
    p1 = products["muzza"]
    promo = promotion_service.create_promotion(
        db_session,
        name="Promo con Foto",
        description="Incluye foto opcional",
        price=10000.0,
        is_active=True,
        items=[PromotionItemPayload(product_id=p1.id, quantity=1)],
    )

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 30

    # 1. Subir imagen
    res_upload = client.put(
        f"/api/v1/promotions/{promo.id}/image",
        content=png_bytes,
        headers={"Content-Type": "image/png"},
    )
    assert res_upload.status_code == 200
    data = res_upload.json()
    assert data["image_url"].startswith(f"/promotions/{promo.id}/image?v=")

    # 2. Descargar imagen (endpoint público)
    res_get = client.get(f"/api/v1/promotions/{promo.id}/image")
    assert res_get.status_code == 200
    assert res_get.content == png_bytes
    assert res_get.headers["content-type"] == "image/png"

    # 3. Eliminar imagen
    res_del = client.delete(f"/api/v1/promotions/{promo.id}/image")
    assert res_del.status_code == 200
    assert res_del.json()["image_url"] is None

    # 4. Al consultar la imagen ya eliminada da 404
    res_get_404 = client.get(f"/api/v1/promotions/{promo.id}/image")
    assert res_get_404.status_code == 404

