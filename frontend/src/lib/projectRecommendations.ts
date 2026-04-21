import type { Thread } from "@/lib/types";

type ProjectLike = {
  id: string;
  name: string;
  status?: string;
  summary?: string;
};

export type ProjectRecommendation = {
  projectId: string;
  projectName: string;
  score: number;
  reasons: string[];
};

type RecommendInput = {
  text?: string;
  projects: ProjectLike[];
  threads: Thread[];
  selectedThreadIds?: string[];
  maxResults?: number;
};

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function recommendProjects({
  text,
  projects,
  threads,
  selectedThreadIds = [],
  maxResults = 3,
}: RecommendInput): ProjectRecommendation[] {
  const haystack = normalize(text);
  const selectedThreadSet = new Set(selectedThreadIds);
  const selectedThreads = threads.filter((thread) => selectedThreadSet.has(thread.id));
  const selectedProjectIds = Array.from(
    new Set(selectedThreads.map((thread) => thread.project_id).filter(Boolean))
  ) as string[];

  return projects
    .map((project) => {
      const reasons: string[] = [];
      let score = 0;
      const projectThreads = threads.filter((thread) => thread.project_id === project.id);

      if (selectedProjectIds.includes(project.id)) {
        score += selectedProjectIds.length === 1 ? 120 : 60;
        reasons.push(
          selectedProjectIds.length === 1
            ? "已挂靠线程属于该项目"
            : "部分挂靠线程属于该项目"
        );
      }

      if (haystack) {
        if (haystack.includes(normalize(project.name))) {
          score += 100;
          reasons.push("命中项目名");
        }

        for (const thread of projectThreads) {
          const title = normalize(thread.title);
          if (title && haystack.includes(title)) {
            score += 45;
            reasons.push(`命中线程：${thread.title}`);
          }
        }

        const summary = normalize(project.summary);
        if (summary && summary.length >= 4 && haystack.includes(summary.slice(0, 6))) {
          score += 20;
          reasons.push("命中项目摘要");
        }
      }

      if (!haystack && project.status === "active") {
        score += 5;
      }

      return {
        projectId: project.id,
        projectName: project.name,
        score,
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.projectName.localeCompare(b.projectName))
    .slice(0, maxResults);
}
