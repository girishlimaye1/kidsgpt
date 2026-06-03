const students = [
  {
    id: "nova-quill",
    name: "Nova Quill",
    passwordHash: "50ef044b6d6038c12875bb418d6fb425de7772dbd018250491ad0af458878019",
    accent: "Ready for launch"
  },
  {
    id: "yoda-sprout",
    name: "Yoda Sprout",
    passwordHash: "e0208c7cab91aee67d39c49c6c1b6af0975a1bbc78a68201ded12bea020c4a94",
    accent: "Tiny wise builder"
  },
  {
    id: "echo-sparks",
    name: "Puppy Pixel",
    passwordHash: "99f7d3ac438929b39bd81f527025e89e8215377831b1b9565644b51973308d64",
    accent: "Tail-wagging game maker"
  },
  {
    id: "orbit-bloom",
    name: "Orbit Bloom",
    passwordHash: "d195017541601652e0cf42fc0a4a9fb2a02a76cade7a58f88d17bc55c0593f48",
    accent: "Garden of stars"
  }
];

const databaseName = "kidsgpt-student-uploads";
const storeName = "uploads";
const objectUrls = new Map();
const reflectionPrompts = [
  {
    title: "AI warm-up",
    intro: "Start with a few thoughts about AI itself.",
    prompts: [
      {
        key: "whatIsAi",
        label: "What is AI?",
        placeholder: "Write what you think AI is in your own words."
      },
      {
        key: "whatCanAiDo",
        label: "What can AI do well?",
        placeholder: "List a few good things AI can help with."
      },
      {
        key: "goodAndBad",
        label: "What is one good thing and one risky thing about AI?",
        placeholder: "Example: AI can help me learn, but it can also be wrong."
      }
    ]
  },
  {
    title: "What I learned from my human",
    intro: "Do your empathy interview first, then write down what you learned.",
    prompts: [
      {
        key: "likes",
        label: "What kinds of quizzes or games do they like?",
        placeholder: "Animals, funny quizzes, sports, mystery, cozy stories..."
      },
      {
        key: "notLikes",
        label: "What do they find boring, confusing, or annoying?",
        placeholder: "Too many buttons, mean jokes, too much reading..."
      },
      {
        key: "surprised",
        label: "What surprised you?",
        placeholder: "Write one thing you learned that changed your idea."
      }
    ]
  }
];

bootUploadStudio();

async function bootUploadStudio() {
  const singleSlot = document.getElementById("studentPageSlot");
  const singleStudentId = singleSlot?.dataset.studentId;

  if (singleSlot && singleStudentId) {
    const database = await openDatabase();
    const student = students.find((entry) => entry.id === singleStudentId);

    if (!student) {
      return;
    }

    const record = await getUploadRecord(database, student.id);
    singleSlot.innerHTML = "";
    singleSlot.appendChild(createStudentSlot(student, record, database));
    return;
  }

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
      <div class="reflection-box">
        ${renderReflectionSections()}
      </div>
      <label>
        Upload your paper prototype
        <input class="prototype-input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf">
      </label>
      <p class="upload-hint">Take a photo of your paper sketch and save it here too.</p>
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
  const prototypeInput = slot.querySelector(".prototype-input");
  const fileInput = slot.querySelector(".file-input");
  const saveButton = slot.querySelector(".upload-button.primary");
  const lockButton = slot.querySelector(".upload-button.secondary");
  const successNode = slot.querySelector(".upload-success");
  const metaNode = slot.querySelector(".upload-meta");
  const previewNode = slot.querySelector(".upload-preview");
  const reflectionInputs = Array.from(slot.querySelectorAll("[data-reflection-key]"));

  let currentRecord = record || null;
  populateReflectionInputs(reflectionInputs, currentRecord?.reflections);
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
    const prototypeFile = prototypeInput.files[0];
    const reflections = collectReflections(reflectionInputs);

    if (!file && !prototypeFile && !hasReflectionContent(reflections)) {
      errorNode.textContent = "Add an answer or choose a file before saving.";
      errorNode.hidden = false;
      return;
    }

    const recordToSave = {
      studentId: student.id,
      fileName: file ? file.name : currentRecord?.fileName || "",
      fileType: file ? (file.type || inferFileType(file.name)) : currentRecord?.fileType || "",
      prototypeName: prototypeFile ? prototypeFile.name : currentRecord?.prototypeName || "",
      prototypeType: prototypeFile ? (prototypeFile.type || inferPrototypeType(prototypeFile.name)) : currentRecord?.prototypeType || "",
      updatedAt: new Date().toISOString(),
      blob: file || currentRecord?.blob || null,
      prototypeBlob: prototypeFile || currentRecord?.prototypeBlob || null,
      reflections
    };

    await saveUploadRecord(database, recordToSave);
    currentRecord = recordToSave;
    renderStoredUpload(student, currentRecord, metaNode, previewNode);
    successNode.textContent = "Saved in this browser. You can preview it here and publish it later.";
    successNode.hidden = false;
    fileInput.value = "";
    prototypeInput.value = "";
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

function renderReflectionSections() {
  return reflectionPrompts.map((section) => `
    <div class="reflection-section">
      <h4>${section.title}</h4>
      <p class="reflection-intro">${section.intro}</p>
      <div class="reflection-form">
        ${section.prompts.map((prompt) => `
          <label>
            ${prompt.label}
            <textarea data-reflection-key="${prompt.key}" placeholder="${prompt.placeholder}"></textarea>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderStoredUpload(student, record, metaNode, previewNode) {
  if (!record) {
    metaNode.innerHTML = '<p class="upload-empty">No file uploaded yet.</p>';
    previewNode.innerHTML = '<div class="upload-preview-copy"><p>Once a student uploads a file, the preview or download controls will appear here.</p></div>';
    updateGalleryCard(student, null);
    return;
  }

  const updatedAt = new Date(record.updatedAt).toLocaleString();
  const reflectionCount = countReflectionAnswers(record.reflections);
  metaNode.innerHTML = `
    <p><strong>Paper prototype:</strong> ${record.prototypeName || "No file yet"}</p>
    <p><strong>Saved quiz:</strong> ${record.fileName || "No file yet"}</p>
    <p><strong>Warm-up answers:</strong> ${reflectionCount} saved</p>
    <p><strong>Last update:</strong> ${updatedAt}</p>
  `;

  const previewParts = [];

  if (record.prototypeBlob) {
    const prototypeUrl = getObjectUrl(`${student.id}-prototype`, record.prototypeBlob);
    const prototypeIsImage = isPrototypeImage(record.prototypeName, record.prototypeType);

    previewParts.push(prototypeIsImage
      ? `
        <div class="upload-preview-copy">
          <p><strong>Paper prototype preview</strong></p>
        </div>
        <img class="prototype-preview" src="${prototypeUrl}" alt="${student.name} paper prototype">
        <div class="upload-actions">
          <a class="upload-link" href="${prototypeUrl}" target="_blank" rel="noreferrer">Open sketch</a>
          <a class="upload-link" href="${prototypeUrl}" download="${record.prototypeName}">Download sketch</a>
        </div>
      `
      : `
        <div class="upload-preview-copy">
          <p><strong>Paper prototype saved:</strong> ${record.prototypeName}</p>
        </div>
        <div class="upload-actions">
          <a class="upload-link" href="${prototypeUrl}" download="${record.prototypeName}">Download prototype</a>
        </div>
      `
    );
  }

  if (!record.blob) {
    previewParts.push('<div class="upload-preview-copy"><p>Warm-up answers saved. Upload a quiz file whenever the student is ready.</p></div>');
    previewNode.innerHTML = previewParts.join("");
    updateGalleryCard(student, record);
    return;
  }

  const objectUrl = getObjectUrl(student.id, record.blob);
  const isHtml = isHtmlFile(record.fileName, record.fileType);

  if (isHtml) {
    previewParts.push(`
      <iframe title="${student.name} preview" sandbox="allow-scripts" src="${objectUrl}"></iframe>
      <div class="upload-actions">
        <a class="upload-link" href="${objectUrl}" target="_blank" rel="noreferrer">Open preview</a>
        <a class="upload-link" href="${objectUrl}" download="${record.fileName}">Download file</a>
      </div>
    `);
  } else {
    previewParts.push(`
      <div class="upload-preview-copy">
        <p>${record.fileName} is saved as a ZIP bundle. Download it when you are ready to unpack images and publish the project.</p>
      </div>
      <div class="upload-actions">
        <a class="upload-link" href="${objectUrl}" download="${record.fileName}">Download ZIP</a>
      </div>
    `);
  }

  previewNode.innerHTML = previewParts.join("");
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
    if (record.fileName) {
      description.textContent = `Saved upload: ${record.fileName}`;
      link.textContent = isHtmlFile(record.fileName, record.fileType) ? "See upload below" : "ZIP saved below";
    } else {
      description.textContent = "Warm-up answers saved. Quiz upload can happen next.";
      link.textContent = "Continue below";
    }
  });
}

function populateReflectionInputs(inputs, reflections = {}) {
  inputs.forEach((input) => {
    input.value = reflections[input.dataset.reflectionKey] || "";
  });
}

function collectReflections(inputs) {
  return inputs.reduce((result, input) => {
    result[input.dataset.reflectionKey] = input.value.trim();
    return result;
  }, {});
}

function hasReflectionContent(reflections) {
  return Object.values(reflections).some((value) => value.length > 0);
}

function countReflectionAnswers(reflections = {}) {
  return Object.values(reflections).filter((value) => value && value.trim().length > 0).length;
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

function inferPrototypeType(fileName) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return "";
}

function isHtmlFile(fileName, fileType) {
  return fileType.includes("html") || fileName.toLowerCase().endsWith(".html");
}

function isPrototypeImage(fileName, fileType) {
  return fileType.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(fileName);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
