const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const ROOT = __dirname;
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "/");
const PORT = Number(process.env.PORT || 9012);
const STORAGE_DIR = path.join(ROOT, "storage");
const DRAFTS_DIR = path.join(STORAGE_DIR, "drafts");
const PUBLISHED_DIR = path.join(STORAGE_DIR, "published");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

const students = {
  "nova-quill": {
    id: "nova-quill",
    name: "Nova Quill",
    accent: "Ready for launch",
    password: "nova108",
    page: path.join(ROOT, "students", "nova-quill", "index.html")
  },
  "yoda-sprout": {
    id: "yoda-sprout",
    name: "Yoda Sprout",
    accent: "Tiny wise builder",
    password: "yoda108",
    page: path.join(ROOT, "students", "yoda-sprout", "index.html")
  },
  "echo-sparks": {
    id: "echo-sparks",
    name: "Puppy Pixel",
    accent: "Tail-wagging game maker",
    password: "puppy108",
    page: path.join(ROOT, "students", "echo-sparks", "index.html")
  },
  "orbit-bloom": {
    id: "orbit-bloom",
    name: "Orbit Bloom",
    accent: "Garden of stars",
    password: "orbit108",
    page: path.join(ROOT, "students", "orbit-bloom", "index.html")
  }
};

app.use(express.json({ limit: "1mb" }));

app.get("/", (_request, response) => {
  if (BASE_PATH === "/") {
    response.sendFile(path.join(ROOT, "index.html"));
    return;
  }

  response.redirect(routePath("/"));
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, basePath: BASE_PATH });
});

app.get(routePath("/"), (_request, response) => {
  response.sendFile(path.join(ROOT, "index.html"));
});

app.get(routePath("/index.html"), (_request, response) => {
  response.sendFile(path.join(ROOT, "index.html"));
});

app.get(routePath("/styles.css"), (_request, response) => {
  response.sendFile(path.join(ROOT, "styles.css"));
});

app.get(routePath("/site.js"), (_request, response) => {
  response.sendFile(path.join(ROOT, "site.js"));
});

app.get(routePath("/quizzes/library-legend/"), (_request, response) => {
  response.sendFile(path.join(ROOT, "quizzes", "library-legend", "index.html"));
});

app.get(routePath("/quizzes/library-legend/index.html"), (_request, response) => {
  response.sendFile(path.join(ROOT, "quizzes", "library-legend", "index.html"));
});

app.get(routePath("/games/robot-library/"), (_request, response) => {
  response.sendFile(path.join(ROOT, "games", "robot-library", "index.html"));
});

app.get(routePath("/games/robot-library/index.html"), (_request, response) => {
  response.sendFile(path.join(ROOT, "games", "robot-library", "index.html"));
});

app.get(routePath("/students/:studentId/"), (request, response) => {
  const student = getStudentOrNull(request.params.studentId);

  if (!student) {
    response.status(404).send("Student page not found.");
    return;
  }

  response.sendFile(student.page);
});

app.get(routePath("/students/:studentId/index.html"), (request, response) => {
  const student = getStudentOrNull(request.params.studentId);

  if (!student) {
    response.status(404).send("Student page not found.");
    return;
  }

  response.sendFile(student.page);
});

app.get(routePath("/api/student/:studentId"), async (request, response) => {
  const student = getStudentOrNull(request.params.studentId);

  if (!student) {
    response.status(404).json({ error: "Unknown student." });
    return;
  }

  try {
    await ensureStorage();
    const metadata = await readMetadata(student.id);
    response.json(buildStudentState(student, metadata));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Could not load student data." });
  }
});

app.post(
  routePath("/api/student/:studentId/save"),
  upload.fields([
    { name: "quizFile", maxCount: 1 },
    { name: "prototypeFile", maxCount: 1 }
  ]),
  async (request, response) => {
    const student = getStudentOrNull(request.params.studentId);

    if (!student) {
      response.status(404).json({ error: "Unknown student." });
      return;
    }

    try {
      assertPassword(student, request.body.password);
      await ensureStorage();

      const metadata = await readMetadata(student.id);
      const reflections = parseReflections(request.body.reflections);
      const quizFile = request.files?.quizFile?.[0] || null;
      const prototypeFile = request.files?.prototypeFile?.[0] || null;

      if (!quizFile && !prototypeFile && !hasReflectionContent(reflections)) {
        response.status(400).json({ error: "Add notes or upload a file before saving." });
        return;
      }

      metadata.reflections = reflections;
      metadata.updatedAt = new Date().toISOString();

      if (quizFile) {
        metadata.quiz = await saveDraftFile(student.id, "quiz", quizFile);
      }

      if (prototypeFile) {
        metadata.prototype = await saveDraftFile(student.id, "prototype", prototypeFile);
      }

      await writeMetadata(student.id, metadata);
      response.json(buildStudentState(student, metadata));
    } catch (error) {
      console.error(error);
      response.status(getStatusCode(error)).json({ error: error.message || "Could not save draft." });
    }
  }
);

app.post(routePath("/api/student/:studentId/publish"), async (request, response) => {
  const student = getStudentOrNull(request.params.studentId);

  if (!student) {
    response.status(404).json({ error: "Unknown student." });
    return;
  }

  try {
    assertPassword(student, request.body.password);
    await ensureStorage();
    const metadata = await readMetadata(student.id);

    if (!metadata.quiz) {
      response.status(400).json({ error: "Upload a quiz file before publishing." });
      return;
    }

    await publishStudent(student.id, metadata);
    metadata.published = {
      publishedAt: new Date().toISOString(),
      url: routePath(`/published/${student.id}/`)
    };
    metadata.updatedAt = new Date().toISOString();

    await writeMetadata(student.id, metadata);
    response.json(buildStudentState(student, metadata));
  } catch (error) {
    console.error(error);
    response.status(getStatusCode(error)).json({ error: error.message || "Could not publish student page." });
  }
});

app.get(routePath("/drafts/:studentId/quiz"), async (request, response) => {
  await sendDraftAsset(request, response, "quiz");
});

app.get(routePath("/drafts/:studentId/prototype"), async (request, response) => {
  await sendDraftAsset(request, response, "prototype");
});

app.use(routePath("/published"), express.static(PUBLISHED_DIR, { index: "index.html" }));

app.listen(PORT, "127.0.0.1", async () => {
  await ensureStorage();
  console.log(`KIDSGPT running on http://127.0.0.1:${PORT}${routePath("/")}`);
});

function normalizeBasePath(value) {
  if (value === "/" || value === "") {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") && withLeadingSlash !== "/" ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function routePath(suffix) {
  if (BASE_PATH === "/") {
    return suffix || "/";
  }

  return `${BASE_PATH}${suffix}`;
}

function getStudentOrNull(studentId) {
  return students[studentId] || null;
}

function assertPassword(student, password) {
  if ((password || "").trim() !== student.password) {
    const error = new Error("That password does not match this student page.");
    error.statusCode = 403;
    throw error;
  }
}

function getStatusCode(error) {
  return error.statusCode || 500;
}

async function ensureStorage() {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
}

function draftDir(studentId) {
  return path.join(DRAFTS_DIR, studentId);
}

function publishedDir(studentId) {
  return path.join(PUBLISHED_DIR, studentId);
}

function metadataPath(studentId) {
  return path.join(draftDir(studentId), "metadata.json");
}

async function readMetadata(studentId) {
  try {
    const raw = await fs.readFile(metadataPath(studentId), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        studentId,
        reflections: {}
      };
    }

    throw error;
  }
}

async function writeMetadata(studentId, metadata) {
  await fs.mkdir(draftDir(studentId), { recursive: true });
  await fs.writeFile(metadataPath(studentId), JSON.stringify(metadata, null, 2));
}

function parseReflections(raw) {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function hasReflectionContent(reflections) {
  return Object.values(reflections).some((value) => String(value || "").trim().length > 0);
}

async function saveDraftFile(studentId, kind, file) {
  await fs.mkdir(draftDir(studentId), { recursive: true });
  await removeExistingKindFiles(studentId, kind);
  assertAllowedUpload(kind, file.originalname, file.mimetype);

  const extension = chooseExtension(file.originalname, file.mimetype, kind);
  const storedName = `${kind}${extension}`;
  const targetPath = path.join(draftDir(studentId), storedName);
  await fs.writeFile(targetPath, file.buffer);

  return {
    originalName: file.originalname,
    storedName,
    mimeType: file.mimetype || mimeTypeFromExtension(extension)
  };
}

function assertAllowedUpload(kind, originalName, mimeType) {
  const lower = (originalName || "").toLowerCase();

  if (kind === "quiz") {
    if (lower.endsWith(".html") || lower.endsWith(".zip") || mimeType === "text/html" || mimeType === "application/zip") {
      return;
    }
  }

  if (kind === "prototype") {
    if (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".pdf") ||
      mimeType.startsWith("image/") ||
      mimeType === "application/pdf"
    ) {
      return;
    }
  }

  const error = new Error("That file type is not allowed here.");
  error.statusCode = 400;
  throw error;
}

async function removeExistingKindFiles(studentId, kind) {
  try {
    const names = await fs.readdir(draftDir(studentId));

    await Promise.all(
      names
        .filter((name) => name.startsWith(`${kind}.`) || name === kind)
        .map((name) => fs.rm(path.join(draftDir(studentId), name), { force: true }))
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function chooseExtension(originalName, mimeType, kind) {
  const ext = path.extname(originalName || "");

  if (ext) {
    return ext.toLowerCase();
  }

  if (mimeType === "application/zip") {
    return ".zip";
  }

  if (mimeType === "application/pdf") {
    return ".pdf";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return kind === "quiz" ? ".html" : ".bin";
}

function mimeTypeFromExtension(extension) {
  switch (extension) {
    case ".html":
      return "text/html";
    case ".zip":
      return "application/zip";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function sendDraftAsset(request, response, kind) {
  const student = getStudentOrNull(request.params.studentId);

  if (!student) {
    response.status(404).send("Unknown student.");
    return;
  }

  try {
    const metadata = await readMetadata(student.id);
    const fileInfo = metadata[kind];

    if (!fileInfo) {
      response.status(404).send("Draft file not found.");
      return;
    }

    response.type(fileInfo.mimeType || "application/octet-stream");
    response.sendFile(path.join(draftDir(student.id), fileInfo.storedName));
  } catch (error) {
    console.error(error);
    response.status(500).send("Could not load draft file.");
  }
}

async function publishStudent(studentId, metadata) {
  const liveDir = publishedDir(studentId);
  await fs.rm(liveDir, { recursive: true, force: true });
  await fs.mkdir(liveDir, { recursive: true });

  const quizPath = path.join(draftDir(studentId), metadata.quiz.storedName);
  const isZip = metadata.quiz.storedName.toLowerCase().endsWith(".zip");

  if (isZip) {
    await extractZipToPublished(quizPath, liveDir);
  } else {
    await fs.copyFile(quizPath, path.join(liveDir, "index.html"));
  }

  if (metadata.prototype) {
    const prototypePath = path.join(draftDir(studentId), metadata.prototype.storedName);
    await fs.copyFile(prototypePath, path.join(liveDir, metadata.prototype.originalName));
  }
}

async function extractZipToPublished(zipPath, destination) {
  const zip = new AdmZip(zipPath);

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const relativePath = sanitizeZipEntry(entry.entryName);

    if (!relativePath) {
      continue;
    }

    const targetPath = path.join(destination, relativePath);
    const targetDir = path.dirname(targetPath);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, entry.getData());
  }

  await normalizeExtractedZip(destination);

  const rootIndex = path.join(destination, "index.html");

  try {
    await fs.access(rootIndex);
  } catch {
    const error = new Error("ZIP publish needs an index.html file at the top level.");
    error.statusCode = 400;
    throw error;
  }
}

function sanitizeZipEntry(entryName) {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!normalized || normalized.includes("..")) {
    return null;
  }

  return normalized;
}

async function normalizeExtractedZip(destination) {
  const names = await fs.readdir(destination, { withFileTypes: true });
  const rootIndex = path.join(destination, "index.html");

  try {
    await fs.access(rootIndex);
    return;
  } catch {
    // keep going
  }

  if (names.length !== 1 || !names[0].isDirectory()) {
    return;
  }

  const nestedRoot = path.join(destination, names[0].name);
  const nestedIndex = path.join(nestedRoot, "index.html");

  try {
    await fs.access(nestedIndex);
  } catch {
    return;
  }

  const nestedEntries = await fs.readdir(nestedRoot);

  for (const name of nestedEntries) {
    await fs.rename(path.join(nestedRoot, name), path.join(destination, name));
  }

  await fs.rm(nestedRoot, { recursive: true, force: true });
}

function buildStudentState(student, metadata) {
  return {
    basePath: BASE_PATH,
    student: {
      id: student.id,
      name: student.name,
      accent: student.accent
    },
    reflections: metadata.reflections || {},
    updatedAt: metadata.updatedAt || null,
    draft: {
      prototypeName: metadata.prototype?.originalName || "",
      prototypeType: metadata.prototype?.mimeType || "",
      prototypeUrl: metadata.prototype ? `${BASE_PATH}/drafts/${student.id}/prototype` : "",
      quizName: metadata.quiz?.originalName || "",
      quizType: metadata.quiz?.mimeType || "",
      quizUrl: metadata.quiz ? `${BASE_PATH}/drafts/${student.id}/quiz` : "",
      isHtmlQuiz: Boolean(metadata.quiz?.storedName && metadata.quiz.storedName.toLowerCase().endsWith(".html"))
    },
    published: metadata.published || null
  };
}
