import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "@/components/Shell";
import Home from "@/pages/Home";
import Inbox from "@/pages/Inbox";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import ProjectTimeline from "@/pages/ProjectTimeline";
import Threads from "@/pages/Threads";
import ThreadDetail from "@/pages/ThreadDetail";
import Notes from "@/pages/Notes";
import Todos from "@/pages/Todos";
import Timeline from "@/pages/Timeline";
import Reports from "@/pages/Reports";
import ReportComposer from "@/pages/ReportComposer";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects/:id/timeline" element={<ProjectTimeline />} />
        <Route path="threads" element={<Threads />} />
        <Route path="threads/:id" element={<ThreadDetail />} />
        <Route path="notes" element={<Notes />} />
        <Route path="todos" element={<Todos />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportComposer />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
