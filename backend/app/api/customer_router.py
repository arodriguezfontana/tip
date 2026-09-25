from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_customer
from app.db.session import get_db
from app.modules.user import User
from app.schemas.customer_schemas import CustomerProfileResponse, CustomerProfileUpdate
from app.services.auth_service import update_customer_profile

router = APIRouter()


@router.get("/me", response_model=CustomerProfileResponse)
def read_profile(current_customer: User = Depends(get_current_customer)) -> User:
    """Datos personales guardados en la cuenta del cliente."""
    return current_customer


@router.put("/me", response_model=CustomerProfileResponse)
def update_profile(
    payload: CustomerProfileUpdate,
    db: Session = Depends(get_db),
    current_customer: User = Depends(get_current_customer),
) -> User:
    """Actualiza los datos personales que se usan para autocompletar los pedidos."""
    return update_customer_profile(db, current_customer, payload)
