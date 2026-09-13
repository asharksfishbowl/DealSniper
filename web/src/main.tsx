import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
