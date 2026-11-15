from datetime import datetime
from app.schemas.content import ResourceResponse, OpportunityResponse
from app.schemas.masterclass import MasterclassResponse


class AdminResourceResponse(ResourceResponse):
    updated_at: datetime


class AdminOpportunityResponse(OpportunityResponse):
    updated_at: datetime


class AdminMasterclassResponse(MasterclassResponse):
    updated_at: datetime
