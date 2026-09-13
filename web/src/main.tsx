import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./ThemeProvider";
import { applyTheme } from "./themeCss";
import { readStoredTheme } from "./themePersistence";
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

// localStorage is synchronous, so the saved theme is resolved and applied
// before the first render: the first frame is already in the persisted theme,
// never the default then a swap (Requirement 5.3).
const theme = readStoredTheme();
applyTheme(theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider initialTheme={theme}>
      <Root />
    </ThemeProvider>
  </StrictMode>
);
