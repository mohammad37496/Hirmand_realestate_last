import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const content = read("../src/lib/site-content.ts");
const admin = read("../src/components/hirmand/admin-content-studio.tsx");
const library = read("../src/routes/guides.index.tsx");
const article = read("../src/routes/guides.$slug.tsx");
const styles = read("../src/guides.css");
const adminStyles = read("../src/admin-content-studio.css");

test("guide CMS accepts bounded structured sections without requiring a schema migration", () => {
  assert.match(content, /sections:z\.array\(z\.object\([\s\S]*?heading:z\.string\(\)\.trim\(\)\.min\(2\)\.max\(120\)/);
  assert.match(content, /paragraphs:z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1600\)\)\.min\(1\)\.max\(8\)/);
  assert.match(content, /body=data\.kind==="guide"\?JSON\.stringify\(\{points:data\.points,sections:data\.sections\}\)/);
  assert.match(content, /item\.points\.length\|\|item\.sections\?\.length/);
});

test("admin editor can create and edit long-form headings and paragraphs", () => {
  assert.match(admin, /function addSection\(/);
  assert.match(admin, /function setSectionParagraph\(/);
  assert.match(admin, /function addSectionParagraph\(/);
  assert.match(admin, /sections:draft\.sections\.map/);
  assert.match(admin, /بخش‌های مقاله بلند/);
  assert.match(admin, /افزودن پاراگراف/);
  assert.match(adminStyles, /\.admin-content-section-head/);
});

test("public guide search indexes section headings and paragraph text", () => {
  assert.match(library, /sectionText\s*=\s*\(item\.sections\s*\?\?\s*\[\]\)\.flatMap/);
  assert.match(library, /\.\.\.sectionText/);
});

test("article page renders structured sections and preserves legacy points plus JSON-LD", () => {
  assert.match(article, /guide\.sections\?\.length/);
  assert.match(article, /guide-article-section/);
  assert.match(article, /section\.paragraphs\.map/);
  assert.match(article, /guide\.points\.map/);
  assert.match(article, /guide\.sections \?\? \[\]\)\.map[\s\S]*?section\.paragraphs\.join/);
  assert.match(styles, /\.guide-article-sections/);
  assert.match(styles, /\.guide-article-section p/);
});
