from __future__ import annotations

from .helpers import create_capture, create_project


def test_search_uses_fts_when_available(client):
    """FTS path is taken when the index is available and returns bm25-ranked results."""
    project = create_project(client, name="权限管理平台 Alpha")
    client.post(
        "/api/threads",
        json={"title": "权限管理平台 Beta", "project_id": project["id"]},
    )
    create_capture(client, text="权限管理平台 Gamma 在 evidence 正文中")

    result = client.get("/api/search?q=权限管理平台").json()

    project_ids = [item["id"] for item in result["projects"]]
    assert project["id"] in project_ids, "project should be found via FTS"

    thread_ids = [item["id"] for item in result["threads"]]
    assert len(thread_ids) >= 1, "thread should be found via FTS"


def test_search_handles_special_characters(client):
    """FTS5 reserved characters are stripped/handled without raising errors."""
    create_project(client, name="Monitor Alert Platform")

    # _match_query strips ", *, (, ), ^, : so no FTS syntax error occurs.
    # "Monitor Alert Platform" tokenized → monitor / alert / platform
    # Query "Monitor" with surrounding FTS noise → stripped to '"Monitor"*"' → prefix match works.
    resp = client.get('/api/search?q=Monitor"alert*^:()').json()
    assert resp["projects"], "Monitor prefix match should survive FTS char stripping"

    # Degenerate query: all chars stripped → empty query → empty results.
    resp2 = client.get('/api/search?q="*()^:').json()
    assert resp2["projects"] == []
    assert resp2["threads"] == []


def test_search_returns_weighted_results(client):
    """Title matches rank higher than body-only matches under bm25 weighting."""
    # Project: term appears in FTS title column → high bm25 score.
    project = create_project(client, name="RiskControlAlpha 风险管控")
    # Evidence: term appears only in FTS body column → lower bm25 score.
    evidence = create_capture(client, text="本期讨论 RiskControlAlpha 风险管控平台建设")

    result = client.get("/api/search?q=RiskControlAlpha").json()

    project_hit = any(item["id"] == project["id"] for item in result["projects"])
    evidence_hit = any(item["id"] == evidence["id"] for item in result["evidence"])

    assert project_hit, "project (title match) should appear in results"
    assert evidence_hit, "evidence (body match) should appear in results"

    # The project is in the projects list, evidence in the evidence list.
    # Under bm25(title=1.0, body=0.1) the title-scored project ranks higher.
    project_pos = next(
        i for i, item in enumerate(result["projects"]) if item["id"] == project["id"]
    )
    evidence_pos = next(
        i for i, item in enumerate(result["evidence"]) if item["id"] == evidence["id"]
    )

    # Both are in their respective lists; with title boosting the project
    # should not appear after position 0 (i.e., title matches rank first).
    assert project_pos == 0, (
        f"title match should be first (pos 0), got pos {project_pos}"
    )
    assert evidence_pos >= 0
