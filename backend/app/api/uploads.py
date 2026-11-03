from fastapi import HTTPException, Request
from fastapi import status as http_status

from app.models.menu import MAX_IMAGE_BYTES, MAX_IMAGE_MB

IMAGE_TOO_LARGE = f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB."


async def image_body(request: Request) -> bytes:
    """El archivo de la imagen viaja tal cual en el cuerpo del pedido. Se corta apenas supera el máximo,
    para no leer completo un archivo enorme."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=http_status.HTTP_413_CONTENT_TOO_LARGE, detail=IMAGE_TOO_LARGE)
    content = bytearray()
    async for chunk in request.stream():
        content += chunk
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=http_status.HTTP_413_CONTENT_TOO_LARGE, detail=IMAGE_TOO_LARGE)
    return bytes(content)
