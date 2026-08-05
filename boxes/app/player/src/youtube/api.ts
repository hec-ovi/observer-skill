/**
 * The IFrame API script, loaded once per page.
 *
 * `iframe_api` is a small loader that pulls the real widget script and then calls
 * `onYouTubeIframeAPIReady` exactly once, and only if that global already exists at that
 * moment. Anything that defines the global and waits therefore works on the first mount
 * and hangs on every one after it. All three cases are handled here: already loaded,
 * loading right now, and not started.
 */

type YouTubeApi = typeof YT

/** The loader defines `ready` before the widget script arrives, and queues on it. */
type LoaderGlobal = YouTubeApi & { ready?: (callback: () => void) => void }

declare global {
  interface Window {
    YT?: LoaderGlobal
    onYouTubeIframeAPIReady?: () => void
  }
}

const SRC = 'https://www.youtube.com/iframe_api'

let pending: Promise<YouTubeApi> | null = null

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (pending) return pending

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    const api = window.YT

    // Another mount, an earlier route, or a second render pass already finished the work.
    if (api?.Player) {
      resolve(api)
      return
    }

    // The loader ran and the widget script is still in flight: it queues callbacks for us.
    if (typeof api?.ready === 'function') {
      api.ready(() => resolve(window.YT as YouTubeApi))
      return
    }

    // Chained rather than replaced: the global belongs to the page, not to this box.
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT as YouTubeApi)
    }

    const tag = document.createElement('script')
    tag.src = SRC
    tag.async = true
    tag.addEventListener('error', () => {
      // The tag and the promise both go, so the next mount can try again.
      tag.remove()
      pending = null
      reject(new Error('The YouTube player script did not load'))
    })
    document.head.append(tag)
  })

  return pending
}
