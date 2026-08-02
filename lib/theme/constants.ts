export type ThemePreference = "light" | "dark" | "system";

/** localStorage key for a persisted manual override. Absent = follow system. */
export const THEME_STORAGE_KEY = "secureenv-theme";

/**
 * Runs as the first child of <body> (see app/layout.tsx), before anything
 * else paints, so a returning visitor with a saved override never sees a
 * flash of the wrong theme. Deliberately tiny and defensive (try/catch
 * around localStorage, which throws in some privacy-mode/embedded
 * contexts) — this has to run correctly in every browser, unconditionally,
 * with no framework or bundler help.
 *
 * Sets `data-theme` on <html> only when there's an explicit override;
 * leaving it unset is what lets globals.css's `@media (prefers-color-
 * scheme: dark)` block keep doing its job for everyone who's never
 * touched the toggle.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
