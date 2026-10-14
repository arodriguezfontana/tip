"""Errores de negocio de la aplicación.

Los lanzan los modelos y los servicios con un mensaje pensado para mostrarle al usuario. No saben nada de
HTTP: la capa API los traduce a respuestas en un solo lugar (ver app/api/errors.py).
"""


class DomainError(Exception):
    """Operación inválida según las reglas del negocio."""


class BusinessRuleError(DomainError):
    """Los datos son válidos en forma pero no cumplen una regla del negocio (ej. un producto agotado)."""


class NotFoundError(DomainError):
    """El recurso pedido no existe."""


class ConflictError(DomainError):
    """La operación choca con el estado actual de los datos (ej. un nombre repetido)."""


class AuthenticationError(DomainError):
    """Credenciales inválidas o usuario sin acceso."""


class UnsupportedFileError(DomainError):
    """El archivo enviado no tiene un formato aceptado o es demasiado pesado."""
