import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

const POSTS = [1, 2, 3, 4];
const PHONE_POSTS = [1, 2, 3];
const SCENES = [0, 1, 2, 3, 4];
const NOTE_TILTS = [1.5, -2, 0.8];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Board 08b: Studio's three columns (topic notes, Threads thread, Instagram script) and the bottom bar. */
function DesktopBody() {
  return (
    <>
      <div className="sq-skel-header">
        <div className="sq-skel-col" style={{ width: 520, gap: 10 }}>
          <Skeleton w={180} h={12} />
          <Skeleton w={220} h={26} />
          <Skeleton h={60} />
        </div>
        <div className="sq-skel-row" style={{ gap: 10 }}>
          <Skeleton w={120} h={44} r={22} />
          <Skeleton w={140} h={44} r={22} />
        </div>
      </div>

      <div className="sq-skel-studio-grid">
        <section className="sq-skel-card sq-skel-card-blue">
          <Skeleton w="40%" h={12} tone="yellow" />
          <div className="sq-skel-note" style={{ transform: "rotate(-1deg)", padding: 16 }}>
            <Skeleton w="90%" h={18} />
            <Skeleton w="70%" h={18} />
          </div>
          {NOTE_TILTS.map((tilt) => (
            <div
              key={tilt}
              className="sq-skel-note sq-skel-note-soft"
              style={{ transform: `rotate(${tilt}deg)` }}
            >
              <Skeleton w="45%" h={10} tone="yellow" />
              <Skeleton w="90%" h={12} tone="yellow" />
            </div>
          ))}
        </section>

        <section className="sq-skel-card sq-skel-card-dark" style={{ gap: 18 }}>
          <Skeleton w="30%" h={20} tone="dark" />
          {POSTS.map((n) => (
            <div key={n} className="sq-skel-post">
              <div className="sq-skel-rail-col">
                <span className="sq-skel-th" aria-hidden="true">{n}</span>
                <i />
              </div>
              <div className="sq-skel-post-body">
                <Skeleton w="96%" h={13} tone="dark" />
                <Skeleton w="88%" h={13} tone="dark" />
                <Skeleton w="55%" h={13} tone="dark" />
              </div>
            </div>
          ))}
        </section>

        <section className="sq-skel-card sq-skel-card-raised">
          <Skeleton w="34%" h={20} />
          <Skeleton w="60%" h={36} r={18} />
          {SCENES.map((i) => (
            <div key={i} className="sq-skel-scene">
              <span className="sq-skel-noshrink">
                <Skeleton w={62} h={12} />
              </span>
              <div className="sq-skel-col" style={{ gap: 7, flexGrow: 1 }}>
                <Skeleton w="94%" h={12} />
                <Skeleton w="66%" h={12} />
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="sq-skel-bottombar">
        <Skeleton w={150} h={20} tone="dark" />
        {DAYS.map((i) => (
          <span key={i} className="sq-skel-grow">
            <Skeleton h={52} r={14} tone="dark" />
          </span>
        ))}
        <Skeleton w={170} h={54} r={16} tone="dark" />
      </div>
    </>
  );
}

/**
 * Board 08b. On a phone (board M08b) the three columns become one stack: the
 * topic note, a segmented-control bar, the numbered Threads thread and the
 * bottom actions.
 */
export default function StudioSkeleton() {
  return (
    <LoadingRegion label="Loading Studio…">
      <div className="sq-skel-desk">
        <DesktopBody />
      </div>

      <div className="sq-skel-phone" aria-hidden="true">
        <section className="sq-skel-note-m">
          <Skeleton w="34%" h={10} tone="yellow" />
          <Skeleton w="90%" h={20} tone="yellow" />
          <div className="sq-skel-row" style={{ gap: 6 }}>
            <Skeleton w={80} h={22} r={11} tone="yellow" />
            <Skeleton w={80} h={22} r={11} tone="yellow" />
          </div>
        </section>
        <Skeleton h={46} r={23} />
        <section className="sq-skel-card sq-skel-card-dark sq-skel-thread-m">
          <Skeleton w="50%" h={10} tone="dark" />
          {PHONE_POSTS.map((n) => (
            <div key={n} className="sq-skel-post sq-skel-post-m">
              <span className="sq-skel-th" aria-hidden="true">{n}</span>
              <div className="sq-skel-post-body">
                <Skeleton w="96%" h={12} tone="dark" />
                <Skeleton w="84%" h={12} tone="dark" />
                <Skeleton w="50%" h={12} tone="dark" />
              </div>
            </div>
          ))}
        </section>
        <div className="sq-skel-row sq-skel-actions-m">
          <span className="sq-skel-noshrink">
            <Skeleton w={100} h={48} r={24} />
          </span>
          <span className="sq-skel-grow">
            <Skeleton h={48} r={24} />
          </span>
        </div>
      </div>
    </LoadingRegion>
  );
}
