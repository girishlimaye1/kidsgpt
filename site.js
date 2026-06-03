const reflectionSections = [
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

bootStudentStudio();

async function bootStudentStudio() {
  const container = document.getElementById("studentPageSlot");

  if (!container) {
    return;
  }

  const studentId = container.dataset.studentId;
  const basePath = normalizeBasePath(document.body.dataset.basePath || "/");
  const state = await fetchStudentState(basePath, studentId);
  container.innerHTML = "";
  container.appendChild(createStudentSlot(state, basePath));
}

function createStudentSlot(initialState, basePath) {
  const slot = document.createElement("article");
  slot.className = "student-slot";
  slot.dataset.studentId = initialState.student.id;
  slot.innerHTML = `
    <div class="student-slot-header">
      <div>
        <h3>${initialState.student.name}</h3>
        <p>${initialState.student.accent}</p>
      </div>
      <span class="student-badge locked">Locked</span>
    </div>
    <p class="slot-help">Enter your student password to save drafts and publish your mini area.</p>
    <form class="slot-form">
      <label>
        Student password
        <input name="password" type="password" autocomplete="off" placeholder="Type your password">
      </label>
      <button class="slot-button" type="submit">Unlock studio</button>
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
        Upload your quiz file
        <input class="file-input" type="file" accept=".html,.zip,text/html,application/zip">
      </label>
      <p class="upload-hint">Upload index.html if your quiz is one file, or a .zip if it uses extra images.</p>
      <div class="upload-actions">
        <button class="upload-button primary" type="button">Save draft</button>
        <button class="upload-button publish" type="button">Publish live</button>
        <button class="upload-button secondary" type="button">Lock studio</button>
      </div>
      <p class="upload-success" hidden></p>
      <div class="upload-meta"></div>
      <div class="upload-published"></div>
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
  const publishButton = slot.querySelector(".upload-button.publish");
  const lockButton = slot.querySelector(".upload-button.secondary");
  const successNode = slot.querySelector(".upload-success");
  const metaNode = slot.querySelector(".upload-meta");
  const publishedNode = slot.querySelector(".upload-published");
  const previewNode = slot.querySelector(".upload-preview");
  const reflectionInputs = Array.from(slot.querySelectorAll("[data-reflection-key]"));

  let currentState = initialState;
  let unlockedPassword = "";

  populateReflectionInputs(reflectionInputs, currentState.reflections);
  renderCurrentState(currentState, metaNode, publishedNode, previewNode);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorNode.hidden = true;

    const password = passwordInput.value.trim();

    if (!password) {
      errorNode.textContent = "Type your password first.";
      errorNode.hidden = false;
      return;
    }

    unlockedPassword = password;
    form.hidden = true;
    panel.hidden = false;
    badge.textContent = "Unlocked";
    badge.classList.remove("locked");
    passwordInput.value = "";
  });

  saveButton.addEventListener("click", async () => {
    successNode.hidden = true;
    errorNode.hidden = true;

    const reflections = collectReflections(reflectionInputs);
    const quizFile = fileInput.files[0] || null;
    const prototypeFile = prototypeInput.files[0] || null;

    if (!quizFile && !prototypeFile && !hasReflectionContent(reflections)) {
      errorNode.textContent = "Add notes or choose a file before saving.";
      errorNode.hidden = false;
      return;
    }

    try {
      currentState = await saveDraft(basePath, currentState.student.id, unlockedPassword, reflections, prototypeFile, quizFile);
      populateReflectionInputs(reflectionInputs, currentState.reflections);
      renderCurrentState(currentState, metaNode, publishedNode, previewNode);
      successNode.textContent = "Saved on the Mac mini. You can come back to this page and keep working.";
      successNode.hidden = false;
      prototypeInput.value = "";
      fileInput.value = "";
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    }
  });

  publishButton.addEventListener("click", async () => {
    successNode.hidden = true;
    errorNode.hidden = true;

    try {
      currentState = await publishDraft(basePath, currentState.student.id, unlockedPassword);
      renderCurrentState(currentState, metaNode, publishedNode, previewNode);
      successNode.textContent = "Published live. Your mini area now has its own public page.";
      successNode.hidden = false;
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    }
  });

  lockButton.addEventListener("click", () => {
    unlockedPassword = "";
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
  return reflectionSections.map((section) => `
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

function renderCurrentState(state, metaNode, publishedNode, previewNode) {
  const reflectionCount = Object.values(state.reflections || {}).filter((value) => String(value || "").trim().length > 0).length;
  const updatedAt = state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "Not saved yet";

  metaNode.innerHTML = `
    <p><strong>Paper prototype:</strong> ${state.draft.prototypeName || "No file yet"}</p>
    <p><strong>Saved quiz:</strong> ${state.draft.quizName || "No file yet"}</p>
    <p><strong>Notes saved:</strong> ${reflectionCount}</p>
    <p><strong>Last save:</strong> ${updatedAt}</p>
  `;

  if (state.published?.url) {
    const publishedAt = state.published.publishedAt ? new Date(state.published.publishedAt).toLocaleString() : "Live now";
    publishedNode.innerHTML = `
      <div class="upload-note">
        <strong>Live mini area:</strong> <a class="text-link" href="${state.published.url}" target="_blank" rel="noreferrer">Open published page</a>
        <p class="upload-hint">Last published: ${publishedAt}</p>
      </div>
    `;
  } else {
    publishedNode.innerHTML = "";
  }

  const previewParts = [];

  if (state.draft.prototypeUrl) {
    const prototypeMarkup = isImageType(state.draft.prototypeType, state.draft.prototypeName)
      ? `
        <div class="upload-preview-copy">
          <p><strong>Paper prototype preview</strong></p>
        </div>
        <img class="prototype-preview" src="${state.draft.prototypeUrl}" alt="${state.student.name} paper prototype">
        <div class="upload-actions">
          <a class="upload-link" href="${state.draft.prototypeUrl}" target="_blank" rel="noreferrer">Open sketch</a>
          <a class="upload-link" href="${state.draft.prototypeUrl}" download="${state.draft.prototypeName}">Download sketch</a>
        </div>
      `
      : `
        <div class="upload-preview-copy">
          <p><strong>Paper prototype saved:</strong> ${state.draft.prototypeName}</p>
        </div>
        <div class="upload-actions">
          <a class="upload-link" href="${state.draft.prototypeUrl}" download="${state.draft.prototypeName}">Download prototype</a>
        </div>
      `;

    previewParts.push(prototypeMarkup);
  }

  if (state.draft.quizUrl) {
    const quizMarkup = state.draft.isHtmlQuiz
      ? `
        <div class="upload-preview-copy">
          <p><strong>Draft quiz preview</strong></p>
        </div>
        <iframe title="${state.student.name} draft quiz" sandbox="allow-scripts" src="${state.draft.quizUrl}"></iframe>
        <div class="upload-actions">
          <a class="upload-link" href="${state.draft.quizUrl}" target="_blank" rel="noreferrer">Open draft quiz</a>
          <a class="upload-link" href="${state.draft.quizUrl}" download="${state.draft.quizName}">Download quiz file</a>
        </div>
      `
      : `
        <div class="upload-preview-copy">
          <p><strong>Draft ZIP saved:</strong> ${state.draft.quizName}</p>
        </div>
        <div class="upload-actions">
          <a class="upload-link" href="${state.draft.quizUrl}" download="${state.draft.quizName}">Download ZIP</a>
        </div>
      `;

    previewParts.push(quizMarkup);
  }

  if (previewParts.length === 0) {
    previewNode.innerHTML = '<div class="upload-preview-copy"><p>No draft files yet. Save your notes, sketch, or quiz when you are ready.</p></div>';
    return;
  }

  previewNode.innerHTML = previewParts.join("");
}

function normalizeBasePath(value) {
  if (!value || value === "/") {
    return "/";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildUrl(basePath, suffix) {
  return basePath === "/" ? suffix : `${basePath}${suffix}`;
}

async function fetchStudentState(basePath, studentId) {
  const response = await fetch(buildUrl(basePath, `/api/student/${studentId}`));
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Could not load the student page.");
  }

  return payload;
}

async function saveDraft(basePath, studentId, password, reflections, prototypeFile, quizFile) {
  const formData = new FormData();
  formData.append("password", password);
  formData.append("reflections", JSON.stringify(reflections));

  if (prototypeFile) {
    formData.append("prototypeFile", prototypeFile);
  }

  if (quizFile) {
    formData.append("quizFile", quizFile);
  }

  const response = await fetch(buildUrl(basePath, `/api/student/${studentId}/save`), {
    method: "POST",
    body: formData
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Could not save draft.");
  }

  return payload;
}

async function publishDraft(basePath, studentId, password) {
  const response = await fetch(buildUrl(basePath, `/api/student/${studentId}/publish`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Could not publish live.");
  }

  return payload;
}

function isImageType(mimeType, fileName) {
  return mimeType.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(fileName || "");
}
