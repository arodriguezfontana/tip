### ¿Como clonar el repositorio?
```bash
git clone https://github.com/arodriguezfontana/tip
cd tip
```

### Ejecución con Docker Compose
```bash
docker compose up --build
```

### Ejecución Local
```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
# (Edita el archivo .env con tus credenciales locales de PostgreSQL)
uvicorn app.main:app --reload
```

Estará disponible en http://localhost:8000

### Arquitectura
Cada capa tiene una sola responsabilidad y solo depende de las que están debajo:

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| API (controllers) | `app/api` | HTTP: validar la entrada (schemas), llamar al servicio y armar la respuesta. Sin consultas ni reglas de negocio. Los errores de negocio se traducen a HTTP en un solo lugar (`app/api/errors.py`). |
| Schemas (DTOs) | `app/schemas` | Forma de los pedidos y respuestas de la API (Pydantic). Cada respuesta se construye con `from_model`. |
| Servicios | `app/services` | Casos de uso: orquestan repositorios y modelos y marcan la transacción con `transaction(db)`. Las tools del bot (`app/services/tools`) son otra entrada, como los routers. |
| Repositorios (DAO) | `app/repositories` | Todas las consultas a la base. No confirman transacciones ni aplican reglas de negocio. |
| Modelos (dominio) | `app/models` | Entidades con sus reglas de negocio: ciclo de vida del pedido, validación de ítems y totales, disponibilidad de productos, recetas, etc. Lanzan los errores de `app/core/errors.py`. |

Los montos de dinero se manejan con `Decimal` (`app/core/money.py`), nunca con `float`.

### Tests y lint
```bash
cd backend
pip install -r requirements-dev.txt
ruff check .
pytest
```
