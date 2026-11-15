import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateLandingMedia, sources, widths } from "./optimize-landing-media.mjs";

const appDirectory = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.resolve(appDirectory, "..", "Media");
const outputDirectory = path.join(appDirectory, "public", "media", "landing");
const manifestPath = path.join(appDirectory, "components", "landing", "landing-media.json");

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

test("landing media generation is deterministic and strips source metadata", async () => {
  const sourceHashes = await Promise.all(sources.map(({ file }) => sha256(path.join(sourceDirectory, file))));
  const first = await generateLandingMedia();
  const firstManifestHash = await sha256(manifestPath);
  const firstOutputHashes = await Promise.all(first.flatMap((asset) => asset.variants.map((variant) => sha256(path.join(outputDirectory, path.basename(variant.url))))));

  const second = await generateLandingMedia();
  const secondManifestHash = await sha256(manifestPath);
  const secondOutputHashes = await Promise.all(second.flatMap((asset) => asset.variants.map((variant) => sha256(path.join(outputDirectory, path.basename(variant.url))))));

  assert.deepEqual(second, first);
  assert.equal(secondManifestHash, firstManifestHash);
  assert.deepEqual(secondOutputHashes, firstOutputHashes);
  assert.deepEqual(await Promise.all(sources.map(({ file }) => sha256(path.join(sourceDirectory, file)))), sourceHashes);
  assert.equal(first.length, sources.length);

  for (const asset of first) {
    assert.deepEqual(asset.variants.map(({ width }) => width), widths);
    for (const variant of asset.variants) {
      const metadata = await sharp(path.join(outputDirectory, path.basename(variant.url))).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, variant.width);
      assert.equal(metadata.height, variant.height);
      if (asset.id === "community-event") assert.equal(metadata.width / metadata.height, 1.6);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.icc, undefined);
      assert.equal(metadata.iptc, undefined);
      assert.equal(metadata.xmp, undefined);
    }
  }
});
