"""US-57: Calificación y Reseñas de Repartidores Post-Entrega."""
from datetime import datetime, timedelta, timezone

from app.models.delivery_driver import DeliveryDriver
from app.models.order import DeliveryMethod, Order, OrderStatus
from app.repositories import driver_review_repository
from app.services import delivery_review_service, order_notification_service


def test_parse_review_message():
    # Solo número válido (1-5)
    rating, comment, is_valid = delivery_review_service.parse_review_message("5")
    assert is_valid is True
    assert rating == 5
    assert comment is None

    # Número y comentario
    rating, comment, is_valid = delivery_review_service.parse_review_message("4 Muy rápido y amable")
    assert is_valid is True
    assert rating == 4
    assert comment == "Muy rápido y amable"

    # Solo comentario (sin número)
    rating, comment, is_valid = delivery_review_service.parse_review_message("Excelente servicio, llegó caliente")
    assert is_valid is True
    assert rating is None
    assert comment == "Excelente servicio, llegó caliente"

    # Número fuera de rango (< 1 o > 5) solo: se ignora el número y queda inválido
    rating, comment, is_valid = delivery_review_service.parse_review_message("7")
    assert is_valid is False
    assert rating is None

    rating, comment, is_valid = delivery_review_service.parse_review_message("0")
    assert is_valid is False
    assert rating is None

    # Número fuera de rango con texto: se ignora como puntaje pero se toma como comentario
    rating, comment, is_valid = delivery_review_service.parse_review_message("7 tardó mucho")
    assert is_valid is True
    assert rating is None
    assert comment == "7 tardó mucho"


def test_review_window_expires_after_10_minutes():
    delivery_review_service.open_review_window("whatsapp", "+549111111", order_id=10, delivery_driver_id=1)

    # Dentro de la ventana
    pending = delivery_review_service.get_pending_review("whatsapp", "+549111111")
    assert pending is not None
    assert pending.order_id == 10
    assert pending.delivery_driver_id == 1

    # Simular expiración (> 10 minutos)
    pending.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    expired = delivery_review_service.get_pending_review("whatsapp", "+549111111")
    assert expired is None


def test_process_possible_review_saves_to_db(db_session):
    driver = DeliveryDriver(name="Pablo Delivery", phone="+5491155554444")
    db_session.add(driver)
    db_session.commit()

    order = Order(
        customer_name="Juan Perez",
        shipping_address="Calle 123",
        delivery_method=DeliveryMethod.DELIVERY.value,
        delivery_driver_id=driver.id,
        status=OrderStatus.COMPLETED.value,
        total_amount=1000,
        paid_amount=1000,
        is_paid=True,
    )
    db_session.add(order)
    db_session.commit()

    delivery_review_service.open_review_window("whatsapp", "+5491122223333", order.id, driver.id)

    # Cliente responde con calificación y comentario
    result = delivery_review_service.process_possible_review(
        db_session, "whatsapp", "+5491122223333", "5 Excelente atención"
    )
    assert result is True

    # Verificar persistencia en base de datos
    reviews = driver_review_repository.get_driver_reviews(db_session, driver.id)
    assert len(reviews) == 1
    assert reviews[0].rating == 5
    assert reviews[0].comment == "Excelente atención"
    assert reviews[0].order_id == order.id

    # La ventana queda cerrada
    assert delivery_review_service.get_pending_review("whatsapp", "+5491122223333") is None

    # Estadísticas del repartidor
    avg_r, count_r, total = driver_review_repository.get_driver_rating_stats(db_session, driver.id)
    assert avg_r == 5.0
    assert count_r == 1
    assert total == 1


def test_invitation_message_on_completed_delivery(db_session):
    driver = DeliveryDriver(name="Marcos", phone="+5491199998888")
    db_session.add(driver)
    db_session.commit()

    order = Order(
        customer_name="Ana Gomez",
        shipping_address="Av 456",
        delivery_method=DeliveryMethod.DELIVERY.value,
        delivery_driver_id=driver.id,
        status=OrderStatus.COMPLETED.value,
        total_amount=500,
        paid_amount=500,
        is_paid=True,
    )
    db_session.add(order)
    db_session.commit()

    msg = order_notification_service.build_status_message(order, OrderStatus.COMPLETED)
    assert msg == delivery_review_service.INVITATION_MESSAGE
    assert "calificar la atención del repartidor del 1 al 5" in msg


def test_api_driver_reviews_endpoint(client, db_session):
    driver = DeliveryDriver(name="Sofia Moto", phone="+5491177778888")
    db_session.add(driver)
    db_session.commit()

    order = Order(
        customer_name="Lucas",
        shipping_address="Belgrano 789",
        delivery_method=DeliveryMethod.DELIVERY.value,
        delivery_driver_id=driver.id,
        status=OrderStatus.COMPLETED.value,
        total_amount=2000,
        paid_amount=2000,
        is_paid=True,
    )
    db_session.add(order)
    db_session.commit()

    driver_review_repository.create_review(
        db_session,
        delivery_driver_id=driver.id,
        order_id=order.id,
        rating=4,
        comment="Llegó a tiempo y caliente",
    )

    # Listado de repartidores incluye promedio
    res_list = client.get("/api/v1/delivery-drivers")
    assert res_list.status_code == 200
    drivers_data = res_list.json()
    driver_item = next(d for d in drivers_data if d["id"] == driver.id)
    assert driver_item["rating_average"] == 4.0
    assert driver_item["ratings_count"] == 1
    assert driver_item["reviews_count"] == 1

    # Endpoint de reseñas del repartidor
    res_reviews = client.get(f"/api/v1/delivery-drivers/{driver.id}/reviews")
    assert res_reviews.status_code == 200
    data = res_reviews.json()
    assert data["driver_id"] == driver.id
    assert data["driver_name"] == "Sofia Moto"
    assert data["rating_average"] == 4.0
    assert data["delivered_orders_count"] == 1
    assert len(data["reviews"]) == 1
    assert data["reviews"][0]["rating"] == 4
    assert data["reviews"][0]["comment"] == "Llegó a tiempo y caliente"
    # Reseña anónima: no expone customer_name ni teléfono
    assert "customer_name" not in data["reviews"][0]
    assert "phone" not in data["reviews"][0]
