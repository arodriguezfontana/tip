#!/bin/sh
set -e
alembic upgrade head
# Carga inicial (admin, configuración, menú). Solo si RUN_SEED=1; es idempotente.
if [ "$RUN_SEED" = "1" ]; then
    python -m app.db.seed
fi
exec "$@"
