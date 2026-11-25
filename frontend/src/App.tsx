import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { BatchPage } from "./pages/BatchPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { QueuePage } from "./pages/QueuePage";
import { SystemPage } from "./pages/SystemPage";
import { TriagePage } from "./pages/TriagePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TriagePage />} />
        <Route path="batch" element={<BatchPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
