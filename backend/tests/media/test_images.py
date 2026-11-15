import io
import unittest

from PIL import Image, TiffImagePlugin
from app.core.images import ImageValidationError, process_image


def image_bytes(size=(640, 320), image_format='JPEG', *, metadata=False):
    image = Image.new('RGB', size, (60, 90, 120))
    output = io.BytesIO()
    options = {}
    if metadata:
        exif = Image.Exif()
        exif[274] = 6
        exif[34853] = {1: 'N', 2: (TiffImagePlugin.IFDRational(4), TiffImagePlugin.IFDRational(3), TiffImagePlugin.IFDRational(2))}
        options.update(exif=exif, icc_profile=b'CFP test profile', comment=b'CFP private comment')
    image.save(output, format=image_format, **options)
    return output.getvalue()


class ImageProcessingTests(unittest.TestCase):
    def test_gps_exif_and_other_metadata_are_dropped_in_both_profiles(self):
        content = image_bytes(metadata=True)
        with Image.open(io.BytesIO(content)) as original:
            self.assertIn(34853, original.getexif())
        for profile in ['avatar', 'public']:
            result = process_image(content, profile)
            for output in [result.content] + ([result.thumbnail] if result.thumbnail else []):
                with Image.open(io.BytesIO(output)) as image:
                    self.assertEqual(dict(image.getexif()), {})
                    self.assertFalse(set(image.info) & {'exif', 'xmp', 'photoshop', 'comment', 'icc_profile'})
            if profile == 'public':
                self.assertEqual((result.width, result.height), (320, 640))

    def test_avatars_crop_without_upscaling_and_have_96_pixel_variant(self):
        for side, expected in [(128, 128), (256, 256), (800, 512)]:
            result = process_image(image_bytes((side * 2, side)), 'avatar')
            self.assertEqual((result.width, result.height), (expected, expected))
            with Image.open(io.BytesIO(result.thumbnail)) as image:
                self.assertEqual(image.size, (96, 96))

    def test_public_formats_are_preserved_and_dimensions_are_capped(self):
        for image_format, content_type in [('JPEG', 'image/jpeg'), ('PNG', 'image/png'), ('WEBP', 'image/webp')]:
            result = process_image(image_bytes((4000, 1000), image_format), 'public')
            self.assertEqual(result.content_type, content_type)
            self.assertEqual((result.width, result.height), (3000, 750))

    def test_all_required_rejection_cases(self):
        gif = image_bytes(image_format='GIF')
        animated = io.BytesIO()
        Image.new('RGB', (128, 128), 'white').save(animated, format='WEBP', save_all=True, append_images=[Image.new('RGB', (128, 128), 'black')], duration=100)
        cases = [b'<svg xmlns="http://www.w3.org/2000/svg"/>', gif, animated.getvalue(), b'<html>not a png</html>', b'MZnot-a-jpeg', b'', b'x' * (6 * 1024 * 1024), image_bytes((100, 100)), image_bytes((9000, 9000), 'PNG')]
        for index, content in enumerate(cases):
            with self.subTest(case=index):
                with self.assertRaises(ImageValidationError) as error:
                    process_image(content, 'avatar')
                if index == 7:
                    self.assertIn('100 by 100', str(error.exception))
                    self.assertIn('128 by 128', str(error.exception))
                if index == 8:
                    self.assertEqual(error.exception.status_code, 422)
                    self.assertEqual(error.exception.code, 'image_pixels')
