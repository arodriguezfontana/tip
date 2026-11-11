import unicodedata


def sin_acentos(texto: str) -> str:
    """Elimina acentos y diacríticos para comparaciones robustas."""
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
