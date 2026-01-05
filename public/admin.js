const API_URL = "/api/admin";

let token = localStorage.getItem("admin_token");
let currentPage = 1;
let totalPages = 1;

// DOM Elements
const loginContainer = document.getElementById("login-container");
const dashboardContainer = document.getElementById("dashboard-container");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const exportBtn = document.getElementById("export-btn");
const cleanupBtn = document.getElementById("cleanup-btn");
const cleanupAllBtn = document.getElementById("cleanup-all-btn");
const daysInput = document.getElementById("days");
const resultsBody = document.getElementById("results-body");
const totalResultsEl = document.getElementById("total-results");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInfo = document.getElementById("page-info");

// Modal elements
const modalOverlay = document.getElementById("modal-overlay");
const modalMessage = document.getElementById("modal-message");
const modalConfirm = document.getElementById("modal-confirm");
const modalCancel = document.getElementById("modal-cancel");

// Custom confirm modal
function showConfirmModal(message) {
  return new Promise((resolve) => {
    modalMessage.textContent = message;
    modalOverlay.classList.remove("hidden");

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      modalOverlay.classList.add("hidden");
      modalConfirm.removeEventListener("click", handleConfirm);
      modalCancel.removeEventListener("click", handleCancel);
    };

    modalConfirm.addEventListener("click", handleConfirm);
    modalCancel.addEventListener("click", handleCancel);
  });
}

// Check if already logged in
if (token) {
  showDashboard();
}

// Login form submit
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error("Identifiants incorrects");
    }

    const data = await response.json();
    token = data.token;
    localStorage.setItem("admin_token", token);
    showDashboard();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  token = null;
  localStorage.removeItem("admin_token");
  showLogin();
});

// Export CSV
exportBtn.addEventListener("click", async () => {
  try {
    const response = await fetch(`${API_URL}/results/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz-results.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert("Erreur lors de l'export");
  }
});

// Cleanup old results
cleanupBtn.addEventListener("click", async () => {
  const days = daysInput.value;

  const confirmed = await showConfirmModal(
    `Supprimer tous les résultats de plus de ${days} jours ?`
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/results/old?days=${days}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();
    await showConfirmModal(data.message);
    loadResults();
  } catch (error) {
    await showConfirmModal("Erreur lors du nettoyage");
  }
});

// Delete ALL results
cleanupAllBtn.addEventListener("click", async () => {
  const confirmed = await showConfirmModal(
    "Supprimer TOUS les résultats ? Cette action est irréversible."
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/results/all`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();
    await showConfirmModal(data.message);
    loadResults();
  } catch (error) {
    await showConfirmModal("Erreur lors de la suppression");
  }
});

// Pagination
prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadResults();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadResults();
  }
});

function showLogin() {
  loginContainer.classList.remove("hidden");
  dashboardContainer.classList.add("hidden");
}

function showDashboard() {
  loginContainer.classList.add("hidden");
  dashboardContainer.classList.remove("hidden");
  loadResults();
}

async function loadResults() {
  try {
    const response = await fetch(`${API_URL}/results?page=${currentPage}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await response.json();
    totalPages = data.pagination.totalPages;

    // Update stats
    totalResultsEl.textContent = data.pagination.total;

    // Update table
    resultsBody.innerHTML = data.results
      .map(
        (r) => `
        <tr>
          <td>${r.firstname}</td>
          <td>${r.email}</td>
          <td>${r.attempts}</td>
          <td>${r.best_score}/${r.total_questions} (${Math.round((r.best_score / r.total_questions) * 100)}%)</td>
          <td>${r.avg_score}/${r.total_questions}</td>
          <td>${new Date(r.last_attempt).toLocaleString("fr-FR")}</td>
        </tr>
      `
      )
      .join("");

    // Update pagination
    pageInfo.textContent = `Page ${currentPage} / ${totalPages || 1}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  } catch (error) {
    console.error("Error loading results:", error);
  }
}

function handleUnauthorized() {
  token = null;
  localStorage.removeItem("admin_token");
  showLogin();
  loginError.textContent = "Session expirée, veuillez vous reconnecter";
}
