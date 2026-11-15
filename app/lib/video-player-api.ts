/** Provider SDKs are loaded only for a visible lesson player, using the page nonce. */
export type ExternalPlayer = { destroy: () => void | Promise<void> };
type YouTubeApi = { Player: new (frame: HTMLIFrameElement, options: { events: { onReady: () => void; onError: (event: { data: number }) => void } }) => ExternalPlayer };
type VimeoPlayer = ExternalPlayer & { ready: () => Promise<void>; on: (event: "error", callback: () => void) => void };
type VimeoApi = { Player: new (frame: HTMLIFrameElement) => VimeoPlayer };

declare global {
  interface Window {
    YT?: YouTubeApi;
    Vimeo?: VimeoApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtube: Promise<YouTubeApi> | null = null;
let vimeo: Promise<VimeoApi> | null = null;

function script(url: string) {
  const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  if (!nonce) throw new Error("The player requires the page's CSP nonce");
  const element = document.createElement("script");
  element.src = url;
  element.nonce = nonce;
  element.async = true;
  return element;
}

export function youtubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtube) return youtube;
  const pending = new Promise<YouTubeApi>((resolve, reject) => {
    const element = script("https://www.youtube.com/iframe_api");
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(failed, 10_000);
    function failed() {
      window.clearTimeout(timer);
      element.remove();
      window.onYouTubeIframeAPIReady = previous;
      reject(new Error("YouTube player API could not load"));
    }
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      try { previous?.(); } finally {
        if (window.YT?.Player) resolve(window.YT);
        else failed();
      }
    };
    element.onerror = failed;
    document.head.append(element);
  });
  youtube = pending;
  void pending.catch(() => { if (youtube === pending) youtube = null; });
  return pending;
}

export function vimeoApi(): Promise<VimeoApi> {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (vimeo) return vimeo;
  const pending = new Promise<VimeoApi>((resolve, reject) => {
    const element = script("https://player.vimeo.com/api/player.js");
    const timer = window.setTimeout(failed, 10_000);
    function failed() {
      window.clearTimeout(timer);
      element.remove();
      reject(new Error("Vimeo player API could not load"));
    }
    element.onload = () => {
      window.clearTimeout(timer);
      if (window.Vimeo?.Player) resolve(window.Vimeo);
      else failed();
    };
    element.onerror = failed;
    document.head.append(element);
  });
  vimeo = pending;
  void pending.catch(() => { if (vimeo === pending) vimeo = null; });
  return pending;
}
