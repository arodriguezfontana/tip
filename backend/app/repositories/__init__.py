"""Acceso a datos: las consultas a la base de cada entidad.

Los servicios piden y guardan entidades a través de los repositorios en lugar de armar consultas. Los
repositorios no confirman transacciones (eso lo decide el servicio con app.db.session.transaction) ni
aplican reglas de negocio (eso es de los modelos).
"""
