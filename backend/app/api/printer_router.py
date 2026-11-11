from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.printer_schemas import PrinterConfig, PrinterConfigUpdate, PrinterTestPayload, PrintResult
from app.services import printer_service

router = APIRouter()


@router.get("", response_model=list[PrinterConfig])
def list_printers(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[PrinterConfig]:
    """Impresoras de comandas vinculadas a cada sector de preparación."""
    return [PrinterConfig.model_validate(p) for p in printer_service.list_printers(db)]


@router.put("", response_model=list[PrinterConfig])
def save_printers(
    payload: PrinterConfigUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[PrinterConfig]:
    """Reemplaza la configuración de impresoras (una por sector)."""
    return [PrinterConfig.model_validate(p) for p in printer_service.save_printers(db, payload)]


@router.post("/test", response_model=PrintResult)
def test_printer(
    payload: PrinterTestPayload,
    _admin: User = Depends(get_current_admin),
) -> PrintResult:
    """Imprime una página de prueba para verificar que la impresora responde."""
    return printer_service.print_test_page(payload.host, payload.port)
