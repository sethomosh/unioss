// src/main.tsx  — TEMPORARY for debugging
import React from "react";
import { createRoot } from "react-dom/client";
import PerformanceHistory from "./components/PerformanceHistory";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <PerformanceHistory />
  </React.StrictMode>
);
