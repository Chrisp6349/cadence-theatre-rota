// -----------------------------------------------------------------------
// theme.js
// Dark mode + text size, shared across every page. Preferences are
// stored in localStorage (per device/browser — same reasoning as the
// My Week name on the dashboard: viewers can't write their own /users
// doc under the current Firestore rules, so this needs no backend).
//
// applyTheme() must run before the page's content renders to avoid a
// flash of the wrong theme — call it at the very top of each page's
// script, before renderShell().
// -----------------------------------------------------------------------

const THEME_KEY = "cadence_theme";       // "light" | "dark"
const SIZE_KEY = "cadence_text_size";    // "sm" | "md" | "lg"
const SIZES = ["sm", "md", "lg"];
const SIZE_LABELS = { sm: "S", md: "M", lg: "L" };

export function getPrefs() {
  return {
    theme: localStorage.getItem(THEME_KEY) || "light",
    textSize: localStorage.getItem(SIZE_KEY) || "md"
  };
}

export function applyTheme() {
  const { theme, textSize } = getPrefs();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.textSize = textSize;
}

function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
}

function setTextSize(size) {
  localStorage.setItem(SIZE_KEY, size);
  applyTheme();
}

// Wires up the dark-mode toggle and text-size buttons inside the given
// container (shell.js calls this after rendering the topbar controls).
export function initThemeControls(container) {
  function refreshButtons() {
    const { theme, textSize } = getPrefs();
    const darkBtn = container.querySelector("#darkModeBtn");
    const label = container.querySelector("#textSizeLabel");
    const downBtn = container.querySelector("#textSizeDownBtn");
    const upBtn = container.querySelector("#textSizeUpBtn");
    if (darkBtn) darkBtn.classList.toggle("active", theme === "dark");
    if (label) label.textContent = SIZE_LABELS[textSize];
    if (downBtn) downBtn.disabled = textSize === SIZES[0];
    if (upBtn) upBtn.disabled = textSize === SIZES[SIZES.length - 1];
  }

  const darkBtn = container.querySelector("#darkModeBtn");
  if (darkBtn) {
    darkBtn.addEventListener("click", () => {
      const { theme } = getPrefs();
      setTheme(theme === "dark" ? "light" : "dark");
      refreshButtons();
    });
  }

  const downBtn = container.querySelector("#textSizeDownBtn");
  if (downBtn) {
    downBtn.addEventListener("click", () => {
      const { textSize } = getPrefs();
      const idx = SIZES.indexOf(textSize);
      if (idx > 0) setTextSize(SIZES[idx - 1]);
      refreshButtons();
    });
  }

  const upBtn = container.querySelector("#textSizeUpBtn");
  if (upBtn) {
    upBtn.addEventListener("click", () => {
      const { textSize } = getPrefs();
      const idx = SIZES.indexOf(textSize);
      if (idx < SIZES.length - 1) setTextSize(SIZES[idx + 1]);
      refreshButtons();
    });
  }

  refreshButtons();
}
