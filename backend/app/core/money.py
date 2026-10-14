"""Montos de dinero: se guardan y se calculan con Decimal (dos decimales), nunca con float, para que sumas
como 0,1 + 0,2 den exactamente 0,3 y los totales no acumulen errores de redondeo."""

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import Numeric

CENTS = Decimal("0.01")

# Tipo de columna para precios y totales: hasta 99.999.999,99.
MoneyColumn = Numeric(10, 2)


def to_money(value: Decimal | float | int | str) -> Decimal:
    """Convierte a un monto con dos decimales. Los float se pasan por texto para no arrastrar su error binario
    (Decimal(0.1) es 0.1000000000000000055...)."""
    amount = value if isinstance(value, Decimal) else Decimal(str(value))
    return amount.quantize(CENTS, rounding=ROUND_HALF_UP)
