"""Impresión de comandas en impresoras térmicas de red (ESC/POS por socket RAW, puerto 9100).

Imprimir nunca debe romper el flujo del pedido: las funciones públicas devuelven un PrintResult con lo que
falló en lugar de lanzar errores.
"""

import logging
import socket
from dataclasses import dataclass
from datetime import timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.time import RESTAURANT_TZ
from app.db.session import transaction
from app.models.order import DeliveryMethod, Order, PaymentMethod
from app.models.printer import Printer
from app.repositories import printer_repository
from app.schemas.printer_schemas import PrinterConfigUpdate, PrintResult

logger = logging.getLogger(__name__)

PRINT_TIMEOUT_SECONDS = 3.0
TICKET_WIDTH = 42
ENCODING = "cp858"

ESC_INIT = b"\x1b@"
ESC_CODEPAGE_858 = b"\x1bt\x13"
ESC_BOLD_ON = b"\x1bE\x01"
ESC_BOLD_OFF = b"\x1bE\x00"
ESC_DOUBLE_ON = b"\x1d!\x11"
ESC_DOUBLE_OFF = b"\x1d!\x00"
ESC_CENTER = b"\x1ba\x01"
ESC_LEFT = b"\x1ba\x00"
CUT = b"\n\n\n\x1dV\x42\x00"

PAYMENT_LABELS = {
    PaymentMethod.CASH.value: "Efectivo",
    PaymentMethod.TRANSFER.value: "Transferencia",
    PaymentMethod.CARD.value: "Tarjeta",
    PaymentMethod.MERCADOPAGO.value: "MercadoPago",
}


class PrinterError(Exception):
    """La impresora no respondió o rechazó el trabajo."""


# --- Configuración ---------------------------------------------------------------------------------


def list_printers(db: Session) -> list[Printer]:
    return printer_repository.list_all(db)


def save_printers(db: Session, data: PrinterConfigUpdate) -> list[Printer]:
    with transaction(db):
        printer_repository.delete_all(db)
        for item in data.printers:
            printer_repository.add(db, Printer(sector=item.sector, name=item.name, host=item.host, port=item.port))
    return printer_repository.list_all(db)


def _address(printer: Printer) -> tuple[str, int]:
    return printer.host.lower(), printer.port


def resolve_sector_printers(printers: list[Printer], sectors: list[str]) -> tuple[list[tuple[str, Printer]], list[str]]:
    """(sector, impresora) de cada copia de la comanda y los sectores que no tienen ninguna.

    Sale una copia por sector del pedido. Con una sola impresora configurada todas las copias salen ahí, sin
    importar el sector. Si hay varias, cada copia sale por la impresora de su sector (que puede atender a más de uno).
    """
    distinct = {_address(p): p for p in printers}
    if len(distinct) == 1:
        only = next(iter(distinct.values()))
        return [(sector, only) for sector in sectors], []
    by_sector = {p.sector.lower(): p for p in printers}
    copies = [(sector, by_sector.get(sector.lower())) for sector in sectors]
    found = [(sector, printer) for sector, printer in copies if printer is not None]
    return found, [sector for sector, printer in copies if printer is None]


# --- Ticket ----------------------------------------------------------------------------------------


def _money(value) -> str:
    amount = Decimal(str(value or 0))
    return "$" + f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _wrap(text: str) -> list[str]:
    lines: list[str] = []
    for paragraph in (text or "").splitlines() or [""]:
        current = ""
        for word in paragraph.split():
            candidate = f"{current} {word}" if current else word
            if len(candidate) > TICKET_WIDTH and current:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
    return lines


def _row(left: str, right: str) -> str:
    space = TICKET_WIDTH - len(left) - len(right)
    if space < 1:
        return left[: max(TICKET_WIDTH - len(right) - 1, 0)] + " " + right
    return left + " " * space + right


def _local_time(moment, fmt: str) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(RESTAURANT_TZ).strftime(fmt)


def _payment_text(order: Order) -> str:
    method = PAYMENT_LABELS.get(order.payment_method or "", "Sin definir")
    return f"{method} ({'abonado' if order.is_paid else 'a cobrar'})"


def build_ticket_lines(order: Order) -> list[tuple[str, str]]:
    """Líneas de la comanda como (estilo, texto); estilo: 'title', 'bold', 'center' o 'normal'."""
    sep = "-" * TICKET_WIDTH
    lines: list[tuple[str, str]] = []
    lines.append(("title", f"PEDIDO #{order.shift_number}"))
    if order.created_at is not None:
        lines.append(("center", _local_time(order.created_at, "%d/%m/%Y %H:%M")))
    if order.scheduled_for is not None:
        lines.append(("bold", f"PROGRAMADO: {_local_time(order.scheduled_for, '%d/%m %H:%M')}"))
    lines.append(("normal", sep))
    is_delivery = order.delivery_method == DeliveryMethod.DELIVERY.value
    lines.append(("bold", f"ENTREGA: {'ENVIO A DOMICILIO' if is_delivery else 'RETIRO EN EL LOCAL'}"))
    lines.append(("normal", f"Cliente: {order.customer_name}"))
    if order.customer_phone:
        lines.append(("normal", f"Telefono: {order.customer_phone}"))
    if is_delivery:
        lines.extend(("normal", line) for line in _wrap(f"Direccion: {order.shipping_address}"))
    lines.append(("normal", sep))
    for item in order.items:
        lines.extend(("bold", line) for line in _wrap(f"{item.quantity} x {item.comanda_display}"))
        lines.append(("normal", _row("", _money(item.subtotal))))
    lines.append(("normal", sep))
    if order.notes:
        lines.append(("bold", "OBSERVACIONES:"))
        lines.extend(("normal", line) for line in _wrap(order.notes))
        lines.append(("normal", sep))
    lines.append(("bold", _row("TOTAL", _money(order.total_amount))))
    lines.append(("normal", f"Pago: {_payment_text(order)}"))
    return lines


def render_ticket(order: Order) -> bytes:
    out = bytearray(ESC_INIT + ESC_CODEPAGE_858)
    for style, text in build_ticket_lines(order):
        data = text.encode(ENCODING, "replace") + b"\n"
        if style == "title":
            out += ESC_CENTER + ESC_DOUBLE_ON + ESC_BOLD_ON + data + ESC_DOUBLE_OFF + ESC_BOLD_OFF + ESC_LEFT
        elif style == "center":
            out += ESC_CENTER + data + ESC_LEFT
        elif style == "bold":
            out += ESC_BOLD_ON + data + ESC_BOLD_OFF
        else:
            out += data
    out += CUT
    return bytes(out)


# --- Envío -----------------------------------------------------------------------------------------


def send_to_printer(host: str, port: int, payload: bytes) -> None:
    try:
        with socket.create_connection((host, port), timeout=PRINT_TIMEOUT_SECONDS) as conn:
            conn.settimeout(PRINT_TIMEOUT_SECONDS)
            conn.sendall(payload)
    except (OSError, ValueError) as exc:
        raise PrinterError(f"{host}:{port} no responde ({exc.__class__.__name__}).") from exc


@dataclass
class PrintJob:
    printer_name: str
    host: str
    port: int
    payload: bytes


def plan_print(db: Session, order: Order) -> tuple[list[PrintJob], list[str]]:
    """Arma las copias de la comanda de un pedido (una por sector) y los problemas que impiden imprimir alguna.

    Se separa del envío para poder armar el ticket con la sesión de la base y mandarlo después, sin tocar la base.
    """
    printers = list_printers(db)
    if not printers:
        return [], ["No hay impresoras configuradas."]
    copies, missing = resolve_sector_printers(printers, order.sectors or ["cocina"])
    errors = [f"No hay impresora configurada para el sector {sector}." for sector in missing]
    ticket = render_ticket(order)
    jobs = [PrintJob(p.name, p.host, p.port, ticket) for _sector, p in copies]
    return jobs, errors


def run_print_jobs(jobs: list[PrintJob], errors: list[str] | None = None) -> PrintResult:
    """Envía las comandas a sus impresoras. Nunca lanza: informa lo que falló en el resultado."""
    errors = list(errors or [])
    for job in jobs:
        try:
            send_to_printer(job.host, job.port, job.payload)
        except PrinterError as exc:
            logger.warning("Falló la impresión en %s: %s", job.printer_name, exc)
            errors.append(f"{job.printer_name}: {exc}")
    if errors:
        return PrintResult(success=False, message=" ".join(errors), errors=errors)
    return PrintResult(success=True)


def print_order(db: Session, order: Order) -> PrintResult:
    """Manda una copia de la comanda a la impresora de cada sector del pedido. Nunca lanza: informa los errores en el resultado."""
    try:
        jobs, errors = plan_print(db, order)
        return run_print_jobs(jobs, errors)
    except Exception as exc:  # imprimir jamás debe afectar al pedido
        logger.exception("Error inesperado al imprimir el pedido %s.", getattr(order, "id", "?"))
        return PrintResult(success=False, message=str(exc), errors=[str(exc)])


def print_order_in_background(background_tasks, db: Session, order: Order) -> None:
    """Para pedidos que entran solos (web): el cliente no espera a la impresora. Un fallo queda en el log."""
    try:
        jobs, errors = plan_print(db, order)
    except Exception:
        logger.exception("No se pudo armar la comanda del pedido %s.", getattr(order, "id", "?"))
        return
    background_tasks.add_task(run_print_jobs, jobs, errors)


def print_test_page(host: str, port: int) -> PrintResult:
    payload = (
        ESC_INIT
        + ESC_CODEPAGE_858
        + ESC_CENTER
        + ESC_BOLD_ON
        + b"PRUEBA DE IMPRESION\n"
        + ESC_BOLD_OFF
        + b"La impresora esta vinculada correctamente.\n"
        + ESC_LEFT
        + CUT
    )
    try:
        send_to_printer(host, port, payload)
    except PrinterError as exc:
        return PrintResult(success=False, message=str(exc), errors=[str(exc)])
    return PrintResult(success=True)
