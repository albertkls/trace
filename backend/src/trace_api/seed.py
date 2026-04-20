"""Demo data seeder. Run once so the UI has something to render in P0."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

from .db import connect, ensure_schema


TZ = timezone(timedelta(hours=8))


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def _date(offset_days: int) -> str:
    return (datetime.now(TZ) + timedelta(days=offset_days)).date().isoformat()


def _hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def has_seed() -> bool:
    conn = connect()
    try:
        row = conn.execute("SELECT COUNT(*) AS c FROM thread").fetchone()
        return bool(row and row["c"] > 0)
    finally:
        conn.close()


def seed() -> None:
    ensure_schema()
    if has_seed():
        return

    conn = connect()
    try:
        cur = conn.cursor()

        # Three sources
        src_meeting = _id("src")
        src_note = _id("src")
        src_task = _id("src")
        cur.execute(
            "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json) VALUES (?,?,?,?,?,?,?,?)",
            (
                src_meeting,
                "meeting",
                "项目A 周例会",
                "完成项目A与B系统接口联调。决定 3/6 开始联测。数据权限待平台确认。",
                _hash("meeting-1"),
                _now(),
                _date(-4),
                "{}",
            ),
        )
        cur.execute(
            "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json) VALUES (?,?,?,?,?,?,?,?)",
            (
                src_note,
                "quicknote",
                "闪记 · Albert",
                "接口联调完成，联测准备基本就绪。下周继续推进。",
                _hash("note-1"),
                _now(),
                _date(-3),
                "{}",
            ),
        )
        cur.execute(
            "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json) VALUES (?,?,?,?,?,?,?,?)",
            (
                src_task,
                "file",
                "本周任务 CSV",
                "联测执行 进行中 Albert 3/6；上线清单 计划中 Albert 3/7；数据权限确认 待确认 平台团队 3/5",
                _hash("task-1"),
                _now(),
                _date(-1),
                "{}",
            ),
        )

        # Threads
        th_a = _id("th")
        th_perm = _id("th")
        th_retro = _id("th")

        cur.execute(
            "INSERT INTO thread (id,title,project,owner,status,started_at,last_active_at,summary,pinned) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                th_a,
                "项目A 联测上线",
                "项目A",
                "Albert",
                "active",
                _date(-14),
                _now(),
                "接口联调已完成，联测环境就绪，本周进入联测。数据权限阻塞是主要风险。",
                1,
            ),
        )
        cur.execute(
            "INSERT INTO thread (id,title,project,owner,status,started_at,last_active_at,summary,pinned) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                th_perm,
                "平台数据权限",
                "平台侧",
                "平台团队",
                "blocked",
                _date(-10),
                _now(),
                "合规流程卡点；若本周内无法闭环影响 3/15 上线节点。",
                0,
            ),
        )
        cur.execute(
            "INSERT INTO thread (id,title,project,owner,status,started_at,last_active_at,summary,pinned) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                th_retro,
                "月度复盘准备",
                None,
                "Albert",
                "active",
                _date(-2),
                _date(-1),
                "开始收集 3 月材料。",
                0,
            ),
        )

        # Evidence
        evidences = [
            (th_a, "决定 3/6 开始联测", _date(-4), "decision", "done", 0.85),
            (th_a, "完成项目A与B系统接口联调，联测环境已准备就绪", _date(-4), "progress", "done", 0.9),
            (th_a, "接口联调完成，联测准备基本就绪", _date(-3), "progress", "done", 0.8),
            (th_a, "联测执行进行中 · 负责人 Albert · 截止 3/6", _date(-1), "progress", "ongoing", 0.75),
            (th_a, "下周完成上线清单整理并做发布准备", _date(1), "plan", "planned", 0.7),
            (th_perm, "数据权限仍待平台团队确认", _date(-4), "risk", "blocked", 0.9),
            (th_perm, "若 3/8 前未完成会影响上线节奏", _date(-3), "risk", "blocked", 0.88),
            (th_perm, "数据权限确认 · 待确认 · 平台团队 · 3/5", _date(-1), "risk", "blocked", 0.85),
        ]
        evidence_ids: list[str] = []
        for thread_id, text, date, cat, status, importance in evidences:
            eid = _id("ev")
            evidence_ids.append(eid)
            cur.execute(
                "INSERT INTO evidence (id,capture_id,thread_id,text,event_date,owners_json,tags_json,category,status,importance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    eid,
                    None,
                    thread_id,
                    text,
                    date,
                    "[]",
                    "[]",
                    cat,
                    status,
                    importance,
                    _now(),
                ),
            )

        # Todos
        todos = [
            (th_a, "上线清单整理", _date(1), 0),
            (th_a, "联测缺陷跟踪", _date(3), 0),
            (th_perm, "跟进合规审批进度", _date(0), 0),
            (None, "给团队发本周通告", _date(0), 1),
        ]
        for thread_id, text, due, done in todos:
            cur.execute(
                "INSERT INTO todo (id,thread_id,text,due_date,done,done_at,created_at) VALUES (?,?,?,?,?,?,?)",
                (
                    _id("td"),
                    thread_id,
                    text,
                    due,
                    done,
                    _now() if done else None,
                    _now(),
                ),
            )

        # One draft report
        rp_id = _id("rp")
        outline = [
            {"id": "s1", "title": "本周综述", "level": 1},
            {"id": "s2", "title": "本周重点推进", "level": 1},
            {"id": "s2a", "title": "项目A", "level": 2},
            {"id": "s3", "title": "风险与待协调", "level": 1},
            {"id": "s3a", "title": "平台数据权限", "level": 2},
            {"id": "s4", "title": "下周计划", "level": 1},
        ]
        body = (
            "# 本周综述\n\n"
            "项目A 进入联测阶段，上线倒计时启动；平台数据权限风险仍未闭环，影响 3/15 上线节点。\n\n"
            "# 本周重点推进\n\n"
            "**项目A** 接口联调于周中收尾[1][2]，联测环境搭建完毕[3]。联测首轮将于下周一启动。\n\n"
            "# 风险与待协调\n\n"
            "**平台数据权限** 仍卡在合规审核，若本周内未落地将影响上线节点[6][7]。\n\n"
            "# 下周计划\n\n"
            "- 启动联测首轮并跟踪缺陷\n- 完成上线清单整理\n- 持续跟进数据权限审批\n"
        )
        cur.execute(
            "INSERT INTO report (id,period_label,period_start,period_end,audience,title,body_md,outline_json,cited_evidence_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                rp_id,
                "2026-W15",
                _date(-4),
                _date(2),
                "boss",
                "2026-W15 周报（老板版）",
                body,
                json.dumps(outline, ensure_ascii=False),
                json.dumps(evidence_ids, ensure_ascii=False),
                "draft",
                _now(),
                _now(),
            ),
        )

        # Default LLM profile (empty key — user fills in)
        cur.execute(
            "INSERT INTO llm_profile (id,name,provider,protocol,base_url,api_key,model,temperature,max_tokens,is_default) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                _id("llm"),
                "DeepSeek（默认）",
                "deepseek",
                "openai-compat",
                "https://api.deepseek.com/v1",
                "",
                "deepseek-chat",
                0.3,
                2048,
                1,
            ),
        )

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
    print("seeded")
