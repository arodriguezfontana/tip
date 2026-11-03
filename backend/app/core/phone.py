"""Formato único de los teléfonos: así el mismo celular escrito de distintas maneras es siempre el mismo número.

Los celulares argentinos se guardan como código de área + número (10 dígitos, ej. 1162939338), sin el +54, sin el 9
de los celulares, sin el 0 inicial ni el 15. Es lo que WhatsApp entrega como "5491162939338" y lo que la gente
escribe como "011 15 6293-9338" o "+54 9 11 6293-9338".
"""

import re

# Un celular argentino sin prefijos: código de área (2 a 4 dígitos) + número, 10 dígitos en total.
_LARGO_NACIONAL = 10


def _argentino_nacional(digits: str) -> str | None:
    """El número sin prefijos si es un teléfono argentino reconocible, o None."""
    if digits.startswith("549") and len(digits) == _LARGO_NACIONAL + 3:  # 54 9 AAAANNNNNN
        return digits[3:]
    if digits.startswith("54") and len(digits) == _LARGO_NACIONAL + 2:  # 54 AAAANNNNNN
        return digits[2:]
    if len(digits) == _LARGO_NACIONAL + 1 and digits[0] in "09":  # 0 AAAANNNNNN  o  9 AAAANNNNNN
        return digits[1:]
    sin_cero = digits[1:] if digits.startswith("0") else digits
    if len(sin_cero) == _LARGO_NACIONAL + 2:  # AA 15 NNNNNNNN, AAA 15 NNNNNNN o AAAA 15 NNNNNN
        for posicion in (2, 3, 4):
            if sin_cero[posicion : posicion + 2] == "15":
                return sin_cero[:posicion] + sin_cero[posicion + 2 :]
    if len(digits) == _LARGO_NACIONAL:
        return digits
    return None


def normalize_phone(phone: str | None) -> str:
    """Teléfono en el formato único. Los números de otros países quedan con sus dígitos (y el "+" si lo traían)."""
    text = (phone or "").strip()
    digits = re.sub(r"\D", "", text)
    if not digits:
        return ""
    return _argentino_nacional(digits) or (f"+{digits}" if text.startswith("+") else digits)
