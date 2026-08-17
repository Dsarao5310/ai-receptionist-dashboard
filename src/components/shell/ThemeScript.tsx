const script = `
(function () {
  try {
    var raw = localStorage.getItem("ai-receptionist-preferences");
    var state = raw ? JSON.parse(raw).state : {};
    var theme = state.theme || "system";
    var accent = state.accent || "indigo";
    var density = state.density || "comfortable";
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
    root.setAttribute("data-accent", accent);
    root.setAttribute("data-density", density);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
