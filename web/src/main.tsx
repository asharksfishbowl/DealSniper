import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function Root() {
  useEffect(() => {
    const show = () => document.body.classList.add("show-cursor");
    const hide = () => document.body.classList.remove("show-cursor");
    let timer = window.setTimeout(hide, 2500);
    const onMove = () => {
      show();
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, 2500);
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
