import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-5xl rounded-xl border bg-white p-8 shadow-sm"><h1 className="text-2xl font-semibold">Quản lý đề nghị sửa HSBA điện tử</h1><p className="mt-2 text-slate-600">React + Vite + TypeScript + Tailwind CSS + shadcn/ui</p></div></main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
