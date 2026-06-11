import {Audio} from '@remotion/media';
import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import './style.css';

const palette = {
  ink: '#17212b',
  muted: '#617081',
  line: '#dbe3ec',
  blue: '#2f6fed',
  cyan: '#18a7b5',
  green: '#2f9d6a',
  orange: '#e78a3c',
  violet: '#7b61d1',
  red: '#db5c5c',
};

const FPS = 30;

type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};

const chapters = [
  {
    label: '开场',
    duration: 9,
    title: 'Trace 使用教程',
    kicker: '本地优先的个人 AI 工作台',
    body: '这不是一个只会总结文档的工具。它帮你把每天散落的记录，变成可以回溯的工作线和报告。',
  },
  {
    label: '核心链路',
    duration: 10,
    title: '先理解这条链路',
    kicker: '快记 / 文件 / 笔记 -> 证据 -> 工作线 -> 项目 -> 报告',
    body: 'Trace 的关键是证据。你平时不用先想清楚结构，只要把事实记录下来，之后再归入线程和项目。',
  },
  {
    label: '第 1 步',
    duration: 11,
    title: '创建或选择工作区',
    kicker: '左上角工作区',
    body: '工作区用来隔离不同场景。正式工作、个人项目、测试数据可以分开，项目、线程、证据、待办和报告都会跟随工作区过滤。',
  },
  {
    label: '第 2 步',
    duration: 12,
    title: '新建项目，再建工作线',
    kicker: '项目是上下文，工作线是正在推进的一件事',
    body: '比如 SRM 二期是项目，仓库和 WMS 收货差异就是一条工作线。之后所有证据、待办和笔记都可以挂到这条线上。',
  },
  {
    label: '第 3 步',
    duration: 12,
    title: '用快记捕获现场事实',
    kicker: 'Command + Shift + N',
    body: '会议中、沟通后、想到风险时，先写一笔。内容可以是进展、决定、风险、计划或协同信息。不要等整理完再记录。',
  },
  {
    label: '第 4 步',
    duration: 14,
    title: '在收件箱整理证据',
    kicker: '把未归档内容放回正确位置',
    body: '收件箱里看到一条证据后，你可以挂到已有工作线，创建新工作线，关联项目，或者转换成待办。这里是从碎片到结构的关键一步。',
  },
  {
    label: '第 5 步',
    duration: 12,
    title: '用项目页看整体状态',
    kicker: '健康度、周视图、最近活动和下一步建议',
    body: '项目页不是静态目录，而是轻量驾驶舱。你可以看到哪些线程活跃、哪些事情阻塞、哪些报告需要定稿。',
  },
  {
    label: '第 6 步',
    duration: 10,
    title: '用笔记承载长内容',
    kicker: '会议纪要、复盘草稿、项目思考',
    body: '短事实适合快记，长内容适合笔记。重要段落可以晋升为证据，再被线程摘要和报告引用。',
  },
  {
    label: '第 7 步',
    duration: 9,
    title: '让待办跟着上下文走',
    kicker: '待办可以关联线程和截止时间',
    body: '从证据转成待办时，它不会脱离上下文。挂在线程上的待办会自然进入对应项目，后续复盘时也能看到来源。',
  },
  {
    label: '第 8 步',
    duration: 15,
    title: '生成有证据引用的报告',
    kicker: '选择项目、周期、受众和范围',
    body: '需要周报、月报、项目报告或复盘时，新建报告，选择范围，让 AI 基于证据和线程起草。生成后可以局部改写、导出 Markdown 或富文本。',
  },
  {
    label: '设置',
    duration: 11,
    title: '配置 LLM 和本地 Markdown 库',
    kicker: 'AI 能力由你自己的模型端点和 API Key 提供',
    body: '没有配置 LLM 时，记录、整理、搜索、备份仍然可用。配置后，摘要、报告和改写才会启用。Markdown 文件夹也可以扫描进收件箱。',
  },
  {
    label: '安全',
    duration: 10,
    title: '备份、恢复和更新',
    kicker: '本地 SQLite，加上可验证的更新流程',
    body: '设置页可以立即备份数据库，自动更新前也会创建备份。下载 DMG 后会校验 SHA256，恢复失败也不会覆盖当前数据库。',
  },
  {
    label: '收束',
    duration: 12,
    title: '日常使用节奏',
    kicker: '每天记录，定期整理，需要时生成报告',
    body: 'Trace 的用法很简单：工作中先写一笔，空下来整理收件箱，项目推进时看工作线，需要汇报时让证据自己站出来。',
  },
] as const;

const chapterStarts = chapters.reduce<number[]>((acc, chapter, index) => {
  acc[index] = index === 0 ? 0 : acc[index - 1] + chapters[index - 1].duration;
  return acc;
}, []);

const totalSeconds = chapters.reduce((sum, chapter) => sum + chapter.duration, 0);

const captions: Caption[] = chapters.map((chapter, index) => ({
  text: chapter.body,
  startMs: (chapterStarts[index] + 1.4) * 1000,
  endMs: (chapterStarts[index] + chapter.duration - 1.2) * 1000,
  timestampMs: null,
  confidence: null,
}));

const featureCards = [
  {title: '快记', desc: '先记录事实，不打断现场', color: palette.blue},
  {title: '收件箱', desc: '把碎片整理为证据', color: palette.orange},
  {title: '工作线', desc: '追踪一件事的推进过程', color: palette.cyan},
  {title: '项目', desc: '聚合线程、待办、笔记和报告', color: palette.green},
  {title: '报告', desc: '用证据生成可交付文本', color: palette.violet},
  {title: '本地优先', desc: 'SQLite 保存，自带模型配置', color: palette.red},
] as const;

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = (value: number, input: [number, number], output: [number, number]) =>
  interpolate(value, input, output, {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const msToFrame = (ms: number) => Math.round((ms / 1000) * FPS);

const CaptionLayer = () => {
  const frame = useCurrentFrame();
  const caption = captions.find((item) => frame >= msToFrame(item.startMs) && frame <= msToFrame(item.endMs));
  if (!caption) {
    return null;
  }

  const localFrame = frame - msToFrame(caption.startMs);
  const enter = clamp(localFrame, [0, 12], [0, 1]);

  return (
    <div className="captionLayer" style={{opacity: enter, transform: `translateX(-50%) translateY(${(1 - enter) * 16}px)`}}>
      {caption.text}
    </div>
  );
};

const SceneShell = ({children, label}: {children: React.ReactNode; label: string}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const drift = Math.sin(frame / (fps * 2.4)) * 10;

  return (
    <AbsoluteFill className="scene">
      <div className="mesh meshA" style={{transform: `translate3d(${drift}px, ${drift * 0.5}px, 0)`}} />
      <div className="mesh meshB" style={{transform: `translate3d(${-drift * 0.7}px, ${drift}px, 0)`}} />
      <div className="topbar">
        <div className="brand">
          <Img className="brandIcon" src={staticFile('trace-app-icon.svg')} />
          <span>Trace</span>
        </div>
        <div className="sceneLabel">{label}</div>
      </div>
      {children}
    </AbsoluteFill>
  );
};

const Enter = ({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) => {
  const frame = useCurrentFrame();
  const p = clamp(frame - delay, [0, 28], [0, 1]);
  return (
    <div className={className} style={{opacity: p, transform: `translateY(${(1 - p) * y}px)`}}>
      {children}
    </div>
  );
};

const WindowChrome = ({children, title = 'Trace'}: {children: React.ReactNode; title?: string}) => (
  <div className="window">
    <div className="windowBar">
      <div className="dots">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
      </div>
      <div className="windowTitle">{title}</div>
    </div>
    {children}
  </div>
);

const Sidebar = ({active}: {active: string}) => (
  <aside className="sidebar">
    {['首页', '收件箱', '项目', '工作线', '笔记', '待办', '报告', '设置'].map((item) => (
      <div key={item} className={`sideItem ${item === active ? 'active' : ''}`}>
        <span className="sideIcon" />
        {item}
      </div>
    ))}
  </aside>
);

const DashboardMock = ({active = '首页'}: {active?: string}) => {
  const frame = useCurrentFrame();
  const pulse = clamp(Math.sin(frame / 22), [-1, 1], [0.35, 1]);

  return (
    <WindowChrome title="Trace 工作台">
      <div className="appMock">
        <Sidebar active={active} />
        <main className="mockMain">
          <div className="mockHeader">
            <div>
              <p className="eyebrow">{active === '首页' ? '今日焦点' : `${active}视图`}</p>
              <h3>{active === '首页' ? '把零散线索沉淀成可追溯工作线' : 'SRM 二期工作上下文'}</h3>
            </div>
            <button className="captureButton">写一笔</button>
          </div>
          <div className="focusGrid">
            <div className="focusPanel">
              <strong>{active === '收件箱' ? '待整理证据' : 'Focus Queue'}</strong>
              {['3 条收件箱待整理', '2 个项目待汇报', '1 条工作线阻塞'].map((item, index) => (
                <div key={item} className="queueItem" style={{opacity: index === 0 ? pulse : 1}}>
                  <span />
                  {item}
                </div>
              ))}
            </div>
            <div className="healthPanel">
              <strong>项目健康</strong>
              <div className="healthBars">
                <span style={{height: 86, background: palette.green}} />
                <span style={{height: 132, background: palette.blue}} />
                <span style={{height: 58, background: palette.orange}} />
                <span style={{height: 104, background: palette.cyan}} />
              </div>
            </div>
          </div>
          <div className="timelineRows">
            {['供应商初始化数据收集', '仓库与 WMS 收货差异', '周报自动化'].map((item, index) => (
              <div key={item} className="timelineRow">
                <span className="threadDot" />
                <div>
                  <strong>{item}</strong>
                  <p>{index === 0 ? '新增 4 条证据，待整理报告' : '持续推进中'}</p>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </WindowChrome>
  );
};

const HeroScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="twoColumn">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h1>{chapter.title}</h1>
        <p className="lead">{chapter.body}</p>
      </Enter>
      <Enter delay={16} className="heroMock">
        <DashboardMock />
      </Enter>
    </div>
  </SceneShell>
);

const ChainScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="centerBlock">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="chain">
        {['快记 / 文件 / 笔记', '证据', '工作线', '项目上下文', '汇报'].map((item, index) => (
          <Enter key={item} delay={index * 12} className="chainStep">
            <span className="stepNumber">{index + 1}</span>
            <strong>{item}</strong>
          </Enter>
        ))}
      </div>
      <Enter delay={82}>
        <p className="subline">今天随手记，三个月后依然能回到原始材料。</p>
      </Enter>
    </div>
  </SceneShell>
);

const WorkspaceScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="tutorialLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="workspaceCards">
        {['正式工作', '个人项目', '测试数据'].map((name, index) => (
          <Enter key={name} delay={index * 14} className="workspaceCard">
            <span>{index + 1}</span>
            <strong>{name}</strong>
            <p>独立的项目、线程、证据、待办和报告</p>
          </Enter>
        ))}
      </div>
      <Enter delay={70}>
        <p className="subline">{chapter.body}</p>
      </Enter>
    </div>
  </SceneShell>
);

const ProjectThreadScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="projectThread">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <Enter delay={16}>
        <div className="projectMap">
          <div className="projectNode">SRM 二期</div>
          {['仓库和 WMS 收货差异', '供应商初始化数据收集', '验收材料准备'].map((item, index) => (
            <div key={item} className="threadNode" style={{borderColor: [palette.cyan, palette.green, palette.orange][index]}}>
              <span>工作线</span>
              <strong>{item}</strong>
              <p>证据 · 待办 · 笔记 · 摘要</p>
            </div>
          ))}
        </div>
      </Enter>
    </div>
  </SceneShell>
);

const CaptureScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="tutorialLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="captureDemo wide">
        <div className="shortcut">Command + Shift + N</div>
        <div className="noteBox">
          <p>客户要求下周前提供方案，接口字段还缺 owner。</p>
          <div className="noteTags">
            <span>风险</span>
            <span>计划</span>
            <span>SRM 二期</span>
          </div>
        </div>
        <div className="routing">
          <span>先进入收件箱</span>
          <span>直接挂到工作线</span>
          <span>转换成待办</span>
        </div>
      </div>
    </div>
  </SceneShell>
);

const InboxScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="twoColumn">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
        <p className="lead">{chapter.body}</p>
      </Enter>
      <Enter delay={16}>
        <DashboardMock active="收件箱" />
      </Enter>
    </div>
  </SceneShell>
);

const ProjectStatusScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="featureLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="featureGrid">
        {[
          ['健康度', '健康、活跃、阻塞、沉默、待汇报'],
          ['周视图', '本周新增证据、完成待办、活跃线程'],
          ['下一步建议', '提醒需要整理、推动或定稿的事项'],
          ['最近活动', '快速回到昨天和本周发生的事实'],
          ['线程摘要', '看清一件事从开始到现在的进展'],
          ['证据追溯', '报告里的说法能回到原始记录'],
        ].map(([title, desc], index) => (
          <Enter key={title} delay={index * 8} className="featureCard">
            <div className="featureMark" style={{background: featureCards[index].color}} />
            <h3>{title}</h3>
            <p>{desc}</p>
          </Enter>
        ))}
      </div>
    </div>
  </SceneShell>
);

const NotesScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="twoColumn">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
        <p className="lead">{chapter.body}</p>
      </Enter>
      <Enter delay={16}>
        <WindowChrome title="项目记事">
          <div className="notesMock">
            <h3>会议纪要：接口字段对齐</h3>
            <p>今天确认 owner 字段仍缺业务归属，需要在下周方案前补齐。</p>
            <div className="promote">晋升为证据</div>
          </div>
        </WindowChrome>
      </Enter>
    </div>
  </SceneShell>
);

const TodoScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="tutorialLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="todoBoard">
        {['补齐接口 owner', '整理验收材料', '输出本周项目同步稿'].map((item, index) => (
          <Enter key={item} delay={index * 16} className="todoItem">
            <span />
            <strong>{item}</strong>
            <p>{index === 0 ? '来源：风险证据 -> 工作线 -> SRM 二期' : '关联线程和截止时间'}</p>
          </Enter>
        ))}
      </div>
    </div>
  </SceneShell>
);

const ReportScene = ({chapter}: {chapter: (typeof chapters)[number]}) => {
  const frame = useCurrentFrame();
  const typing = Math.round(clamp(frame, [40, 210], [0, 100]));

  return (
    <SceneShell label={chapter.label}>
      <div className="reportLayout">
        <Enter>
          <p className="kicker">{chapter.kicker}</p>
          <h2>{chapter.title}</h2>
        </Enter>
        <Enter delay={16}>
          <WindowChrome title="项目报告草稿">
            <div className="reportMock">
              <aside>
                <strong>报告设置</strong>
                <p>项目：SRM 二期</p>
                <p>周期：本周</p>
                <p>受众：项目同步</p>
                <p>范围：3 条工作线</p>
              </aside>
              <main>
                <h3>本周推进</h3>
                <p style={{width: `${Math.max(16, typing)}%`}}>
                  完成供应商初始化字段核对，并确认仓库收货差异进入下一轮验证。
                </p>
                <div className="citation">引用证据：会议纪要、快记、线程摘要</div>
              </main>
            </div>
          </WindowChrome>
        </Enter>
      </div>
    </SceneShell>
  );
};

const SettingsScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="localLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="localCards">
        {[
          ['OpenAI 兼容', 'base_url、api_key、model、温度和最大输出'],
          ['Anthropic 协议', '也可以配置为默认 LLM Profile'],
          ['Markdown 库', '扫描本机 .md / .markdown 到收件箱'],
        ].map(([title, desc], index) => (
          <Enter key={title} delay={index * 16} className="localCard">
            <div className="shield">{index + 1}</div>
            <strong>{title}</strong>
            <p>{desc}</p>
          </Enter>
        ))}
      </div>
    </div>
  </SceneShell>
);

const BackupScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="localLayout">
      <Enter>
        <p className="kicker">{chapter.kicker}</p>
        <h2>{chapter.title}</h2>
      </Enter>
      <div className="localCards">
        {[
          ['立即备份', '生成带版本、时间和 SHA256 的数据库备份'],
          ['安全恢复', '恢复前创建快照，失败不会覆盖当前库'],
          ['自动更新', '读取 GitHub Release，下载 DMG 后校验'],
        ].map(([title, desc], index) => (
          <Enter key={title} delay={index * 16} className="localCard">
            <div className="shield">{index + 1}</div>
            <strong>{title}</strong>
            <p>{desc}</p>
          </Enter>
        ))}
      </div>
    </div>
  </SceneShell>
);

const ClosingScene = ({chapter}: {chapter: (typeof chapters)[number]}) => (
  <SceneShell label={chapter.label}>
    <div className="closing">
      <Enter>
        <Img className="closingIcon" src={staticFile('trace-app-icon.svg')} />
        <h2>Trace</h2>
        <p>{chapter.kicker}</p>
      </Enter>
      <Enter delay={30}>
        <div className="commandStrip">
          <span>写一笔</span>
          <span>整理收件箱</span>
          <span>查看工作线</span>
          <span>生成报告</span>
        </div>
      </Enter>
    </div>
  </SceneShell>
);

const ChapterScene = ({index}: {index: number}) => {
  const chapter = chapters[index];
  if (index === 0) return <HeroScene chapter={chapter} />;
  if (index === 1) return <ChainScene chapter={chapter} />;
  if (index === 2) return <WorkspaceScene chapter={chapter} />;
  if (index === 3) return <ProjectThreadScene chapter={chapter} />;
  if (index === 4) return <CaptureScene chapter={chapter} />;
  if (index === 5) return <InboxScene chapter={chapter} />;
  if (index === 6) return <ProjectStatusScene chapter={chapter} />;
  if (index === 7) return <NotesScene chapter={chapter} />;
  if (index === 8) return <TodoScene chapter={chapter} />;
  if (index === 9) return <ReportScene chapter={chapter} />;
  if (index === 10) return <SettingsScene chapter={chapter} />;
  if (index === 11) return <BackupScene chapter={chapter} />;
  return <ClosingScene chapter={chapter} />;
};

export const TraceIntro = () => {
  return (
    <AbsoluteFill>
      <Audio src={staticFile('trace-tutorial-narration.mp3')} volume={0.92} />
      {chapters.map((chapter, index) => (
        <Sequence key={chapter.label} from={chapterStarts[index] * FPS} durationInFrames={chapter.duration * FPS}>
          <ChapterScene index={index} />
        </Sequence>
      ))}
      <CaptionLayer />
    </AbsoluteFill>
  );
};

export const Thumbnail = () => (
  <SceneShell label="教程视频">
    <div className="thumbnail">
      <Img className="closingIcon" src={staticFile('trace-app-icon.svg')} />
      <h1>Trace</h1>
      <p>从第一次打开到生成报告</p>
    </div>
  </SceneShell>
);

export const TRACE_INTRO_DURATION_SECONDS = totalSeconds;
