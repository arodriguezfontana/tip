"""Traducción de los errores de negocio a respuestas HTTP, para que los routers no repitan try/except."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.errors import AuthenticationError, ConflictError, DomainError, NotFoundError, UnsupportedFileError

# Del más específico al más general: se usa el primero que corresponda a la clase del error.
_STATUS_BY_ERROR: list[tuple[type[DomainError], int]] = [
    (NotFoundError, status.HTTP_404_NOT_FOUND),
    (ConflictError, status.HTTP_409_CONFLICT),
    (AuthenticationError, status.HTTP_401_UNAUTHORIZED),
    (UnsupportedFileError, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
    (DomainError, status.HTTP_400_BAD_REQUEST),
]


def status_for(error: DomainError) -> int:
    return next(code for error_type, code in _STATUS_BY_ERROR if isinstance(error, error_type))


async def _domain_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return JSONResponse(status_code=status_for(exc), content={"detail": str(exc)})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error_handler)
