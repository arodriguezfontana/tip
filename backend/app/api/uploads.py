from fastapi import HTTPException, Request
from fastapi import status as http_status

from app.models.menu import MAX_IMAGE_BYTES, MAX_IMAGE_MB

IMAGE_TOO_LARGE = f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB."


def _require_within_limit(size: int) -> None:
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=http_status.HTTP_413_CONTENT_TOO_LARGE, detail=IMAGE_TOO_LARGE)


async def image_body(request: Request) -> bytes:
    """El archivo de la imagen viaja tal cual en el cuerpo del pedido. Se corta apenas supera el máximo,
    para no leer completo un archivo enorme."""
    declared = request.headers.get("content-length", "")
    _require_within_limit(int(declared) if declared.isdigit() else 0)
    content = bytearray()
    async for chunk in request.stream():
        content += chunk
        _require_within_limit(len(content))
    return bytes(content)
