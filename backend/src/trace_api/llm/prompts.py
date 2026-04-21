"""Prompt templates for report generation."""
from __future__ import annotations

from .base import ChatMessage


AUDIENCE_TONE = {
    "boss": "简练、结果导向、突出里程碑与风险，避免过多细节。读者是你的直接上级。",
    "internal": "平实、清楚，向同级/团队同步进展。可以保留适度细节。",
    "1on1": "坦诚、对话式。可以写感受、困难与需要的支持。",
    "retro": "反思性、结构化。关注做对的、做错的、下次改进。",
    "self": "第一人称、笔记式。可以自由一些，便于以后回看。",
}


SYSTEM_RULES = """你是 Trace 的写作助手，帮用户把碎片化的工作证据整理成一份成文工作报告。

规则：
1. 使用 Markdown，章节用 `## ` 开头，子章节用 `### `。
2. 成文叙述，不要生硬的 bullet 堆砌；有并列事项时才使用简短列表。
3. 每条来源于"证据"的关键判断，后面加引用标记 `[n]`，`n` 是证据编号。
4. 不要编造证据里没有的事实、数字、人名或日期。
5. 如果证据不足以支撑某一段，就简短带过或明确写"待确认"。
6. 不要输出额外的前言（"以下是周报..."），直接开始正文。
"""


DEFAULT_OUTLINE = [
    "综述",
    "本周推进",
    "风险与待协调",
    "下周计划",
]


def build_report_messages(
    *,
    period_label: str,
    period_start: str,
    period_end: str,
    audience: str,
    evidence_lines: list[str],
    project_context: dict | None = None,
    context_note: str | None = None,
) -> list[ChatMessage]:
    tone = AUDIENCE_TONE.get(audience, AUDIENCE_TONE["boss"])
    outline_hint = "\n".join(f"## {t}" for t in DEFAULT_OUTLINE)

    user_body = [
        f"周期：{period_label}（{period_start} — {period_end}）",
        f"读者/口吻：{tone}",
    ]
    if project_context:
        user_body.extend(
            [
                f"所属项目：{project_context.get('name') or '未命名项目'}",
                f"项目状态：{project_context.get('status') or 'active'}",
            ]
        )
        if project_context.get("summary"):
            user_body.extend(["项目摘要：", str(project_context["summary"])])
        thread_titles = project_context.get("thread_titles") or []
        if thread_titles:
            user_body.extend(["项目下线程：", " / ".join(thread_titles)])
    user_body.extend(
        [
        "",
        "建议大纲（可调整；但请保留主要章节）：",
        outline_hint,
        "",
        "证据列表（用 [编号] 引用）：",
        ]
    )
    if evidence_lines:
        user_body.extend(evidence_lines)
    else:
        user_body.append("（无证据）")

    if context_note:
        user_body.extend(["", "补充说明：", context_note])

    user_body.extend(["", "请根据以上内容生成成文周报，使用 Markdown。"])

    return [
        ChatMessage(role="system", content=SYSTEM_RULES),
        ChatMessage(role="user", content="\n".join(user_body)),
    ]


REWRITE_OPS = {"continue", "compress", "retone", "custom"}


REWRITE_SYSTEM_BASE = """你是 Trace 的写作助手，正在对一份已有的工作报告做定向改写。

通用规则：
1. 使用 Markdown；章节用 `## ` 开头，子章节用 `### `。
2. 绝不编造证据里没有的事实、数字、人名或日期。
3. 尊重并保留原文已有的引用标记 `[n]`；如果你使用了新的事实，仅在证据列表里能找到对应编号时再引用。
4. 不要输出额外前言（"好的，下面是..."、"以下改写..."），直接给出正文。
5. 只输出本次任务要求的内容，不要重复未被要求修改的其他正文。
"""


_OP_INSTRUCTIONS: dict[str, str] = {
    "continue": (
        "本次任务：**续写**。\n"
        "- 你只需要输出要【追加】到原文末尾的新段落，不要重复原文已经写过的内容。\n"
        "- 续写内容要与已有风格一致。"
    ),
    "compress": (
        "本次任务：**精简重写**。\n"
        "- 输出一份完整的新正文（Markdown），保留核心事实、里程碑、风险、计划与现有引用标记。\n"
        "- 篇幅要显著缩短，突出重点，删除冗余描述和过多细节。"
    ),
    "retone": (
        "本次任务：**换口吻重写**。\n"
        "- 输出一份完整的新正文（Markdown），内容基本不变，保留事实与引用标记。\n"
        "- 按新的读者/口吻调整措辞、详略和开场方式。"
    ),
    "custom": (
        "本次任务：**按用户指令改写**。\n"
        "- 按下方「用户指令」执行。如果指令是「追加/续写」，只输出新增部分；\n"
        "- 如果指令是「重写/精简/调整」，输出一份完整的新正文。"
    ),
}


def rewrite_apply_mode(op: str) -> str:
    """Return 'append' for operations that add to the end, 'replace' otherwise."""
    return "append" if op == "continue" else "replace"


def build_rewrite_messages(
    *,
    op: str,
    current_body: str,
    period_label: str,
    period_start: str,
    period_end: str,
    audience: str,
    evidence_lines: list[str],
    project_context: dict | None = None,
    target_chars: int | None = None,
    target_audience: str | None = None,
    instruction: str | None = None,
) -> list[ChatMessage]:
    if op not in REWRITE_OPS:
        raise ValueError(f"unknown rewrite op: {op}")

    op_block = _OP_INSTRUCTIONS[op]
    tone = AUDIENCE_TONE.get(audience, AUDIENCE_TONE["boss"])

    extra: list[str] = []
    if op == "compress":
        n = target_chars or 300
        extra.append(f"目标篇幅：不超过 {n} 个汉字（左右）。")
    if op == "retone":
        new_aud = target_audience or audience
        new_tone = AUDIENCE_TONE.get(new_aud, tone)
        extra.append(f"新的读者/口吻：{new_tone}")
    if op == "continue":
        hint = instruction or "在原文末尾追加一段「下周计划」小节，总结后续动作。"
        extra.append(f"续写要求：{hint}")
    if op == "custom":
        if not (instruction and instruction.strip()):
            raise ValueError("custom op requires instruction")
        extra.append(f"用户指令：{instruction.strip()}")

    user_body = [
        f"周期：{period_label}（{period_start} — {period_end}）",
        f"当前读者/口吻：{tone}",
        "",
        op_block,
    ]
    if project_context:
        user_body.extend(
            [
                "",
                f"所属项目：{project_context.get('name') or '未命名项目'}",
                f"项目状态：{project_context.get('status') or 'active'}",
            ]
        )
        if project_context.get("summary"):
            user_body.extend(["项目摘要：", str(project_context["summary"])])
        thread_titles = project_context.get("thread_titles") or []
        if thread_titles:
            user_body.extend(["项目下线程：", " / ".join(thread_titles)])
    if extra:
        user_body.append("")
        user_body.extend(extra)

    user_body.extend(["", "证据列表（用 [编号] 引用）："])
    user_body.extend(evidence_lines if evidence_lines else ["（无证据）"])

    user_body.extend(["", "当前正文（Markdown）：", "```markdown", current_body or "（空）", "```"])

    return [
        ChatMessage(role="system", content=REWRITE_SYSTEM_BASE),
        ChatMessage(role="user", content="\n".join(user_body)),
    ]


def build_test_messages() -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content="你是连通性测试助手。"),
        ChatMessage(
            role="user",
            content="用一句不超过 12 个汉字的话确认你已连通。",
        ),
    ]
