# TIP - RestoIT

Sistema integral para gestión de gastronomía (Backend en FastAPI + Frontend en React/Vite + Base de Datos PostgreSQL).

---

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

Backend
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

Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

La API estará disponible en http://localhost:8000 y el Frontend en http://localhost:5173