import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const voice = process.env.TRACE_NARRATION_VOICE || 'Tingting';
const rate = process.env.TRACE_NARRATION_RATE || '170';

const publicDir = join(process.cwd(), 'public');
const buildDir = join(process.cwd(), 'out', 'narration-parts');

const chapters = [
  {
    duration: 18,
    text: '欢迎使用 Trace。这是一款本地优先的个人 AI 工作台。它不是只会总结文档的工具，而是帮你把每天散落的记录，变成可以回溯的工作线和报告。',
  },
  {
    duration: 24,
    text: '先理解 Trace 的核心链路：快记、文件和笔记，都会沉淀成证据；证据归入工作线；工作线组成项目上下文；最后生成汇报。关键是证据先行。',
  },
  {
    duration: 24,
    text: '第一步，创建或选择工作区。工作区用来隔离不同场景。正式工作、个人项目和测试数据可以分开，项目、线程、证据、待办和报告都会跟随工作区过滤。',
  },
  {
    duration: 28,
    text: '第二步，新建项目，再新建工作线。项目是上层上下文，工作线是正在推进的一件具体事情。比如 SRM 二期是项目，仓库和 WMS 收货差异就是一条工作线。',
  },
  {
    duration: 28,
    text: '第三步，用快记捕获现场事实。会议中、沟通后、想到风险时，按 Command 加 Shift 加 N，先写一笔。内容可以是进展、决定、风险、计划或协同信息。',
  },
  {
    duration: 32,
    text: '第四步，在收件箱整理证据。看到一条未归档证据后，你可以挂到已有工作线，创建新工作线，关联项目，或者转换成待办。这里是从碎片到结构的关键一步。',
  },
  {
    duration: 28,
    text: '第五步，用项目页看整体状态。项目页会显示健康度、周视图、最近活动和下一步建议。你可以看到哪些线程活跃，哪些事情阻塞，哪些报告需要定稿。',
  },
  {
    duration: 24,
    text: '第六步，用笔记承载长内容。短事实适合快记，长内容适合笔记。会议纪要、复盘草稿和项目思考，都可以写在笔记里，重要段落再晋升为证据。',
  },
  {
    duration: 22,
    text: '第七步，让待办跟着上下文走。从证据转成待办时，它不会脱离来源。挂在线程上的待办，会自然进入对应项目，后续复盘时也能看到来龙去脉。',
  },
  {
    duration: 34,
    text: '第八步，生成有证据引用的报告。需要周报、月报、项目报告或复盘时，新建报告，选择项目、周期、受众和范围，让 AI 基于证据和线程起草。',
  },
  {
    duration: 26,
    text: '接着到设置页配置 LLM 和本地 Markdown 库。AI 能力由你自己的模型端点和 API Key 提供。没有配置 LLM 时，记录、整理、搜索和备份仍然可用。',
  },
  {
    duration: 22,
    text: '最后看备份、恢复和更新。Trace 使用本地 SQLite。你可以立即备份数据库，自动更新前也会创建备份。下载 DMG 后会校验 SHA256。',
  },
  {
    duration: 24,
    text: '日常使用 Trace 的节奏很简单：工作中先写一笔，空下来整理收件箱，项目推进时看工作线，需要汇报时，让证据自己站出来。',
  },
];

const durationOf = (file) => {
  const output = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return Number.parseFloat(output.toString().trim());
};

if (!existsSync(publicDir)) mkdirSync(publicDir, {recursive: true});
if (existsSync(buildDir)) rmSync(buildDir, {recursive: true, force: true});
mkdirSync(buildDir, {recursive: true});

const concatList = [];
const scriptText = chapters.map((chapter) => chapter.text).join('\n\n');
writeFileSync(join(publicDir, 'trace-tutorial-narration.txt'), scriptText);

for (const [index, chapter] of chapters.entries()) {
  const stem = String(index + 1).padStart(2, '0');
  const textFile = join(buildDir, `${stem}.txt`);
  const voiceFile = join(buildDir, `${stem}-voice.aiff`);
  const paddedFile = join(buildDir, `${stem}-padded.aiff`);

  writeFileSync(textFile, chapter.text);
  execFileSync('say', ['-v', voice, '-r', rate, '-f', textFile, '-o', voiceFile], {stdio: 'inherit'});

  const voiceDuration = durationOf(voiceFile);
  const padDuration = Math.max(0.4, chapter.duration - voiceDuration);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      voiceFile,
      '-f',
      'lavfi',
      '-t',
      padDuration.toFixed(3),
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-filter_complex',
      '[0:a][1:a]concat=n=2:v=0:a=1[a]',
      '-map',
      '[a]',
      paddedFile,
    ],
    {stdio: 'ignore'},
  );
  concatList.push(`file '${paddedFile.replaceAll("'", "'\\''")}'`);
}

const concatFile = join(buildDir, 'concat.txt');
writeFileSync(concatFile, concatList.join('\n'));
const aiffOutput = join(publicDir, 'trace-tutorial-narration.aiff');
const mp3Output = join(publicDir, 'trace-tutorial-narration.mp3');

execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', aiffOutput], {
  stdio: 'inherit',
});
execFileSync('ffmpeg', ['-y', '-i', aiffOutput, '-codec:a', 'libmp3lame', '-b:a', '160k', mp3Output], {
  stdio: 'inherit',
});

console.log(`Generated narration with voice "${voice}" at ${mp3Output}`);
