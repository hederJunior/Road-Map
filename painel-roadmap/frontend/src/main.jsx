import React from "react";
import { createRoot } from "react-dom/client";
import PainelRoadmap from "./PainelRoadmap.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div style={{ padding: 16 }}>
      <PainelRoadmap />
    </div>
  </React.StrictMode>
);
