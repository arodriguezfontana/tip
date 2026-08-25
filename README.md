# tip

Backend

git clone https://github.com/arodriguezfontana/tip
cd tip/backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

DB
Crear DB local tip en PostgreSQL
Pasar .env.example a .env con credenciales

Ejecutar
uvicorn app.main:app --reload

Frontend