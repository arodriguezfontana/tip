import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.repositories import driver_review_repository

logger = logging.getLogger(__name__)

REVIEW_WINDOW_MINUTES = 10
THANK_YOU_MESSAGE = "¡Muchas gracias por tu calificación! Nos ayuda mucho a seguir mejorando. 🙌"
INVITATION_MESSAGE = (
    "¡Muchas gracias por tu compra! Esperamos que disfrutes tu pedido. 🎉\n\n"
    "Si querés, podés calificar la atención del repartidor del 1 al 5 y dejar un comentario opcional."
)


@dataclass
class PendingReview:
    order_id: int
    delivery_driver_id: int
    expires_at: datetime


# Mapa en memoria { "canal:chat_id": PendingReview }
_pending_reviews: dict[str, PendingReview] = {}


def _review_key(channel: str, chat_id: str) -> str:
    return f"{channel.strip().lower()}:{chat_id.strip()}"


def open_review_window(channel: str, chat_id: str, order_id: int, delivery_driver_id: int) -> None:
    """Abre la ventana de 10 minutos para recibir la reseña del repartidor."""
    key = _review_key(channel, chat_id)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=REVIEW_WINDOW_MINUTES)
    _pending_reviews[key] = PendingReview(
        order_id=order_id,
        delivery_driver_id=delivery_driver_id,
        expires_at=expires_at,
    )
    logger.info("Ventana de reseña abierta para %s (orden #%s, repartidor #%s)", key, order_id, delivery_driver_id)


def close_review_window(channel: str, chat_id: str) -> None:
    key = _review_key(channel, chat_id)
    _pending_reviews.pop(key, None)


def get_pending_review(channel: str, chat_id: str) -> PendingReview | None:
    key = _review_key(channel, chat_id)
    pending = _pending_reviews.get(key)
    if not pending:
        return None
    now = datetime.now(timezone.utc)
    if now > pending.expires_at:
        logger.info("Ventana de reseña expirada para %s", key)
        _pending_reviews.pop(key, None)
        return None
    return pending


def parse_review_message(message: str) -> tuple[int | None, str | None, bool]:
    """Parsea el mensaje del cliente en busca de calificación (1 al 5) y comentario opcional.

    Reglas:
    - Número entre 1 y 5: puntaje.
    - Números < 1 o > 5: se descartan como puntaje.
    - Si solo hay número: calificación sin comentario.
    - Si solo hay texto: comentario sin calificación.
    - Si hay número y texto: se persisten ambos.
    - Si solo hay número fuera de rango: no hay reseña válida.
    """
    cleaned = message.strip()
    if not cleaned:
        return None, None, False

    match = re.search(r"\b\d+\b", cleaned)
    rating: int | None = None
    comment: str | None = None

    if match:
        val = int(match.group(0))
        if 1 <= val <= 5:
            rating = val
            rest = (cleaned[: match.start()] + " " + cleaned[match.end() :]).strip()
            rest = re.sub(r"\s+", " ", rest).strip()
            comment = rest if rest else None
        else:
            # Número inválido: se ignora el número
            rest = (cleaned[: match.start()] + " " + cleaned[match.end() :]).strip()
            rest = re.sub(r"\s+", " ", rest).strip()
            comment = cleaned if rest else None
    else:
        rating = None
        comment = cleaned

    is_valid = (rating is not None) or (comment is not None and len(comment) > 0)
    return rating, comment, is_valid


def process_possible_review(db: Session, channel: str, chat_id: str, message: str) -> bool:
    """Intenta procesar el mensaje como una reseña si hay una ventana abierta.

    Devuelve True si el mensaje correspondió y se procesó como reseña (para no pasarlo al chat bot),
    o False si no correspondía o la ventana expiró.
    """
    pending = get_pending_review(channel, chat_id)
    if not pending:
        return False

    rating, comment, is_valid = parse_review_message(message)
    if not is_valid:
        # Se cierra la ventana sin guardar nada
        close_review_window(channel, chat_id)
        return False

    try:
        driver_review_repository.create_review(
            db=db,
            delivery_driver_id=pending.delivery_driver_id,
            order_id=pending.order_id,
            rating=rating,
            comment=comment,
        )
        logger.info(
            "Reseña guardada para repartidor #%s desde orden #%s: rating=%s, comentario=%s",
            pending.delivery_driver_id,
            pending.order_id,
            rating,
            comment,
        )
    except Exception:
        logger.exception("Error guardando reseña para orden #%s", pending.order_id)
    finally:
        close_review_window(channel, chat_id)

    return True
