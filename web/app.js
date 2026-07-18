let scheduler = null;
let currentFilter = "all";
const STORAGE_KEY = "taskforge_tasks_v1";

createModule().then((Module) => {
  scheduler = new Module.Scheduler();
  bootUI();
  loadFromStorage();
  render();
});

function bootUI() {
  const app = document.getElementById("app");
  app.classList.remove("loading");
  app.innerHTML = document.getElementById("main-template").innerHTML;

  document.getElementById("submitBtn").addEventListener("click", onSubmit);
  document.getElementById("cancelEdit").addEventListener("click", clearForm);
  document.getElementById("undoBtn").addEventListener("click", () => {
    scheduler.undo();
    persist();
    render();
  });
  document.getElementById("redoBtn").addEventListener("click", () => {
    scheduler.redo();
    persist();
    render();
  });
  document.getElementById("saveBtn").addEventListener("click", () => {
    persist();
    flash("saveBtn", "saved ✓");
  });
  document.getElementById("loadBtn").addEventListener("click", () => {
    rebuildFromStorage();
    render();
  });

  document.querySelectorAll(".filters button").forEach((b) => {
    b.addEventListener("click", () => {
      currentFilter = b.dataset.f;
      document
        .querySelectorAll(".filters button")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      render();
    });
  });
}

function onSubmit() {
  const name = document.getElementById("fName").value.trim();
  if (!name) return;
  const desc = document.getElementById("fDesc").value.trim();
  const pri = parseInt(document.getElementById("fPriority").value) || 1;
  const status = parseInt(document.getElementById("fStatus").value);
  const editId = document.getElementById("editId").value;

  if (editId) {
    const id = parseInt(editId);
    scheduler.modifyTask(id, name, desc, pri, 0);
    scheduler.setStatus(id, status);
  } else {
    const id = scheduler.addTask(name, desc, status, pri, 0);
    if (id > 0 && status !== 0) scheduler.setStatus(id, status);
  }
  clearForm();
  persist();
  render();
}

function editTask(t) {
  document.getElementById("editId").value = t.id;
  document.getElementById("fName").value = t.name;
  document.getElementById("fDesc").value = t.description;
  document.getElementById("fPriority").value = t.priority;
  document.getElementById("fStatus").value = statusCode(t.status);
  document.getElementById("submitBtn").textContent = "Save changes";
  document.getElementById("cancelEdit").style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  document.getElementById("editId").value = "";
  document.getElementById("fName").value = "";
  document.getElementById("fDesc").value = "";
  document.getElementById("fPriority").value = 5;
  document.getElementById("fStatus").value = 0;
  document.getElementById("submitBtn").textContent = "Add task";
  document.getElementById("cancelEdit").style.display = "none";
}

function statusCode(name) {
  return { pending: 0, in_progress: 1, completed: 2 }[name] ?? 0;
}

function getTasks() {
  return JSON.parse(scheduler.allTasks());
}

function render() {
  const tasks = getTasks();
  const nextJson = scheduler.nextTask();
  const nextEl = document.getElementById("nextTask");
  if (nextJson === "null") {
    nextEl.textContent = "no active tasks";
    nextEl.className = "v empty";
  } else {
    const n = JSON.parse(nextJson);
    nextEl.textContent = `${n.name}  ·  P${n.priority}`;
    nextEl.className = "v";
  }

  document.getElementById("count").textContent =
    `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
  document.getElementById("undoBtn").disabled = !scheduler.canUndo();
  document.getElementById("redoBtn").disabled = !scheduler.canRedo();

  const shown = tasks.filter(
    (t) => currentFilter === "all" || t.status === currentFilter,
  );
  const host = document.getElementById("tableHost");

  if (shown.length === 0) {
    host.innerHTML = `<div class="empty-tasks">${tasks.length === 0 ? "No tasks yet — add one on the left." : "No tasks match this filter."}</div>`;
    return;
  }

  shown.sort((a, b) => b.priority - a.priority);
  let html =
    "<table><thead><tr><th>P</th><th>Task</th><th>Status</th><th></th></tr></thead><tbody>";
  for (const t of shown) {
    html += `<tr>
      <td class="pri">${t.priority}</td>
      <td><strong>${escapeHtml(t.name)}</strong>${t.description ? `<br><span style="color:var(--muted);font-size:.72rem">${escapeHtml(t.description)}</span>` : ""}</td>
      <td><span class="st ${t.status}">${t.status.replace("_", " ")}</span></td>
      <td class="row-actions">
        <button data-edit="${t.id}">edit</button>
        ${t.status === "completed" ? `<button disabled>done ✓</button>` : `<button data-cycle="${t.id}">→ next</button>`}
        <button data-del="${t.id}">del</button>
      </td>
    </tr>`;
  }
  html += "</tbody></table>";
  host.innerHTML = html;

  host
    .querySelectorAll("[data-edit]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        editTask(tasks.find((t) => t.id == b.dataset.edit)),
      ),
    );
  host.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      scheduler.removeTask(parseInt(b.dataset.del));
      persist();
      render();
    }),
  );
  host.querySelectorAll("[data-cycle]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = tasks.find((x) => x.id == b.dataset.cycle);
      const cur = statusCode(t.status);
      if (cur >= 2) return;
      scheduler.setStatus(t.id, cur + 1);
      persist();
      render();
    }),
  );
}

function persist() {
  localStorage.setItem(STORAGE_KEY, scheduler.exportJson());
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const rows = JSON.parse(raw);
    for (const t of rows) {
      scheduler.loadFromRow(
        t.name,
        t.description || "",
        statusCode(t.status),
        t.priority,
        t.dueDate || 0,
      );
    }
  } catch (e) {
    console.warn("load failed", e);
  }
}

function rebuildFromStorage() {
  // fresh engine so ids and heap rebuild cleanly from disk
  scheduler = new scheduler.constructor();
  loadFromStorage();
}

function flash(id, msg) {
  const b = document.getElementById(id);
  const old = b.textContent;
  b.textContent = msg;
  setTimeout(() => (b.textContent = old), 1000);
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
