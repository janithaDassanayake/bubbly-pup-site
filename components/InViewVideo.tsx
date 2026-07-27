"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  className?: string;
  poster?: string;
  /** play automatically (muted) while in viewport */
  autoplayInView?: boolean;
};

export default function InViewVideo({
  src,
  className,
  poster,
  autoplayInView = true,
}: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const attach = () => {
      if (!video.src) {
        video.src = src;
        video.load();
      }
    };

    // 1) PRELOAD early — start buffering ~600px before the video scrolls in,
    //    so playback is instant by the time it's visible.
    const preload = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          attach();
          preload.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    preload.observe(video);

    // 2) PLAY/PAUSE based on actual visibility.
    const playback = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          attach();
          if (autoplayInView)
            video.play().catch(() => {
              /* autoplay can be blocked; ignore */
            });
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 }
    );
    playback.observe(video);

    return () => {
      preload.disconnect();
      playback.disconnect();
    };
  }, [src, autoplayInView]);

  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      controls={!autoplayInView}
      onLoadedData={() => setLoaded(true)}
      data-loaded={loaded}
    />
  );
}
