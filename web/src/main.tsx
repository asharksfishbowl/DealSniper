import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DEFAULT_THEME_ID, getTheme } from "./theme";
import { applyTheme } from "./themeCss";
import { ThemeContext } from "./themeContext";
import "./index.css";

function Root() {
  useEffect(() => {
    const show = () => document.body.classList.add("show-cursor");
    const hide = () => document.body.classList.remove("show-cursor");
    let timer = window.setTimeout(hide, 2500); // golden-rule-ignore: idle watchdog; hides the cursor on the ABSENCE of mousemove, which no event reports
    const onMove = () => {
      show();
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, 2500); // golden-rule-ignore: idle watchdog, re-armed by each mousemove event
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(timer);
    };
  }, []);

  return <App />;
}

const theme = getTheme(DEFAULT_THEME_ID);

// Before the first render, so no frame ever paints with the custom properties
// unset. Every colour in the CSS files reads from them.
applyTheme(theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeContext.Provider value={theme}>
      <Root />
    </ThemeContext.Provider>
  </StrictMode>
);
