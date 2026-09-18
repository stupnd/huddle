/**
 * Theme preference: "system" follows the OS, "light" and "dark" pin it.
 * Stored per viewer in localStorage under huddle:theme and applied as
 * data-theme on <html>. tokens.css reads that attribute.
 */
export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "huddle:theme";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Runs before first paint so a pinned theme never flashes. Kept tiny and
 * dependency free because it is inlined as a script in the document head.
 */
export const themeBootScript = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)}));if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
