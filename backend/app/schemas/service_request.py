from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.gsp_models import ServiceStatus, ServiceType


class ServiceRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    service_type: ServiceType
    status: ServiceStatus
    created_at: datetime


class ServiceRequestAdminResponse(ServiceRequestResponse):
    user_id: UUID
    student: 'ServiceRequestStudent'


class ServiceRequestStudent(BaseModel):
    id: UUID
    full_name: str | None
    email: str


class ServiceRequestStatusUpdate(BaseModel):
    status: ServiceStatus


class ServiceRequestEventResponse(BaseModel):
    from_status: ServiceStatus | None
    to_status: ServiceStatus
    changed_at: datetime
    actor: ServiceRequestStudent


class ServiceRequestDetailResponse(ServiceRequestAdminResponse):
    has_document: bool
    events: list[ServiceRequestEventResponse]
