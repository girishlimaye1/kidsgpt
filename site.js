const students = [
  {
    id: "nova-quill",
    name: "Nova Quill",
    passwordHash: "6996e35e6ac56165038a2a08592d761301119eaf8462c593f842f451176769dd",
    accent: "Ready for launch"
  },
  {
    id: "yoda-sprout",
    name: "Yoda Sprout",
    passwordHash: "708d44a7940c09603c3dfa4b1a3418979545882858f11b7bf055b1e3fe90b19c",
    accent: "Tiny wise builder"
  },
  {
    id: "echo-sparks",
    name: "Puppy Pixel",
    passwordHash: "4868d470d0b7d48c46e49b8a7a815d8203df51ae2f1a14a7edb847a731ea628b",
    accent: "Tail-wagging game maker"
  },
  {
    id: "orbit-bloom",
    name: "Orbit Bloom",
    passwordHash: "3769956c2c6b85d2a5d0a20c7b3dcb6e2c6c5c9b2f861812bb5d9fd24c49ee1c",
    accent: "Garden of stars"
  }
];

const databaseName = "kidsgpt-student-uploads";
const storeName = "uploads";
const objectUrls = new Map();

bootUploadStudio();

async function bootUploadStudio() {
  const container = document.getElementById("studentSlots");

  if (!container) {
    return;
  }

  const database = await openDatabase();
  container.innerHTML = "";

  for (const student of students) {
    const record = await getUploadRecord(database, student.id);
    container.appendChild(createStudentSlot(student, record, database));
  }
}

function createStudentSlot(student, record, database) {
  const slot = document.createElement("article");
  slot.className = "student-slot";
  slot.dataset.studentId = student.id;
  slot.innerHTML = `
    <div class="student-slot-header">
      <div>
        <h3>${student.name}</h3>
        <p>${student.accent}</p>
      </div>
      <span class="student-badge locked">Locked</span>
    </div>
    <p class="slot-help">Enter your secret password to unlock your upload spot.</p>
    <form class="slot-form">
      <label>
        Secret password
        <input name="password" type="password" autocomplete="off" placeholder="Type your password">
      </label>
      <button class="slot-button" type="submit">Unlock slot</button>
      <p class="upload-error" hidden></p>
    </form>
    <div class="upload-panel" hidden>
      <label>
        Choose your quiz file
        <input class="file-input" type="file" accept=".html,.zip,text/html,application/zip">
      </label>
      <p class="upload-hint">Upload index.html if your quiz is one file, or a .zip if it uses extra images.</p>
      <div class="upload-actions">
        <button class="upload-button primary" type="button">Save upload</button>
        <button class="upload-button secondary" type="button">Lock slot</button>
      </div>
      <p class="upload-success" hidden></p>
      <div class="upload-meta"></div>
      <div class="upload-preview"></div>
    </div>
  `;

  const form = slot.querySelector(".slot-form");
  const passwordInput = slot.querySelector('input[name="password"]');
  const errorNode = slot.querySelector(".upload-error");
  const panel = slot.querySelector(".upload-panel");
  const badge = slot.querySelector(".student-badge");
  const fileInput = slot.querySelector(".file-input");
  const saveButton = slot.querySelector(".upload-button.primary");
  const lockButton = slot.querySelector(".upload-button.secondary");
  const successNode = slot.querySelector(".upload-success");
  const metaNode = slot.querySelector(".upload-meta");
  const previewNode = slot.querySelector(".upload-preview");

  let currentRecord = record || null;
  renderStoredUpload(student, currentRecord, metaNode, previewNode);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNode.hidden = true;

    const hash = await sha256(passwordInput.value.trim());

    if (hash !== student.passwordHash) {
      errorNode.textContent = "That password does not match this slot.";
      errorNode.hidden = false;
      return;
    }

    form.hidden = true;
    panel.hidden = false;
    badge.textContent = "Unlocked";
    badge.classList.remove("locked");
    passwordInput.value = "";
  });

  saveButton.addEventListener("click", async () => {
    successNode.hidden = true;
    errorNode.hidden = true;

    const file = fileInput.files[0];

    if (!file) {
      errorNode.textContent = "Choose an HTML file or ZIP file first.";
      errorNode.hidden = false;
      return;
    }

    const recordToSave = {
      studentId: student.id,
      fileName: file.name,
      fileType: file.type || inferFileType(file.name),
      updatedAt: new Date().toISOString(),
      blob: file
    };

    await saveUploadRecord(database, recordToSave);
    currentRecord = recordToSave;
    renderStoredUpload(student, currentRecord, metaNode, previewNode);
    successNode.textContent = "Saved in this browser. You can preview it here and publish it later.";
    successNode.hidden = false;
    fileInput.value = "";
  });

  lockButton.addEventListener("click", () => {
    form.hidden = false;
    panel.hidden = true;
    badge.textContent = "Locked";
    badge.classList.add("locked");
    successNode.hidden = true;
    errorNode.hidden = true;
  });

  return slot;
}

function renderStoredUpload(student, record, metaNode, previewNode) {
  if (!record) {
    metaNode.innerHTML = '<p class="upload-empty">No file uploaded yet.</p>';
    previewNode.innerHTML = '<div class="upload-preview-copy"><p>Once a student uploads a file, the preview or download controls will appear here.</p></div>';
    updateGalleryCard(student, null);
    return;
  }

  const updatedAt = new Date(record.updatedAt).toLocaleString();
  metaNode.innerHTML = `
    <p><strong>Saved file:</strong> ${record.fileName}</p>
    <p><strong>Last update:</strong> ${updatedAt}</p>
  `;

  const objectUrl = getObjectUrl(student.id, record.blob);
  const isHtml = isHtmlFile(record.fileName, record.fileType);

  if (isHtml) {
    previewNode.innerHTML = `
      <iframe title="${student.name} preview" sandbox="allow-scripts" src="${objectUrl}"></iframe>
      <div class="upload-actions">
        <a class="upload-link" href="${objectUrl}" target="_blank" rel="noreferrer">Open preview</a>
        <a class="upload-link" href="${objectUrl}" download="${record.fileName}">Download file</a>
      </div>
    `;
  } else {
    previewNode.innerHTML = `
      <div class="upload-preview-copy">
        <p>${record.fileName} is saved as a ZIP bundle. Download it when you are ready to unpack images and publish the project.</p>
      </div>
      <div class="upload-actions">
        <a class="upload-link" href="${objectUrl}" download="${record.fileName}">Download ZIP</a>
      </div>
    `;
  }

  updateGalleryCard(student, record);
}

function updateGalleryCard(student, record) {
  const cards = document.querySelectorAll(".quiz-card");

  cards.forEach((card) => {
    const title = card.querySelector("h3");

    if (!title || !title.textContent.includes(student.name)) {
      return;
    }

    const description = card.querySelector(".quiz-card-body p");
    const link = card.querySelector(".text-link");

    if (!record) {
      return;
    }

    card.classList.remove("muted");
    description.textContent = `Saved upload: ${record.fileName}`;
    link.textContent = isHtmlFile(record.fileName, record.fileType) ? "See upload below" : "ZIP saved below";
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "studentId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getUploadRecord(database, studentId) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(studentId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function saveUploadRecord(database, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getObjectUrl(studentId, blob) {
  const existingUrl = objectUrls.get(studentId);

  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
  }

  const url = URL.createObjectURL(blob);
  objectUrls.set(studentId, url);
  return url;
}

function inferFileType(fileName) {
  if (fileName.toLowerCase().endsWith(".zip")) {
    return "application/zip";
  }

  return "text/html";
}

function isHtmlFile(fileName, fileType) {
  return fileType.includes("html") || fileName.toLowerCase().endsWith(".html");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
