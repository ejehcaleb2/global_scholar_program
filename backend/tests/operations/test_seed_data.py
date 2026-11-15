from tests import configure_test_environment

configure_test_environment()

import unittest
from html.parser import HTMLParser
from urllib.parse import urlsplit

from scripts.seed_data import (
    COURSE_TREE,
    LESSON_BODY,
    LESSON_PROMPTS,
    MASTERCLASS_DATA,
    OPPORTUNITY_DATA,
    RESOURCE_DATA,
    is_valid_seed_pdf,
    lesson_body,
    seed_service_request_pdf,
)


class ParagraphCounter(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == 'p':
            self.count += 1


class SeedDataTests(unittest.TestCase):
    def test_course_tree_has_only_requested_lessons_and_substantive_content(self) -> None:
        expected_lessons = {
            lesson_title
            for course in COURSE_TREE.values()
            for lessons in course['modules'].values()
            for lesson_title in lessons
        }
        self.assertEqual(len(COURSE_TREE), 3)
        self.assertEqual(expected_lessons, set(LESSON_BODY))

        for title, paragraphs in LESSON_BODY.items():
            self.assertGreaterEqual(len(paragraphs), 2, title)
            self.assertLessEqual(len(paragraphs), 4, title)
            self.assertGreaterEqual(sum(len(paragraph.split()) for paragraph in paragraphs), 50, title)
            rendered = lesson_body(title)
            counter = ParagraphCounter()
            counter.feed(rendered)
            self.assertEqual(counter.count, len(paragraphs), title)
            self.assertNotIn('<script', rendered.lower(), title)

    def test_reflection_prompts_cover_at_least_half_of_course_lessons(self) -> None:
        expected_lessons = {
            lesson_title
            for course in COURSE_TREE.values()
            for lessons in course['modules'].values()
            for lesson_title in lessons
        }
        self.assertEqual(set(LESSON_PROMPTS), expected_lessons)
        self.assertGreaterEqual(len(LESSON_PROMPTS), (len(expected_lessons) + 1) // 2)
        self.assertTrue(all(prompt.strip() for prompt in LESSON_PROMPTS.values()))

    def test_seed_resource_and_opportunity_links_are_absolute_http_urls(self) -> None:
        urls = [row[-1] for row in RESOURCE_DATA]
        urls.extend(row[-1] for row in OPPORTUNITY_DATA)
        for url in urls:
            parsed = urlsplit(url)
            self.assertIn(parsed.scheme, {'http', 'https'}, url)
            self.assertTrue(parsed.hostname, url)

    def test_recorded_masterclass_uses_a_real_recording_url(self) -> None:
        recording_url = MASTERCLASS_DATA[-1][-1]
        self.assertEqual(recording_url, 'https://www.youtube.com/watch?v=YngYAvN_2SA')

    def test_service_request_pdf_has_a_valid_cross_reference_table(self) -> None:
        pdf = seed_service_request_pdf('Seeded Essay Review (sample)')
        self.assertTrue(is_valid_seed_pdf(pdf))
        self.assertTrue(pdf.startswith(b'%PDF-1.4'))
        self.assertTrue(pdf.rstrip().endswith(b'%%EOF'))

        marker = pdf.rfind(b'startxref\n')
        offset_start = marker + len(b'startxref\n')
        offset_end = pdf.find(b'\n', offset_start)
        xref_offset = int(pdf[offset_start:offset_end])
        xref_lines = pdf[xref_offset:].splitlines()
        object_count = int(xref_lines[1].split()[1])
        for index, entry in enumerate(xref_lines[3:3 + object_count - 1], start=1):
            object_offset = int(entry[:10])
            self.assertTrue(pdf[object_offset:].startswith(f'{index} 0 obj\n'.encode('ascii')))

    def test_invalid_or_truncated_pdf_is_not_accepted(self) -> None:
        self.assertFalse(is_valid_seed_pdf(b'%PDF-1.4\n%%EOF'))
        self.assertFalse(is_valid_seed_pdf(b'not a PDF'))


if __name__ == '__main__':
    unittest.main()
