from __future__ import annotations

import asyncio
import argparse
import io
import json
import secrets
import os
import re
import sys
import struct
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import dotenv_values

from fastapi import UploadFile
from fastapi.datastructures import Headers
from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.legal import LEGAL_VERSIONS
from app.core.content import sanitize_html, write_audit_log  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.core.storage import storage_backend  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.gsp_models import (  # noqa: E402
    AccessType,
    Consent,
    ConsentType,
    Course,
    CourseStatus,
    EducationLevel,
    HomepagePost,
    HomepageStatus,
    Lesson,
    Masterclass,
    Module,
    Opportunity,
    Profile,
    Resource,
    ResourceStatus,
    ServiceRequest,
    ServiceRequestEvent,
    ServiceStatus,
    ServiceType,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    User,
    UserRole,
)

NOW = datetime.now(timezone.utc)

LESSON_BODY = {
    "What Is Global College Admissions?": (
        "Global college admissions is the process universities use to understand an applicant's academic preparation, context, interests, and potential contribution. "
        "Unlike a single examination, it usually combines school records, recommendations, essays, activities, and sometimes test scores.",
        "For a student in Cameroon, context matters. A university may consider the curriculum available at your school, the grading system you followed, and the responsibilities you carried alongside your studies. "
        "Your task is to present a clear, honest picture of what you have done and why the institution is a sensible next step.",
    ),
    "The College Admissions Cycle": (
        "The admissions cycle normally starts months before an application deadline. Students research universities, build a balanced list, prepare required tests, request recommendations, draft essays, and submit financial-aid materials.",
        "Create a backwards calendar from each deadline. Include time for school documents, passport or identification requirements, referee reminders, fee waivers, and a final review of time-zone cutoffs. "
        "A calm sequence is more reliable than trying to complete every application in the final week.",
    ),
    "What Do You Need to Apply?": (
        "Most applications require an academic transcript, a list of activities, personal information, essays, and one or more recommendations. Some programmes also request test scores, a portfolio, an interview, or proof of English proficiency.",
        "Requirements differ by university and programme, so build a checklist from the official admissions page rather than from a general blog. "
        "Keep digital copies of translated documents and ask your school early how transcripts and predicted grades will be issued.",
    ),
    "Terminology and Definitions": (
        "Terms such as early action, regular decision, demonstrated need, need-blind, reach, match, and likely describe different parts of the application process. "
        "Understanding them prevents a deadline or funding detail from being misunderstood.",
        "When you meet an unfamiliar term, write down the university's own definition and the action it requires from you. "
        "Admissions language is only useful when it leads to a specific next step, such as requesting a fee waiver or submitting a financial-aid form.",
    ),
    "Need-Blind vs. Need-Aware Policies": (
        "Need-blind and need-aware describe whether a university considers an applicant's ability to pay during the admission decision. Policies vary for international students, and a policy may apply differently to admission and financial-aid awards.",
        "Read the institution's international financial-aid page carefully and do not assume that a domestic policy applies to you. "
        "Record whether aid is need-based, merit-based, or both, and whether the university requires financial documents at the time of application.",
    ),
    "CSS Profile & International Student Financial Aid Form": (
        "The CSS Profile and university-specific financial-aid forms ask for detailed household information. Families may need to explain local income, currency, property, dependants, school costs, and unusual financial circumstances.",
        "Gather records before opening the form: salary evidence, tuition receipts, tax or municipal documents where available, and a consistent explanation of currency conversions. "
        "If a form is not designed for your country's documents, contact the financial-aid office and keep a copy of the guidance you receive.",
    ),
    "External Scholarships for African Scholars": (
        "External scholarships can support tuition, travel, living costs, or a specific academic programme. Their eligibility rules may be tied to nationality, field, age, leadership experience, or a particular host institution.",
        "Build a source list using official scholarship websites, university financial-aid pages, and trusted education organisations. "
        "Never pay an unverified intermediary for a guaranteed award, and check whether an external award changes the amount of university aid you can receive.",
    ),
    "Common App vs. UCAS vs. Direct Applications": (
        "The Common App lets students apply to many US institutions through one platform, while UCAS is the central application system for UK undergraduate programmes. Other universities require a direct institutional application.",
        "The systems differ in personal-statement structure, reference requirements, course selection, and deadline rules. "
        "Create a separate checklist for each system and confirm whether a university accepts predicted results, requires an application fee, or limits the number of choices.",
    ),
    "Building Your School List": (
        "A useful school list balances academic fit, affordability, programme strength, student support, and realistic admission probability. "
        "Do not choose institutions only because they are famous; a strong list includes places where your goals and available support align.",
        "For every university, record the programme, deadline, testing policy, international aid policy, application platform, and estimated total cost. "
        "Then label the list by fit and risk, revisiting it when you learn more about your finances or academic profile.",
    ),
    "Understanding the Digital SAT": (
        "The Digital SAT is adaptive: the difficulty of the second module depends partly on performance in the first. It includes Reading and Writing and Math sections, with shorter passages and an on-screen calculator policy.",
        "Preparation should combine content review with timed digital practice. Review every missed question by identifying the underlying skill, not just memorising the correct option. "
        "Use official practice materials so the interface and timing feel familiar on test day.",
    ),
    "Grade Conversion for GCE A-Level and French Baccalauréat Students": (
        "Universities read grades in the context of the curriculum that produced them. GCE A-Level subjects, French Baccalaureat results, and school transcripts should be reported exactly as issued rather than converted informally by the student.",
        "If a university asks for a conversion, follow its published method or ask the admissions office what documentation it accepts. "
        "Include subject names, examination boards, predicted or final status, and any explanation your school normally provides about the grading scale.",
    ),
    "Building a Consistent Narrative Across Your Application": (
        "A consistent application narrative connects your academic interests, activities, recommendations, and essays without making every component repeat the same sentence. "
        "It should help a reader understand what you care about, how you explored it, and what you hope to do next.",
        "List three experiences that shaped your intended direction and identify the evidence each application component can contribute. "
        "Aim for coherence, not performance: your narrative should be recognisably yours and supported by specific actions.",
    ),
    "Common Mistakes to Avoid": (
        "Frequent mistakes include missing a document, using the wrong deadline time zone, describing activities without showing responsibility, and submitting essays with avoidable factual or formatting errors.",
        "Before submission, ask a trusted reviewer to check accuracy, clarity, and requirements separately. "
        "Do not let an editor replace your voice, and do not submit a polished application until the official portal confirms that every required item is received.",
    ),
    "Finding Your Story": (
        "A strong personal statement usually begins with a specific experience rather than a broad claim about being hardworking or passionate. "
        "The experience may be ordinary in scale but meaningful because it changed how you noticed a problem, helped someone, or understood yourself.",
        "Write ten moments that remain vivid to you and add what each moment reveals about your choices. "
        "Choose the story with the clearest movement from observation to action to reflection, not necessarily the story with the most impressive setting.",
    ),
    "Structuring the Personal Statement": (
        "A personal statement needs a clear through-line. An opening scene can establish the question or tension, middle paragraphs can show decisions and consequences, and the ending can explain what the experience means now.",
        "Draft a one-sentence purpose for each paragraph before polishing sentences. "
        "Read the outline aloud and check that each paragraph advances the story rather than repeating background information.",
    ),
    "Writing Strong Supplemental Essays": (
        "Supplemental essays answer a particular university's question, so they should show specific knowledge of the programme and a credible reason for fit. "
        "Name resources, courses, communities, or approaches that connect directly to your goals.",
        "For each university, make a two-column list: what the institution offers and what you would contribute. "
        "Use the overlap to draft an answer that could not be sent unchanged to another university.",
    ),
    "Editing and Revision Workshop": (
        "Revision is more than correcting grammar. Read first for the central idea, then for structure, evidence, voice, sentence clarity, and finally mechanics. "
        "A useful editor identifies where a reader is confused without rewriting the essay in their own style.",
        "Print or export your draft and mark every sentence that states a quality without showing evidence. "
        "Replace some of those claims with a concrete action, detail, or reflection, then read the revised version aloud.",
    ),
    "Understanding the Digital SAT Format": (
        "The Digital SAT has Reading and Writing and Math sections delivered through an online testing application. Each section is divided into timed modules, and the second module adapts to performance in the first.",
        "Learn the test interface, navigation rules, calculator options, and timing before focusing on score goals. "
        "A practice routine should include full digital sections as well as short skill sessions so endurance and accuracy improve together.",
    ),
    "Reading and Writing Section Strategy": (
        "Digital SAT Reading and Writing questions test transitions, expression of ideas, grammar, rhetoric, and comprehension of concise passages. "
        "The best answer is supported by the text or by a precise rule, not by what sounds most sophisticated.",
        "Keep an error log with the question skill, your reasoning, the correct reasoning, and a new example. "
        "Review patterns in the log each week and practise the weakest skill under realistic time pressure.",
    ),
    "Math Section Strategy": (
        "SAT Math rewards flexible representation: a problem may be easier as an equation, a table, a graph, or an estimate. "
        "Core areas include algebra, advanced math, problem-solving and data analysis, and geometry and trigonometry.",
        "For each missed problem, solve it once without looking at the explanation and once using a second method. "
        "Record which clue in the wording should have suggested that method.",
    ),
    "Building Your Study Plan": (
        "An effective study plan starts with a diagnostic and works backwards from the test date. It allocates recurring time for content, timed practice, review, and rest rather than treating every session as a full test.",
        "Choose two measurable weekly targets, such as completing a set of algebra questions with a target accuracy or revising a group of grammar skills. "
        "Review the plan every Sunday and adjust it using evidence from your error log.",
    ),
}

LESSON_PROMPTS = {
    "What Is Global College Admissions?": "Choose one university you might apply to. List three parts of your background or preparation that an admissions reader would need to understand in context.",
    "The College Admissions Cycle": "Work backwards from a real application deadline and draft a calendar for tests, recommendations, transcripts, essays, and financial-aid forms.",
    "What Do You Need to Apply?": "Choose one university and build a checklist from its official admissions page, separating documents you provide from documents your school or referee provides.",
    "Terminology and Definitions": "Choose three admissions terms you encountered and write down each university's own definition plus the specific action or deadline attached to it.",
    "Need-Blind vs. Need-Aware Policies": "Compare the international admission and financial-aid policies of two universities, and write down what each says about ability to pay.",
    "CSS Profile & International Student Financial Aid Form": "Make a private checklist of the household records your family may need and note which figures or documents require clarification from a financial-aid office.",
    "External Scholarships for African Scholars": "Find one scholarship on its official website and record its eligibility, covered costs, deadline, and any effect it may have on university aid.",
    "Common App vs. UCAS vs. Direct Applications": "Compare the application systems used by two universities on your list and note differences in essays, references, course choices, and deadlines.",
    "Building Your School List": "Compare three universities using academic fit, total cost, international aid, programme options, and student support before deciding what you still need to research.",
    "Understanding the Digital SAT": "After a practice module, choose three missed questions and identify the skill each tested and what clue you missed.",
    "Grade Conversion for GCE A-Level and French Baccalauréat Students": "Create a record of your subjects and grades exactly as issued, then list questions to ask your school or each university before attempting any conversion.",
    "Building a Consistent Narrative Across Your Application": "Choose three experiences that matter to you and explain how each could contribute different evidence to an essay, activity entry, or recommendation.",
    "Common Mistakes to Avoid": "Draft a submission checklist that separates factual accuracy, required documents, deadline and time-zone checks, and confirmation from the application portal.",
    "Finding Your Story": "Write about a small moment that changed how you understood a responsibility or interest, focusing on what you noticed and chose to do.",
    "Structuring the Personal Statement": "Outline a personal statement with one purpose for each paragraph, then check that the sequence shows action, consequence, and reflection.",
    "Writing Strong Supplemental Essays": "Choose one university-specific question and list a resource you would use and a contribution you could make, using details verified on the university website.",
    "Editing and Revision Workshop": "Review a draft once for its central idea and once for sentence clarity; mark places where a claim needs a concrete example rather than rewriting the author's voice.",
    "Understanding the Digital SAT Format": "Describe the test sections and module structure from the current official SAT guide, then identify which parts of the test interface you want to practise.",
    "Reading and Writing Section Strategy": "For five practice questions, record the skill tested, the evidence for the correct answer, and why your chosen alternative did not fit.",
    "Math Section Strategy": "Choose a missed math problem and solve it using two representations, such as an equation and a table or graph, then compare the reasoning.",
    "Building Your Study Plan": "Create a weekly plan with two focused practice sessions, review time for your error log, one measurable target, and a rest period.",
}

COURSE_TREE = {
    "Foundations": {
        "access_type": AccessType.free,
        "modules": {
            "Understanding Global College Admissions": ["What Is Global College Admissions?", "The College Admissions Cycle", "What Do You Need to Apply?", "Terminology and Definitions"],
            "Scholarships & Financial Aid": ["Need-Blind vs. Need-Aware Policies", "CSS Profile & International Student Financial Aid Form", "External Scholarships for African Scholars"],
            "Application Systems": ["Common App vs. UCAS vs. Direct Applications", "Building Your School List"],
            "Standardized Tests & Academic Requirements": ["Understanding the Digital SAT", "Grade Conversion for GCE A-Level and French Baccalauréat Students"],
            "Application Strategy": ["Building a Consistent Narrative Across Your Application", "Common Mistakes to Avoid"],
        },
    },
    "Essay Writing Lab": {
        "access_type": AccessType.members_only,
        "modules": {"Personal Statement & Supplemental Essays": ["Finding Your Story", "Structuring the Personal Statement", "Writing Strong Supplemental Essays", "Editing and Revision Workshop"]},
    },
    "SAT Prep & Strategy": {
        "access_type": AccessType.members_only,
        "modules": {"SAT Strategy Fundamentals": ["Understanding the Digital SAT Format", "Reading and Writing Section Strategy", "Math Section Strategy", "Building Your Study Plan"]},
    },
}

RESOURCE_DATA = [
    ("5 Successful African Application Essays", "Successful Essays", AccessType.members_only, "A guided collection for studying structure, specificity, reflection, and voice without copying another student's story. Use the official admissions guidance linked here to understand how universities describe personal essays.", "https://admission.stanford.edu/apply/first-year/apply.html"),
    ("How to Convert Your Grades for US Universities", "How-To Guides", AccessType.free, "A practical guide to reporting GCE and French Baccalaureat results accurately while following each university's official instructions for international transcripts.", "https://educationusa.state.gov/your-5-steps-us-study/apply-your-application"),
    ("Understanding the CSS Profile", "African Case Studies", AccessType.members_only, "Learn which household documents international applicants commonly need and how to explain local income, currency, dependants, and unusual financial circumstances.", "https://cssprofile.collegeboard.org/"),
    ("SAT Study Plan Template", "SAT Resources", AccessType.free, "A flexible study-plan template for combining official digital practice, targeted review, error analysis, and rest in the weeks before the SAT.", "https://satsuite.collegeboard.org/digital/digital-practice-preparation"),
    ("Common App Activities Section Guide", "How-To Guides", AccessType.members_only, "A focused guide to turning real responsibilities and sustained commitments into concise, accurate activities entries that help an admissions reader understand your contribution.", "https://www.commonapp.org/apply/first-year-students"),
]

OPPORTUNITY_DATA = [
    ("Mastercard Foundation Scholars Program", "Scholarships", 60, "A major scholarship pathway supporting academically talented students who demonstrate leadership and a commitment to positive change in their communities.", "https://mastercardfdn.org/all/scholars/"),
    ("African Leadership Academy Summer Program", "Summer Programs", 5, "A selective summer opportunity focused on leadership, entrepreneurship, and collaboration among young African students.", "https://www.africanleadershipacademy.org/"),
    ("Global Undergraduate Research Competition", "Competitions", 90, "A research-focused opportunity record for students who can present a clear question, responsible method, and useful contribution to their field. Confirm current eligibility and dates on the official science competition site.", "https://www.societyforscience.org/isef/"),
    ("Local Community Leadership Activity Builder", "Activity Building", None, "A self-directed opportunity to design and document a small community project, from identifying a local need to measuring what changed.", "https://www.un.org/sustainabledevelopment/"),
    ("2026 Youth Climate Fellowship", "Scholarships", -10, "A fellowship for young people developing practical responses to climate and environmental challenges in their communities.", "https://www.un.org/youthenvoy/"),
    ("Cameroon STEM Innovation Challenge", "Research", 45, "A project-based opportunity record for students interested in using science, technology, engineering, or mathematics to investigate a local problem. Review the linked youth programme information and confirm any current eligibility before applying.", "https://www.unesco.org/en/youth"),
]

MASTERCLASS_DATA = [
    ("Winning the Application Process", "Sir Allen", 14, AccessType.free, "https://zoom.us/j/900000001", None),
    ("Having a Consistent Application Narrative", "Mohammed", 21, AccessType.members_only, "https://meet.google.com/gsp-narrative", None),
    ("Alumni Story", "Divina", 28, AccessType.free, "https://zoom.us/j/900000003", None),
    ("Group SAT Review", "GSP Team", 35, AccessType.members_only, "https://meet.google.com/gsp-sat-review", None),
    ("Information Session: Applying as a Cameroonian Student", "GSP Team", -7, AccessType.members_only, "https://zoom.us/j/900000005", "https://www.youtube.com/watch?v=YngYAvN_2SA"),
]

POST_DATA = [
    ("Masterclass Spotlight: Winning the Application Process", "Join our upcoming session on planning a clear, evidence-led application.", True, 1, HomepageStatus.published),
    ("Scholarship Deadline Reminder for African Applicants", "A practical reminder to check eligibility, funding forms, and time-zone cutoffs before submitting.", True, 2, HomepageStatus.published),
    ("Study Tip: Keep an Application Evidence Log", "Record the examples, responsibilities, and reflections you may later use across essays and interviews.", False, None, HomepageStatus.published),
    ("Draft: October Essay Clinic Announcement", "Internal draft for a future essay clinic announcement.", False, None, HomepageStatus.draft),
]



SEED_EMAILS = frozenset(
    {'admin@gsp.test', 'paid.student@gsp.test', 'free.student@gsp.test', 'profile.student@gsp.test'}
    | {f'gsp-stage-a1-seed-{index:02d}@gsp.test' for index in range(1, 7)}
    | {f'seed-h1-student-{index:02d}@gsp.test' for index in range(1, 26)}
)
_seed_credentials: dict[str, str] = {}


def require_development_seed() -> None:
    settings = get_settings()
    host = make_url(settings.DATABASE_URL).host
    if settings.APP_ENV != 'development' or host not in {'localhost', '127.0.0.1'}:
        raise SystemExit('Seed utility requires APP_ENV=development and a loopback database host.')


def seed_password_for(email: str) -> str:
    normalized = email.strip().lower()
    if normalized not in SEED_EMAILS:
        raise RuntimeError('Refusing credentials for an account outside the explicit seed registry.')
    if normalized not in _seed_credentials:
        configured = os.environ.get('SEED_PASSWORD') or dotenv_values(Path(__file__).resolve().parents[1] / '.env.seed').get('SEED_PASSWORD')
        _seed_credentials[normalized] = configured or secrets.token_urlsafe(16)
    return _seed_credentials[normalized]


def save_seed_credentials() -> Path:
    path = Path(__file__).resolve().parents[1] / '.seed-credentials.local'
    saved = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    saved.update(_seed_credentials)
    path.write_text(json.dumps(saved, indent=2) + '\n', encoding='utf-8')
    return path


async def reset_seed_passwords(session) -> dict:
    require_development_seed()
    before = dict((await session.execute(select(User.id, User.hashed_password).where(func.lower(User.email).not_in(SEED_EMAILS)))).all())
    users = list((await session.scalars(select(User).where(func.lower(User.email).in_(SEED_EMAILS)).with_for_update())).all())
    if any(user.email.strip().lower() not in SEED_EMAILS for user in users):
        raise RuntimeError('Seed reset contains an account outside the explicit seed registry.')
    for user in users:
        user.hashed_password = get_password_hash(seed_password_for(user.email))
    await session.flush()
    after = dict((await session.execute(select(User.id, User.hashed_password).where(func.lower(User.email).not_in(SEED_EMAILS)))).all())
    if before != after:
        raise RuntimeError('Non-seed account changed; transaction will be rolled back.')
    return {'changed_emails': sorted(user.email for user in users), 'changed_count': len(users), 'non_seed_accounts_unchanged': len(before), 'owner_accounts_untouched': True}


def lesson_body(title: str) -> str:
    first, second = LESSON_BODY[title]
    return sanitize_html(f"<p>{first}</p><p>{second}</p>")


async def ensure_seed_consents(session, user: User) -> int:
    existing = set((await session.execute(select(Consent.consent_type, Consent.version).where(Consent.user_id == user.id))).all())
    count = 0
    for kind, version in LEGAL_VERSIONS.items():
        if (ConsentType(kind), version) not in existing:
            session.add(Consent(user_id=user.id, consent_type=ConsentType(kind), version=version))
            count += 1
    return count


async def get_or_create_user(session, email: str, full_name: str, role: UserRole, profile_values: dict | None = None) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, hashed_password=get_password_hash(seed_password_for(email)), role=role, is_active=True)
        session.add(user)
        await session.flush()
    else:
        user.role = role
        user.is_active = True
    profile = await session.get(Profile, user.id)
    values = {"full_name": full_name, **(profile_values or {})}
    if profile is None:
        session.add(Profile(user_id=user.id, **values))
    else:
        for field, value in values.items():
            setattr(profile, field, value)
    await ensure_seed_consents(session, user)
    return user


async def seed_users(session):
    admin = await get_or_create_user(session, "admin@gsp.test", "GSP Administrator", UserRole.admin, {"country": "Cameroon"})
    paid = await get_or_create_user(session, "paid.student@gsp.test", "Amina Nfor", UserRole.student, {"country": "Cameroon"})
    free = await get_or_create_user(session, "free.student@gsp.test", "Brian Talla", UserRole.student, {"country": "Cameroon"})
    profile = await get_or_create_user(session, "profile.student@gsp.test", "Chantal Mbarga", UserRole.student, {"country": "Cameroon", "education_level": EducationLevel.high_school, "school": "Government Bilingual High School Yaounde", "city": "Yaounde", "what_brings_you": ["undergraduate applications", "scholarships", "research"], "fields_of_study": ["Computer Science", "Environmental Science"], "countries_of_interest": ["United States", "Canada", "United Kingdom"]})
    subscription = await session.scalar(select(Subscription).where(Subscription.user_id == paid.id, Subscription.plan == SubscriptionPlan.monthly))
    if subscription is None:
        session.add(Subscription(user_id=paid.id, plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=NOW + timedelta(days=30)))
    else:
        subscription.status = SubscriptionStatus.active
        subscription.current_period_end = NOW + timedelta(days=30)
    await session.execute(delete(Subscription).where(Subscription.user_id == free.id))
    await session.flush()
    return admin, paid, free, profile


async def seed_courses(session):
    for title, config in COURSE_TREE.items():
        course = await session.scalar(select(Course).where(Course.title == title))
        if course is None:
            course = Course(title=title, description={"Foundations": "Understand how global admissions works, from financial aid to application systems.", "Essay Writing Lab": "Develop compelling, authentic university application essays.", "SAT Prep & Strategy": "Learn how to strategically prepare for and approach the SAT."}[title], access_type=config["access_type"], status=CourseStatus.published)
            session.add(course)
            await session.flush()
        else:
            course.access_type = config["access_type"]
            course.status = CourseStatus.published
        for module_order, (module_title, lesson_titles) in enumerate(config["modules"].items(), 1):
            module = await session.scalar(select(Module).where(Module.course_id == course.id, Module.title == module_title))
            if module is None:
                module = Module(course_id=course.id, title=module_title, order=module_order)
                session.add(module)
                await session.flush()
            else:
                module.order = module_order
            for lesson_order, lesson_title in enumerate(lesson_titles, 1):
                lesson = await session.scalar(select(Lesson).where(Lesson.module_id == module.id, Lesson.title == lesson_title))
                if lesson is None and lesson_title.endswith("Baccalauréat Students"):
                    lesson = await session.scalar(select(Lesson).where(Lesson.module_id == module.id, Lesson.title == lesson_title.replace("Baccalauréat", "Baccalaureat")))
                    if lesson is not None:
                        lesson.title = lesson_title
                prompt = LESSON_PROMPTS[lesson_title]
                if lesson is None:
                    session.add(Lesson(module_id=module.id, title=lesson_title, body_html=lesson_body(lesson_title), try_it_yourself_prompt=prompt, order=lesson_order))
                else:
                    lesson.body_html = lesson_body(lesson_title)
                    lesson.try_it_yourself_prompt = prompt
                    lesson.order = lesson_order
    await session.flush()


async def seed_resources(session):
    for title, category, access_type, description, url in RESOURCE_DATA:
        resource = await session.scalar(select(Resource).where(Resource.title == title))
        if resource is None:
            session.add(Resource(title=title, category=category, access_type=access_type, description=description, url=url, status=ResourceStatus.published))
        else:
            resource.category = category
            resource.access_type = access_type
            resource.description = description
            resource.url = url
            resource.status = ResourceStatus.published


async def seed_opportunities(session, admin_id):
    for name, category, days, description, url in OPPORTUNITY_DATA:
        opportunity = await session.scalar(select(Opportunity).where(Opportunity.name == name))
        deadline = None if days is None else NOW + timedelta(days=days)
        if opportunity is None:
            session.add(Opportunity(name=name, category=category, deadline=deadline, description=description, external_link=url, created_by=admin_id))
        else:
            opportunity.category = category
            opportunity.deadline = deadline
            opportunity.description = description
            opportunity.external_link = url
            opportunity.created_by = admin_id


async def seed_masterclasses(session):
    for title, speaker, days, access_type, link, recording in MASTERCLASS_DATA:
        masterclass = await session.scalar(select(Masterclass).where(Masterclass.title == title))
        values = {"speaker_name": speaker, "description": f"A GSP session for students preparing for international university applications.", "session_datetime": NOW + timedelta(days=days), "session_link": link, "access_type": access_type, "recording_url": recording}
        if masterclass is None:
            session.add(Masterclass(title=title, **values))
        else:
            for field, value in values.items():
                setattr(masterclass, field, value)


async def seed_posts(session):
    for index, (title, summary, pinned, pin_order, status) in enumerate(POST_DATA):
        post = await session.scalar(select(HomepagePost).where(HomepagePost.title == title))
        published_at = NOW - timedelta(minutes=3 - index) if status == HomepageStatus.published else None
        values = {"summary": summary, "body_html": sanitize_html(f"<p>{summary}</p><p>Global Scholars Program shares practical, student-focused guidance for the international admissions journey.</p>"), "status": status, "pinned": pinned, "pin_order": pin_order, "published_at": published_at}
        if post is None:
            session.add(HomepagePost(title=title, **values))
        else:
            for field, value in values.items():
                setattr(post, field, value)


def seed_service_request_pdf(label: str) -> bytes:
    safe_label = re.sub(r"[^A-Za-z0-9 .-]", "", label)[:72] or "Student document"
    text_line = safe_label.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content_stream = (
        "BT /F1 14 Tf 72 720 Td (Global Scholars Program - development sample) Tj "
        f"0 -28 Td ({text_line}) Tj ET"
    ).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def is_valid_seed_pdf(content: bytes) -> bool:
    marker = content.rfind(b"startxref\n")
    if not content.startswith(b"%PDF-") or marker < 0 or not content.rstrip().endswith(b"%%EOF"):
        return False
    offset_start = marker + len(b"startxref\n")
    offset_end = content.find(b"\n", offset_start)
    if offset_end < 0:
        return False
    try:
        xref_offset = int(content[offset_start:offset_end])
    except ValueError:
        return False
    return content[xref_offset:].startswith(b"xref\n")


async def seed_service_requests(session, paid_user, admin):
    data = [("Seeded Essay Review - Submitted", ServiceType.essay_review, ServiceStatus.submitted, [None, ServiceStatus.submitted]), ("Seeded Activities Review - In Progress", ServiceType.activities_review, ServiceStatus.in_progress, [None, ServiceStatus.submitted, ServiceStatus.in_progress]), ("Seeded Essay Review - Returned", ServiceType.essay_review, ServiceStatus.returned, [None, ServiceStatus.submitted, ServiceStatus.in_progress, ServiceStatus.returned])]
    for label, service_type, status, transitions in data:
        request = await session.scalar(
            select(ServiceRequest)
            .where(ServiceRequest.user_id == paid_user.id, ServiceRequest.service_type == service_type, ServiceRequest.status == status)
            .order_by(ServiceRequest.created_at, ServiceRequest.id)
            .limit(1)
        )
        if request is None:
            upload = UploadFile(filename=f"{label.lower().replace(' ', '-')}.pdf", file=io.BytesIO(seed_service_request_pdf(label)), headers=Headers({"content-type": "application/pdf"}))
            document_url = await storage_backend.save(upload)
            request = ServiceRequest(
                user_id=paid_user.id,
                service_type=service_type,
                document_url=document_url,
                status=status,
                created_at=NOW - timedelta(days=len(transitions)),
            )
            session.add(request)
            await session.flush()
        if request.document_url is not None:
            try:
                existing_file = await storage_backend.open(request.document_url)
            except FileNotFoundError:
                existing_pdf = b""
            else:
                try:
                    existing_pdf = existing_file.read()
                finally:
                    existing_file.close()
        else:
            existing_pdf = b""
        if not is_valid_seed_pdf(existing_pdf):
            upload = UploadFile(filename=f"{label.lower().replace(' ', '-')}.pdf", file=io.BytesIO(seed_service_request_pdf(label)), headers=Headers({"content-type": "application/pdf"}))
            request.document_url = await storage_backend.save(upload)

        for index in range(1, len(transitions)):
            from_status, to_status = transitions[index - 1], transitions[index]
            event = await session.scalar(select(ServiceRequestEvent).where(ServiceRequestEvent.service_request_id == request.id, ServiceRequestEvent.from_status == from_status, ServiceRequestEvent.to_status == to_status))
            event_time = NOW - timedelta(days=len(transitions) - index)
            changed_by = paid_user.id if from_status is None else admin.id
            if event is None:
                session.add(ServiceRequestEvent(service_request_id=request.id, from_status=from_status, to_status=to_status, changed_by=changed_by, changed_at=event_time))
            else:
                event.changed_by = changed_by
                event.changed_at = event_time


async def seed_admin_stage_a1(session):
    admin = await session.scalar(select(User).where(User.email == 'admin@gsp.test'))
    if admin is None:
        raise RuntimeError('Run the base seed once before the Admin Stage A1 additive seed.')

    now = datetime.now(timezone.utc)
    student_ids = []
    created_offsets = (30, 60, 90, 1, 3, 6)
    paid_indexes = {0, 2, 4}
    for index, days_ago in enumerate(created_offsets, start=1):
        email = f'gsp-stage-a1-seed-{index:02d}@gsp.test'
        student = await session.scalar(select(User).where(User.email == email))
        if student is None:
            student = User(
                email=email,
                hashed_password=get_password_hash(seed_password_for(email)),
                role=UserRole.student,
                is_active=True,
                created_at=now - timedelta(days=days_ago),
            )
            session.add(student)
            await session.flush()
            session.add(Profile(user_id=student.id, full_name=f'A1 Seed Student {index:02d}', country='Cameroon'))
        student_ids.append(student.id)

        if index - 1 in paid_indexes:
            existing_subscription = await session.scalar(
                select(Subscription).where(
                    Subscription.user_id == student.id,
                    Subscription.plan == SubscriptionPlan.beta,
                )
            )
            if existing_subscription is None:
                session.add(
                    Subscription(
                        user_id=student.id,
                        plan=SubscriptionPlan.beta,
                        status=SubscriptionStatus.active,
                        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
                    )
                )
            else:
                existing_subscription.status = SubscriptionStatus.active
                existing_subscription.current_period_end = datetime.now(timezone.utc) + timedelta(days=30)

    request_fixtures = [
        (student_ids[0], ServiceType.essay_review, ServiceStatus.submitted, [None, ServiceStatus.submitted]),
        (student_ids[3], ServiceType.activities_review, ServiceStatus.in_progress, [None, ServiceStatus.submitted, ServiceStatus.in_progress]),
    ]
    for user_id, service_type, request_status, transitions in request_fixtures:
        request = await session.scalar(
            select(ServiceRequest).where(
                ServiceRequest.user_id == user_id,
                ServiceRequest.service_type == service_type,
                ServiceRequest.status == request_status,
            )
        )
        if request is None:
            request = ServiceRequest(
                user_id=user_id,
                service_type=service_type,
                status=request_status,
                document_url=None,
            )
            session.add(request)
            await session.flush()
        for index in range(1, len(transitions)):
            from_status, to_status = transitions[index - 1], transitions[index]
            existing_event = await session.scalar(
                select(ServiceRequestEvent).where(
                    ServiceRequestEvent.service_request_id == request.id,
                    ServiceRequestEvent.from_status == from_status,
                    ServiceRequestEvent.to_status == to_status,
                )
            )
            if existing_event is None:
                session.add(
                    ServiceRequestEvent(
                        service_request_id=request.id,
                        from_status=from_status,
                        to_status=to_status,
                        changed_by=admin.id,
                    )
                )


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
    return len(payload).to_bytes(4, 'big') + chunk_type + payload + checksum.to_bytes(4, 'big')


def generated_thumbnail(seed: int) -> bytes:
    width = 32
    height = 20
    red = 24 + seed * 17 % 180
    green = 40 + seed * 31 % 160
    blue = 60 + seed * 43 % 140
    scanlines = []
    for row_index in range(height):
        pixels = bytearray()
        for column_index in range(width):
            accent = (row_index + column_index + seed) % 7 == 0
            pixels.extend((min(red + 35, 255), min(green + 35, 255), min(blue + 35, 255), 255) if accent else (red, green, blue, 255))
        scanlines.append(b'\x00' + bytes(pixels))
    header = struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + png_chunk(b'IHDR', header)
        + png_chunk(b'IDAT', zlib.compress(b''.join(scanlines)))
        + png_chunk(b'IEND', b'')
    )


async def save_generated_thumbnail(seed: int) -> str:
    upload = UploadFile(
        filename=f'h1-thumbnail-{seed:02d}.png',
        file=io.BytesIO(generated_thumbnail(seed)),
        headers=Headers({'content-type': 'image/png'}),
    )
    storage_key = await storage_backend.save(
        upload,
        max_size=5 * 1024 * 1024,
        allowed_types={'image/png'},
        prefix='public',
    )
    filename = storage_key.rsplit('/', 1)[-1]
    return f'{get_settings().API_BASE_URL.rstrip("/")}/media/public/{filename}'


async def seed_admin_stage_h1(session):
    admin = await session.scalar(select(User).where(User.email == 'admin@gsp.test'))
    if admin is None:
        raise RuntimeError('Run the base seed before the Admin Stage H1 additive seed.')

    now = datetime.now(timezone.utc)
    students: list[User] = []
    for index in range(1, 26):
        email = f'seed-h1-student-{index:02d}@gsp.test'
        full_name = f'H1 Seed Student {index:02d}'
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                hashed_password=get_password_hash(seed_password_for(email)),
                role=UserRole.student,
                is_active=True,
                created_at=now - timedelta(days=(index * 7) % 120),
            )
            session.add(user)
            await session.flush()
        else:
            user.role = UserRole.student
            user.is_active = True
            user.created_at = now - timedelta(days=(index * 7) % 120)

        profile = await session.get(Profile, user.id)
        values = {
            'full_name': full_name,
            'country': 'Cameroon',
            'school': 'H1 Seed Secondary School',
            'city': ('Yaounde', 'Douala', 'Bamenda', 'Buea')[(index - 1) % 4],
            'education_level': EducationLevel.high_school,
        }
        if profile is None:
            session.add(Profile(user_id=user.id, **values))
        else:
            for field, value in values.items():
                setattr(profile, field, value)

        subscription_values = None
        if index % 4 == 1:
            subscription_values = (SubscriptionPlan.beta, SubscriptionStatus.active, now + timedelta(days=30))
        elif index % 4 == 2:
            subscription_values = (SubscriptionPlan.monthly, SubscriptionStatus.active, now + timedelta(days=30))
        elif index % 4 == 3:
            subscription_values = (SubscriptionPlan.monthly, SubscriptionStatus.expired, now - timedelta(days=3))
        if subscription_values is not None:
            plan, subscription_status, period_end = subscription_values
            subscription = await session.scalar(
                select(Subscription).where(Subscription.user_id == user.id, Subscription.plan == plan)
            )
            if subscription is None:
                session.add(
                    Subscription(
                        user_id=user.id,
                        plan=plan,
                        status=subscription_status,
                        current_period_end=period_end,
                    )
                )
            else:
                subscription.status = subscription_status
                subscription.current_period_end = period_end
        students.append(user)

    post_title = 'seed-h1-post-06'
    post = await session.scalar(select(HomepagePost).where(HomepagePost.title == post_title))
    if post is None:
        post = HomepagePost(
            title=post_title,
            summary='H1 seed post for the published-post fallback state.',
            body_html=sanitize_html('<p>H1 seed post for the published-post fallback state.</p>'),
            status=HomepageStatus.published,
            pinned=False,
            published_at=now - timedelta(hours=6),
        )
        session.add(post)
        await session.flush()
        await write_audit_log(session, admin.id, 'created', 'homepage_post', post.id, post.title)

    posts = (await session.scalars(select(HomepagePost).order_by(HomepagePost.created_at))).all()
    for image_index, homepage_post in enumerate(posts, start=1):
        if not homepage_post.thumbnail_url:
            homepage_post.thumbnail_url = await save_generated_thumbnail(image_index)

    for index, student in enumerate(students[:12], start=1):
        service_type = ServiceType.essay_review if index % 2 else ServiceType.activities_review
        request_status = (ServiceStatus.submitted, ServiceStatus.in_progress, ServiceStatus.returned)[(index - 1) % 3]
        service_request = await session.scalar(
            select(ServiceRequest).where(
                ServiceRequest.user_id == student.id,
                ServiceRequest.service_type == service_type,
                ServiceRequest.status == request_status,
            )
        )
        if service_request is None:
            pdf_bytes = b'%PDF-1.4\n% GSP H1 seed document\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'
            upload = UploadFile(
                filename=f'h1-service-request-{index:02d}.pdf',
                file=io.BytesIO(pdf_bytes),
                headers=Headers({'content-type': 'application/pdf'}),
            )
            document_key = await storage_backend.save(upload)
            service_request = ServiceRequest(
                user_id=student.id,
                service_type=service_type,
                document_url=document_key,
                status=request_status,
            )
            session.add(service_request)
            await session.flush()
            await write_audit_log(session, admin.id, 'created', 'service_request', service_request.id, f'seed-h1-request-{index:02d}')
        elif service_request.document_url is None:
            upload = UploadFile(
                filename=f'h1-service-request-{index:02d}.pdf',
                file=io.BytesIO(b'%PDF-1.4\n% GSP H1 seed document\n%%EOF\n'),
                headers=Headers({'content-type': 'application/pdf'}),
            )
            service_request.document_url = await storage_backend.save(upload)

        statuses = [ServiceStatus.submitted]
        if request_status in (ServiceStatus.in_progress, ServiceStatus.returned):
            statuses.append(ServiceStatus.in_progress)
        if request_status == ServiceStatus.returned:
            statuses.append(ServiceStatus.returned)
        previous_status = None
        for next_status in statuses:
            event = await session.scalar(
                select(ServiceRequestEvent).where(
                    ServiceRequestEvent.service_request_id == service_request.id,
                    ServiceRequestEvent.from_status == previous_status,
                    ServiceRequestEvent.to_status == next_status,
                )
            )
            if event is None:
                session.add(
                    ServiceRequestEvent(
                        service_request_id=service_request.id,
                        from_status=previous_status,
                        to_status=next_status,
                        changed_by=student.id if previous_status is None else admin.id,
                    )
                )
            previous_status = next_status






async def main():
    parser = argparse.ArgumentParser(description="Development-only database seed utility; it is not an HTTP endpoint.")
    stage_group = parser.add_mutually_exclusive_group()
    stage_group.add_argument('--admin-stage-a1', action='store_true')
    stage_group.add_argument('--admin-stage-h1', action='store_true')
    parser.add_argument('--reset-passwords', action='store_true')
    args = parser.parse_args()
    require_development_seed()
    if args.reset_passwords and (args.admin_stage_a1 or args.admin_stage_h1):
        parser.error('--reset-passwords is a separate operation; do not combine seed modes.')
    if args.reset_passwords:
        async with AsyncSessionLocal() as session:
            report = await reset_seed_passwords(session)
            await session.commit()
        report_path = Path(__file__).resolve().parents[1] / '.seed-reset-report.local.json'
        report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    else:
        async with AsyncSessionLocal() as session:
            if args.admin_stage_a1:
                await seed_admin_stage_a1(session)
            elif args.admin_stage_h1:
                await seed_admin_stage_h1(session)
            else:
                admin, paid, _, _ = await seed_users(session)
                await seed_courses(session)
                await seed_resources(session)
                await seed_opportunities(session, admin.id)
                await seed_masterclasses(session)
                await seed_posts(session)
                await seed_service_requests(session, paid, admin)
            for seed_user in (await session.scalars(select(User).where(func.lower(User.email).in_(SEED_EMAILS)))).all():
                await ensure_seed_consents(session, seed_user)
            await session.commit()
    print(save_seed_credentials())


if __name__ == '__main__':
    asyncio.run(main())
