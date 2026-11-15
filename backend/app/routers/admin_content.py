from app.schemas.pagination import PageResponse
"""Register admin content endpoints in their original matching order."""

from ._admin_content_common import (
    AdminCourseDetailResponse,
    AdminCourseFacetsResponse,
    AdminCourseFunnelResponse,
    AdminCourseImpactResponse,
    AdminCourseLearnersResponse,
    AdminCourseListResponse,
    AdminCourseReadinessResponse,
    AdminCourseStatsResponse,
    AdminCourseSummaryResponse,
    AdminLessonImpactResponse,
    AdminLessonVersionDetail,
    AdminLessonVersionsResponse,
    AdminModuleImpactResponse,
    LessonResponse,
    MasterclassResponse,
    ModuleResponse,
    OpportunityResponse,
    ResourceResponse,
    router,
    status,
)
from ._admin_content_courses import (
    list_admin_courses,
    get_admin_course_facets,
    get_admin_course,
    publish_admin_course,
    unpublish_admin_course,
    duplicate_admin_course,
    create_course,
    update_course,
    delete_course,
)

from ._admin_content_analytics import (
    get_admin_course_stats,
    get_admin_course_funnel,
    get_admin_course_learners,
    get_admin_course_impact,
    get_admin_module_impact,
    get_admin_lesson_impact,
    get_admin_course_readiness,
)

from ._admin_content_structure import (
    reorder_admin_course_structure,
    create_module,
    update_module,
    delete_module,
)

from ._admin_content_resources import (
    list_admin_resources,
    create_resource,
    update_resource,
    delete_resource,
)

from ._admin_content_opportunities import (
    list_admin_opportunities,
    create_opportunity,
    update_opportunity,
    delete_opportunity,
)

from ._admin_content_masterclasses import (
    list_admin_masterclasses,
    create_masterclass,
    update_masterclass,
    delete_masterclass,
)

from ._admin_content_lessons import (
    create_lesson,
    update_lesson,
    list_lesson_versions,
    get_lesson_version,
    restore_lesson_version,
    duplicate_lesson,
    delete_lesson,
)


router.get('/courses', response_model=list[AdminCourseSummaryResponse] | AdminCourseListResponse)(list_admin_courses)
router.get('/courses/facets', response_model=AdminCourseFacetsResponse)(get_admin_course_facets)
router.get('/courses/{course_id}/stats', response_model=AdminCourseStatsResponse)(get_admin_course_stats)
router.get('/courses/{course_id}/funnel', response_model=AdminCourseFunnelResponse)(get_admin_course_funnel)
router.get('/courses/{course_id}/learners', response_model=AdminCourseLearnersResponse)(get_admin_course_learners)
router.get('/courses/{course_id}', response_model=AdminCourseDetailResponse)(get_admin_course)
router.get('/impact/course/{course_id}', response_model=AdminCourseImpactResponse)(get_admin_course_impact)
router.get('/impact/module/{module_id}', response_model=AdminModuleImpactResponse)(get_admin_module_impact)
router.get('/impact/lesson/{lesson_id}', response_model=AdminLessonImpactResponse)(get_admin_lesson_impact)
router.get('/courses/{course_id}/readiness', response_model=AdminCourseReadinessResponse)(get_admin_course_readiness)
router.post('/courses/{course_id}/publish', response_model=AdminCourseSummaryResponse)(publish_admin_course)
router.post('/courses/{course_id}/unpublish', response_model=AdminCourseSummaryResponse)(unpublish_admin_course)
router.post('/courses/{course_id}/duplicate', response_model=AdminCourseSummaryResponse, status_code=status.HTTP_201_CREATED)(duplicate_admin_course)
router.post('/courses/{course_id}/structure/reorder', response_model=AdminCourseDetailResponse)(reorder_admin_course_structure)
router.get('/resources', response_model=list[ResourceResponse] | PageResponse[ResourceResponse])(list_admin_resources)
router.get('/opportunities', response_model=list[OpportunityResponse] | PageResponse[OpportunityResponse])(list_admin_opportunities)
router.get('/masterclasses', response_model=list[MasterclassResponse] | PageResponse[MasterclassResponse])(list_admin_masterclasses)
router.post('/courses', response_model=AdminCourseSummaryResponse, status_code=status.HTTP_201_CREATED)(create_course)
router.patch('/courses/{course_id}', response_model=AdminCourseSummaryResponse)(update_course)
router.delete('/courses/{course_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_course)
router.post('/courses/{course_id}/modules', response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)(create_module)
router.patch('/courses/{course_id}/modules/{module_id}', response_model=ModuleResponse)(update_module)
router.delete('/courses/{course_id}/modules/{module_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_module)
router.post('/modules/{module_id}/lessons', response_model=LessonResponse, status_code=status.HTTP_201_CREATED)(create_lesson)
router.patch('/modules/{module_id}/lessons/{lesson_id}', response_model=LessonResponse)(update_lesson)
router.get('/lessons/{lesson_id}/versions', response_model=AdminLessonVersionsResponse)(list_lesson_versions)
router.get('/lessons/{lesson_id}/versions/{version_id}', response_model=AdminLessonVersionDetail)(get_lesson_version)
router.post('/lessons/{lesson_id}/versions/{version_id}/restore', response_model=LessonResponse)(restore_lesson_version)
router.post('/lessons/{lesson_id}/duplicate', response_model=LessonResponse, status_code=status.HTTP_201_CREATED)(duplicate_lesson)
router.delete('/modules/{module_id}/lessons/{lesson_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_lesson)
router.post('/resources', response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)(create_resource)
router.patch('/resources/{resource_id}', response_model=ResourceResponse)(update_resource)
router.delete('/resources/{resource_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_resource)
router.post('/opportunities', response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)(create_opportunity)
router.patch('/opportunities/{opportunity_id}', response_model=OpportunityResponse)(update_opportunity)
router.delete('/opportunities/{opportunity_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_opportunity)
router.post('/masterclasses', response_model=MasterclassResponse, status_code=status.HTTP_201_CREATED)(create_masterclass)
router.patch('/masterclasses/{masterclass_id}', response_model=MasterclassResponse)(update_masterclass)
router.delete('/masterclasses/{masterclass_id}', status_code=status.HTTP_204_NO_CONTENT)(delete_masterclass)
