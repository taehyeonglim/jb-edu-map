import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const files = [
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/OPERATIONS.md",
  "docs/ROADMAP.md",
  "docs/UPGRADE_VALIDATION.md",
  "docs/FULL_REVIEW.md",
];
const errors = [];
for (const file of files) {
  const body = await readFile(file, "utf8");
  const links = [
    ...body.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g),
  ].map((match) => match[1] ?? match[2]);
  links.push(
    ...[
      ...body.matchAll(/<(?:img|a)\s[^>]*(?:src|href)=["']([^"']+)["']/g),
    ].map((match) => match[1]),
  );
  for (const link of links) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(link)) continue;
    const path = decodeURIComponent(link.split(/[?#]/)[0]);
    try {
      await access(resolve(dirname(file), path));
    } catch {
      errors.push(`${file}: ${link}`);
    }
  }
}
if (errors.length) {
  console.error(`Missing local documentation targets:\n${errors.join("\n")}`);
  process.exitCode = 1;
} else
  console.log(
    `Documentation links and images verified (${files.length} files).`,
  );
