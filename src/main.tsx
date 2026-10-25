import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-arabic";
import "./styles.css";
import "./print-preview.css";
import App from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
