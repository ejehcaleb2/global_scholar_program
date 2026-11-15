import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.resolve(appDirectory, "..", "Media");
const outputDirectory = path.join(appDirectory, "public", "media", "landing");
const manifestPath = path.join(appDirectory, "components", "landing", "landing-media.json");

export const widths = [640, 960, 1440];
export const sources = [
  { id: "program-banner", file: "PXL_20250830_170832096.jpg" },
  { id: "classroom-session", file: "IMG-20250816-WA0177.jpg" },
  { id: "students-with-booklet", file: "PXL_20250821_134440487.PORTRAIT.jpg" },
  {
    id: "community-event",
    file: "IMG-20260908-WA0948.jpg",
    crop: { left: 0, top: 600, width: 1776, height: 1110 },
  },
];

export async function generateLandingMedia() {
  await mkdir(outputDirectory, { recursive: true });
  const manifest = [];

  for (const source of sources) {
    const input = path.join(sourceDirectory, source.file);
    const variants = [];

    for (const width of widths) {
      const filename = `${source.id}-${width}.webp`;
      const output = path.join(outputDirectory, filename);
      const image = sharp(input).rotate();
      if (source.crop) image.extract(source.crop);
      const result = await image
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, effort: 6 })
        .toFile(output);

      variants.push({
        width: result.width,
        height: result.height,
        url: `/media/landing/${filename}`,
        bytes: result.size,
      });
    }

    manifest.push({
      id: source.id,
      variants,
    });
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await generateLandingMedia();
  const variantCount = manifest.reduce((count, asset) => count + asset.variants.length, 0);
  console.log(`Generated ${variantCount} landing image variants for ${manifest.length} source photos.`);
}
