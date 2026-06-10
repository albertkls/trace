import {Composition, Still} from 'remotion';
import {TRACE_INTRO_DURATION_SECONDS, TraceIntro, Thumbnail} from './TraceIntro';

export const VIDEO_FPS = 30;
export const VIDEO_SECONDS = TRACE_INTRO_DURATION_SECONDS;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="TraceIntro"
        component={TraceIntro}
        durationInFrames={VIDEO_SECONDS * VIDEO_FPS}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Still id="TraceIntroThumbnail" component={Thumbnail} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
    </>
  );
};
