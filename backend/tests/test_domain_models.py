"""Reglas de negocio de los modelos, probadas sin base de datos ni HTTP."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.api.errors import status_for
from app.core.errors import BusinessRuleError, ConflictError, DomainError, NotFoundError
from app.models.menu import (
    MAX_IMAGE_BYTES,
    Category,
    Ingredient,
    IngredientInUseError,
    InvalidImageError,
    InvalidRecipeError,
    Product,
    ProductImage,
    ProductIngredient,
)
from app.models.order import (
    MAX_QUANTITY_PER_ITEM,
    PICKUP_ADDRESS,
    InvalidOrderError,
    InvalidTransitionError,
    Order,
    OrderStatus,
    ScheduledOrderEstimateError,
)


def _product(id_=1, name="Muzza", price=8500.0, active=True, category_id=1) -> Product:
    return Product(id=id_, name=name, price=price, is_active=active, category_id=category_id)


# --- Pedido: productos y total ------------------------------------------------------------------------


def test_los_montos_se_calculan_sin_errores_de_redondeo():
    """Con float, 0.1 + 0.2 da 0.30000000000000004: los montos se manejan con Decimal a centavos."""
    order = Order()

    order.set_items([(_product(1, "Caramelo", 0.1), 1), (_product(2, "Chicle", 0.2), 1)])

    assert order.total_amount == Decimal("0.30")
    assert _product(price=8500.555).price == Decimal("8500.56")


def test_el_pedido_suma_las_lineas_de_un_mismo_producto_y_calcula_el_total():
    muzza, coca = _product(1, "Muzza", 8500.0), _product(2, "Coca", 2500.0)
    order = Order(shipping_cost=1000)

    order.set_items([(muzza, 1), (coca, 2), (muzza, 2)])

    assert [(item.product_id, item.quantity, item.unit_price) for item in order.items] == [(1, 3, 8500.0), (2, 2, 2500.0)]
    assert order.subtotal == 3 * 8500 + 2 * 2500
    assert order.total_amount == order.subtotal + 1000


@pytest.mark.parametrize(
    "lineas,mensaje",
    [
        ([], "El pedido no tiene productos."),
        ([(_product(), 0)], "Hay una cantidad inválida en el pedido."),
        ([(_product(active=False), 1)], "no están disponibles en este momento: Muzza"),
        ([(_product(category_id=None), 1)], "no están disponibles en este momento: Muzza"),
        ([(_product(), MAX_QUANTITY_PER_ITEM + 1)], f"cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: Muzza"),
    ],
)
def test_el_pedido_valida_sus_productos(lineas, mensaje):
    with pytest.raises(InvalidOrderError, match=mensaje.replace("(", r"\(").replace(")", r"\)")):
        Order().set_items(lineas)


def test_un_retiro_usa_la_direccion_del_local_y_un_envio_exige_direccion():
    order = Order()
    order.set_delivery("retiro", None)
    assert (order.delivery_method, order.shipping_address) == ("retiro", PICKUP_ADDRESS)

    with pytest.raises(InvalidOrderError, match="La dirección es obligatoria"):
        order.set_delivery("domicilio", "   ")


def test_los_rechazados_y_cancelados_no_cuentan_como_venta():
    assert Order(status=OrderStatus.CONFIRMED.value).is_billable
    assert Order(status=OrderStatus.COMPLETED.value).is_billable
    assert not Order(status=OrderStatus.REJECTED.value).is_billable
    assert not Order(status=OrderStatus.CANCELLED.value).is_billable


# --- Pedido: ciclo de vida ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "actual,nuevo",
    [("Pendiente", "Finalizado"), ("Confirmado", "Pendiente"), ("Finalizado", "Rechazado"), ("Rechazado", "Confirmado")],
)
def test_no_permite_transiciones_fuera_del_ciclo_de_vida(actual, nuevo):
    order = Order(status=actual)

    with pytest.raises(InvalidTransitionError, match=f"No se puede pasar de '{actual}' a '{nuevo}'"):
        order.transition_to(nuevo, estimated_minutes=None, current_delay_minutes=15)
    assert order.status == actual


def test_al_confirmar_sin_demora_usa_la_demora_actual_del_local():
    order = Order(status="Pendiente")

    order.transition_to(OrderStatus.CONFIRMED, estimated_minutes=None, current_delay_minutes=21)

    assert (order.status, order.estimated_minutes) == ("Confirmado", 21)


def test_al_confirmar_respeta_la_demora_indicada():
    order = Order(status="Pendiente")

    order.transition_to("Confirmado", estimated_minutes=40, current_delay_minutes=21)

    assert order.estimated_minutes == 40


def test_los_programados_no_llevan_demora():
    order = Order(status="Pendiente", scheduled_for=datetime(2026, 10, 14, 21, tzinfo=timezone.utc))

    with pytest.raises(ScheduledOrderEstimateError):
        order.transition_to("Confirmado", estimated_minutes=30, current_delay_minutes=15)

    order.transition_to("Confirmado", estimated_minutes=None, current_delay_minutes=15)
    assert (order.status, order.estimated_minutes) == ("Confirmado", None)


# --- Catálogo -----------------------------------------------------------------------------------------


def test_la_categoria_mueve_los_productos_nuevos_y_suelta_los_que_se_quitan():
    pizzas, bebidas = Category(id=1, name="Pizzas"), Category(id=2, name="Bebidas")
    muzza, coca = _product(1, "Muzza"), _product(2, "Coca")
    muzza.category, coca.category = pizzas, pizzas

    bebidas.replace_products([coca])
    pizzas.replace_products([])

    assert muzza.category is None
    assert coca.category is bebidas
    assert pizzas.products == []


def test_el_precio_del_producto_tiene_que_ser_positivo():
    with pytest.raises(BusinessRuleError, match="mayor a cero"):
        _product().update_details("Muzza", "La clásica", 0, Category(id=1, name="Pizzas"), True, [])


def test_la_imagen_se_valida_por_su_contenido():
    assert ProductImage.content_type_of(b"\x89PNG\r\n\x1a\n...") == "image/png"
    assert ProductImage.content_type_of(b"\xff\xd8\xff\xe0...") == "image/jpeg"
    with pytest.raises(InvalidImageError, match="JPG o PNG"):
        ProductImage.content_type_of(b"GIF89a...")
    with pytest.raises(InvalidImageError, match="5 MB"):
        ProductImage.content_type_of(b"\x89PNG\r\n\x1a\n" + b"\x00" * MAX_IMAGE_BYTES)


def test_la_receta_no_admite_ingredientes_repetidos_ni_cantidades_no_positivas():
    product, harina = _product(), Ingredient(id=1, name="Harina", unit="gramos")

    with pytest.raises(InvalidRecipeError, match="más de una vez"):
        product.replace_recipe([(harina, 100), (harina, 50)])
    with pytest.raises(InvalidRecipeError, match="mayores a cero"):
        product.replace_recipe([(harina, 0)])


def test_un_ingrediente_usado_en_una_receta_no_se_puede_borrar():
    harina = Ingredient(id=1, name="Harina", unit="gramos")
    ProductIngredient(product=_product(name="Fainá"), ingredient=harina, quantity=100)

    with pytest.raises(IngredientInUseError, match="receta de: Fainá"):
        harina.ensure_can_be_deleted()


# --- Traducción de errores a HTTP ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "error,codigo",
    [
        (NotFoundError("x"), 404),
        (ConflictError("x"), 409),
        (InvalidTransitionError("Pendiente", "Finalizado"), 409),
        (InvalidImageError("x"), 415),
        (InvalidOrderError("x"), 400),
        (DomainError("x"), 400),
    ],
)
def test_cada_error_de_negocio_tiene_su_codigo_http(error, codigo):
    assert status_for(error) == codigo
