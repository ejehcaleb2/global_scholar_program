from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.gsp_models import AccessType, CourseStatus
from app.schemas.content import LessonResource, LessonVideoResponse, ModuleResponse, SanitizedContentFields, SanitizedLessonFields


class AdminAuditFacetValue(BaseModel):
    value: str
    label: str


class AdminAuditFacetResponse(BaseModel):
    actions: list[AdminAuditFacetValue]
    entity_types: list[AdminAuditFacetValue]
    admins: list[AdminAuditFacetValue]


class AdminAuditLogEnvelope(BaseModel):
    items: list['AdminAuditLogResponse']
    total: int
    limit: int
    offset: int


class AdminStudentsStats(BaseModel):
    total: int
    paid: int
    free: int


class AdminSignupsStats(BaseModel):
    last_7_days: int


class AdminServiceRequestStats(BaseModel):
    pending: int
    submitted: int
    in_progress: int
    returned: int


class AdminCoursesStats(BaseModel):
    published: int
    draft: int


class AdminStatsResponse(BaseModel):
    students: AdminStudentsStats
    signups: AdminSignupsStats
    service_requests: AdminServiceRequestStats
    courses: AdminCoursesStats


class AdminAuditActor(BaseModel):
    avatar_url: str | None = None
    updated_at: datetime | None = None
    id: UUID
    full_name: str | None
    email: str


class AdminAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    action: str
    entity_type: str
    entity_id: str
    label: str | None
    actor: AdminAuditActor


AdminAuditLogEnvelope.model_rebuild()


class HomepagePostReorder(BaseModel):
    model_config = ConfigDict(extra='forbid')

    ordered_ids: list[UUID] = Field(min_length=1, max_length=3)


class PublicHomepagePostResponse(BaseModel):
    id: UUID
    title: str
    summary: str | None
    thumbnail_url: str | None
    body_html: str
    published_at: datetime


class AdminCourseSummaryResponse(SanitizedContentFields):
    id: UUID
    title: str
    summary: str | None = None
    description: str | None
    thumbnail_url: str | None = None
    learning_outcomes: list[str] = Field(default_factory=list)
    access_type: AccessType
    status: CourseStatus
    module_count: int
    lesson_count: int = 0
    duration_minutes: int = 0
    learners_started: int = 0
    learners_completed: int = 0
    structure_revision: int = 1
    updated_at: datetime | None = None


class AdminCourseDetailResponse(AdminCourseSummaryResponse):
    modules: list[ModuleResponse]


class AdminCourseListResponse(BaseModel):
    items: list[AdminCourseSummaryResponse]
    total: int
    limit: int
    offset: int


class AdminCourseFacetsResponse(BaseModel):
    all: int
    published: int
    draft: int
    free: int
    members_only: int


class AdminCourseStatsResponse(BaseModel):
    module_count: int
    lesson_count: int
    total_minutes: int
    lessons_without_duration: int
    learners_started: int
    learners_completed: int
    completion_rate: float
    average_progress: float
    last_learner_activity_at: datetime | None


class AdminCourseFunnelLesson(BaseModel):
    lesson_id: UUID
    module_id: UUID
    position: int
    title: str
    completed_count: int
    percent_of_started: float


class AdminCourseLargestDrop(BaseModel):
    from_lesson_id: UUID
    to_lesson_id: UUID
    points: float


class AdminCourseFunnelResponse(BaseModel):
    lessons: list[AdminCourseFunnelLesson]
    learners_started: int
    largest_drop: AdminCourseLargestDrop | None

class AdminCourseLearnerUser(BaseModel):
    id: UUID
    full_name: str | None
    email: str
    avatar_url: str | None

class AdminCourseLearnerItem(BaseModel):
    user: AdminCourseLearnerUser
    plan_state: Literal['paid', 'free']
    completed_lessons: int
    total_lessons: int
    percent: int
    last_activity_at: datetime | None
    status: Literal['not_started', 'in_progress', 'completed', 'inactive']

class AdminCourseLearnerFacets(BaseModel):
    not_started: int
    in_progress: int
    completed: int
    inactive: int

class AdminCourseLearnersResponse(BaseModel):
    items: list[AdminCourseLearnerItem]
    total: int
    limit: int
    offset: int
    facets: AdminCourseLearnerFacets


class AdminCourseReadinessCheck(BaseModel):
    key: str
    severity: Literal['error', 'warning']
    passed: bool
    message: str
    tab: Literal['details', 'curriculum']
    field: str | None = None
    module_id: UUID | None = None
    lesson_id: UUID | None = None


class AdminCourseReadinessResponse(BaseModel):
    course_id: UUID
    structure_revision: int
    errors: int
    warnings: int
    checks: list[AdminCourseReadinessCheck]


class AdminCourseImpactResponse(BaseModel):
    id: UUID
    title: str
    status: CourseStatus
    module_count: int
    lesson_count: int
    learners_with_progress: int
    progress_rows: int


class AdminModuleImpactResponse(BaseModel):
    id: UUID
    title: str
    lesson_count: int
    learners_with_progress: int
    progress_rows: int


class AdminLessonImpactResponse(BaseModel):
    id: UUID
    title: str
    learners_with_progress: int
    progress_rows: int


class AdminLessonVersionActor(BaseModel):
    id: UUID
    full_name: str | None


class AdminLessonVersionSummary(BaseModel):
    id: UUID
    version_no: int
    saved_at: datetime
    saved_by: AdminLessonVersionActor | None
    note: str | None
    changed_fields: list[str]


class AdminLessonVersionsResponse(BaseModel):
    items: list[AdminLessonVersionSummary]


class AdminLessonVersionDetail(AdminLessonVersionSummary, SanitizedLessonFields):
    title: str
    body_html: str
    try_it_yourself_prompt: str | None
    duration_minutes: int
    video: LessonVideoResponse | None
    resources: list[LessonResource]


class AdminLessonVersionRestoreRequest(BaseModel):
    expected_updated_at: datetime


class AdminCourseDuplicateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)


class AdminLessonOrder(BaseModel):
    id: UUID


class AdminModuleOrder(BaseModel):
    id: UUID
    lessons: list[AdminLessonOrder]


class AdminCourseStructureReorder(BaseModel):
    structure_revision: int = Field(ge=1)
    modules: list[AdminModuleOrder]


class AdminStudentResponse(BaseModel):
    avatar_url: str | None = None
    updated_at: datetime | None = None
    id: UUID
    full_name: str | None
    email: str
    membership_tier: Literal['free', 'paid']
    created_at: datetime
    school: str | None
    city: str | None


class AdminStudentDetailResponse(AdminStudentResponse):
    phone: str | None
    country: str | None
    date_of_birth: date | None
    education_level: str | None
    fields_of_study: list[str] | None
    countries_of_interest: list[str] | None
