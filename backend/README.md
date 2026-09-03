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