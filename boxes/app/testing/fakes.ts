/**
 * The browser APIs this app needs and jsdom does not have: the live channel, the YouTube
 * player, audio capture and playback, speech in and out, and the observers.
 *
 * Every fake is driven from the test: push an SSE event, change a player's state, deny the
 * microphone, deliver a transcript, end a recognition session. `installBrowserFakes()` puts
 * them all on the global object once per test file; `resetBrowserFakes()` clears what they
 * recorded between tests.
 */

import { vi } from 'vitest'

/** The newest instance of a fake, with a readable failure when nothing was constructed. */
function newest<T>(instances: T[], what: string): T {
  const found = instances.at(-1)
  if (!found) throw new Error(`No ${what} was constructed`)
  return found
}

function pageOrigin(): string {
  return new URL(globalThis.location?.href ?? 'http://localhost').origin
}

/** Call `onname` if the object carries one, then dispatch to listeners. */
function fire(target: EventTarget, event: Event): void {
  const handler = (target as unknown as Record<string, unknown>)['on' + event.type]
  if (typeof handler === 'function') handler.call(target, event)
  target.dispatchEvent(event)
}

/* -------------------------------------------------------------------------- live channel */

/**
 * The SSE downstream. Tests open it, push events on it, and fail it.
 *
 * Not declared `implements EventSource`: the DOM interface narrows `addEventListener` to its
 * own event map, which a plain `EventTarget` subclass cannot satisfy. The members below
 * mirror it one for one.
 */
export class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly CONNECTING = 0 as const
  readonly OPEN = 1 as const
  readonly CLOSED = 2 as const

  readonly url: string
  readonly withCredentials: boolean
  readyState: number = FakeEventSource.CONNECTING

  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string | URL, init?: EventSourceInit) {
    super()
    this.url = String(url)
    this.withCredentials = init?.withCredentials ?? false
    FakeEventSource.instances.push(this)
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED
  }

  /** test-side: the connection is established. */
  open(): void {
    this.readyState = FakeEventSource.OPEN
    fire(this, new Event('open'))
  }

  /** test-side: one server event. `type` is the SSE `event:` field. */
  emit(data: unknown, type = 'message', lastEventId = ''): void {
    fire(
      this,
      new MessageEvent(type, {
        data: typeof data === 'string' ? data : JSON.stringify(data),
        lastEventId,
        origin: pageOrigin(),
      }),
    )
  }

  /** test-side: the connection drops. */
  fail(): void {
    fire(this, new Event('error'))
  }

  static reset(): void {
    FakeEventSource.instances = []
  }

  static last(): FakeEventSource {
    return newest(FakeEventSource.instances, 'FakeEventSource')
  }
}

/* ------------------------------------------------------------------------------- YouTube */

/** `YT.PlayerState`, as a value the fake can use without importing the ambient enum. */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

/**
 * What the IFrame API installs as `window.YT.Player`.
 *
 * `duration` and `title` are what the video turns out to be, and the getters answer with
 * them only once playback has started: the real player has neither at `onReady`.
 */
export class FakeYTPlayer {
  static instances: FakeYTPlayer[] = []

  host: string | HTMLElement
  config: YT.PlayerOptions
  state: number = YT_STATE.UNSTARTED
  time = 0
  duration = 300
  title = 'Fake video'
  volume = 100
  muted = false
  destroyed = false
  #started = false

  constructor(host: string | HTMLElement, config: YT.PlayerOptions) {
    this.host = host
    this.config = config
    FakeYTPlayer.instances.push(this)
    // The real API calls onReady asynchronously.
    queueMicrotask(() => this.config.events?.onReady?.({ target: this.#asPlayer() }))
  }

  playVideo(): void {
    this.setState(YT_STATE.PLAYING)
  }
  pauseVideo(): void {
    this.setState(YT_STATE.PAUSED)
  }
  stopVideo(): void {
    this.setState(YT_STATE.ENDED)
  }
  seekTo(seconds: number): void {
    this.time = seconds
  }
  getCurrentTime(): number {
    return this.time
  }
  getDuration(): number {
    return this.#started ? this.duration : 0
  }
  getVideoData(): YT.VideoData {
    return {
      video_id: String(this.config.videoId ?? ''),
      author: '',
      title: this.#started ? this.title : '',
    }
  }
  getPlayerState(): number {
    return this.state
  }
  loadVideoById(videoId: string): void {
    this.config.videoId = videoId
    this.setState(YT_STATE.PLAYING)
  }
  cueVideoById(videoId: string): void {
    this.config.videoId = videoId
    this.setState(YT_STATE.CUED)
  }
  setVolume(volume: number): void {
    this.volume = volume
  }
  mute(): void {
    this.muted = true
  }
  unMute(): void {
    this.muted = false
  }
  destroy(): void {
    this.destroyed = true
  }

  /** test-side: the player moved, and everyone watching hears about it. */
  setState(state: number): void {
    this.state = state
    if (state === YT_STATE.PLAYING) this.#started = true
    this.config.events?.onStateChange?.({ target: this.#asPlayer(), data: state })
  }

  /** test-side: playback failed. 150 is "not embeddable". */
  fail(code = 150): void {
    this.config.events?.onError?.({ target: this.#asPlayer(), data: code })
  }

  #asPlayer(): YT.Player {
    return this as unknown as YT.Player
  }

  static reset(): void {
    FakeYTPlayer.instances = []
  }

  static last(): FakeYTPlayer {
    return newest(FakeYTPlayer.instances, 'FakeYTPlayer')
  }

  /** Players the page has mounted and not torn down. One, or the mount leaks. */
  static live(): FakeYTPlayer[] {
    return FakeYTPlayer.instances.filter((player) => !player.destroyed)
  }
}

/** test-side: run the callback the IFrame API script would have called. */
export function signalYouTubeReady(): void {
  const ready = (globalThis as unknown as Record<string, unknown>)['onYouTubeIframeAPIReady']
  if (typeof ready === 'function') ready()
}

/* --------------------------------------------------------------------------------- audio */

/** The two-way port between the main thread and a worklet or worker. */
export class FakeMessagePort extends EventTarget {
  posted: unknown[] = []
  onmessage: ((event: MessageEvent) => void) | null = null

  postMessage(data: unknown): void {
    this.posted.push(data)
  }

  /** test-side: the other side sent something back. */
  emit(data: unknown): void {
    fire(this, new MessageEvent('message', { data }))
  }

  start(): void {}
  close(): void {}
}

export class FakeAudioWorkletNode extends EventTarget {
  static instances: FakeAudioWorkletNode[] = []

  context: FakeAudioContext
  name: string
  options: AudioWorkletNodeOptions | undefined
  port = new FakeMessagePort()
  parameters = new Map<string, { value: number }>()
  connected: unknown[] = []
  onprocessorerror: ((event: Event) => void) | null = null

  constructor(context: FakeAudioContext, name: string, options?: AudioWorkletNodeOptions) {
    super()
    this.context = context
    this.name = name
    this.options = options
    for (const [key, value] of Object.entries(options?.parameterData ?? {})) {
      this.parameters.set(key, { value })
    }
    FakeAudioWorkletNode.instances.push(this)
  }

  connect<T>(node: T): T {
    this.connected.push(node)
    return node
  }

  disconnect(): void {
    this.connected.length = 0
  }

  /** test-side: the processor reported a failure. */
  failProcessor(): void {
    fire(this, new Event('processorerror'))
  }

  static reset(): void {
    FakeAudioWorkletNode.instances = []
  }

  static last(): FakeAudioWorkletNode {
    return newest(FakeAudioWorkletNode.instances, 'FakeAudioWorkletNode')
  }
}

export class FakeAudioContext extends EventTarget {
  static instances: FakeAudioContext[] = []

  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = 0
  sampleRate: number
  destination = { channelCount: 2 }
  onstatechange: ((event: Event) => void) | null = null

  audioWorklet = {
    addedModules: [] as string[],
    addModule: async (url: string): Promise<void> => {
      this.audioWorklet.addedModules.push(url)
    },
  }

  constructor(options?: AudioContextOptions) {
    super()
    this.sampleRate = options?.sampleRate ?? 48000
    FakeAudioContext.instances.push(this)
  }

  createMediaStreamSource(stream: MediaStream) {
    return { stream, connect: <T>(node: T): T => node, disconnect(): void {} }
  }

  createGain() {
    return { gain: { value: 1 }, connect: <T>(node: T): T => node, disconnect(): void {} }
  }

  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteFrequencyData(_data: Uint8Array): void {},
      getFloatTimeDomainData(_data: Float32Array): void {},
      connect: <T>(node: T): T => node,
      disconnect(): void {},
    }
  }

  async resume(): Promise<void> {
    this.#setState('running')
  }
  async suspend(): Promise<void> {
    this.#setState('suspended')
  }
  async close(): Promise<void> {
    this.#setState('closed')
  }

  #setState(state: 'suspended' | 'running' | 'closed'): void {
    this.state = state
    fire(this, new Event('statechange'))
  }

  static reset(): void {
    FakeAudioContext.instances = []
  }

  static last(): FakeAudioContext {
    return newest(FakeAudioContext.instances, 'FakeAudioContext')
  }

  /** Contexts still holding the device. One per hold, zero after cleanup. */
  static live(): FakeAudioContext[] {
    return FakeAudioContext.instances.filter((context) => context.state !== 'closed')
  }
}

/* ------------------------------------------------------------------------ microphone */

export class FakeMediaStreamTrack extends EventTarget {
  kind = 'audio'
  enabled = true
  readyState: 'live' | 'ended' = 'live'

  stop(): void {
    this.readyState = 'ended'
  }
}

export class FakeMediaStream extends EventTarget {
  static instances: FakeMediaStream[] = []

  id = 'fake-stream'
  #tracks = [new FakeMediaStreamTrack()]

  constructor() {
    super()
    FakeMediaStream.instances.push(this)
  }

  getTracks(): FakeMediaStreamTrack[] {
    return this.#tracks
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.#tracks
  }
  getVideoTracks(): FakeMediaStreamTrack[] {
    return []
  }
  get active(): boolean {
    return this.#tracks.some((track) => track.readyState === 'live')
  }

  static reset(): void {
    FakeMediaStream.instances = []
  }

  /** Streams whose tracks were never stopped. Non-empty after cleanup means a lit mic. */
  static live(): FakeMediaStream[] {
    return FakeMediaStream.instances.filter((stream) => stream.active)
  }
}

export class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported(_mimeType: string): boolean {
    return true
  }

  stream: MediaStream
  mimeType: string
  state: 'inactive' | 'recording' | 'paused' = 'inactive'

  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstart: ((event: Event) => void) | null = null
  onstop: ((event: Event) => void) | null = null
  onpause: ((event: Event) => void) | null = null
  onresume: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    super()
    this.stream = stream
    this.mimeType = options?.mimeType ?? 'audio/webm;codecs=opus'
    FakeMediaRecorder.instances.push(this)
  }

  start(_timeslice?: number): void {
    this.state = 'recording'
    fire(this, new Event('start'))
  }
  pause(): void {
    this.state = 'paused'
    fire(this, new Event('pause'))
  }
  resume(): void {
    this.state = 'recording'
    fire(this, new Event('resume'))
  }
  stop(): void {
    this.state = 'inactive'
    fire(this, new Event('stop'))
  }
  requestData(): void {
    this.emitChunk(new Blob(['chunk'], { type: this.mimeType }))
  }

  /** test-side: one recorded chunk arrives. jsdom has no BlobEvent, so this is close enough. */
  emitChunk(blob: Blob): void {
    const event = Object.assign(new Event('dataavailable'), { data: blob })
    fire(this, event)
  }

  static reset(): void {
    FakeMediaRecorder.instances = []
  }

  static last(): FakeMediaRecorder {
    return newest(FakeMediaRecorder.instances, 'FakeMediaRecorder')
  }
}

let microphoneAccess: 'granted' | 'denied' = 'granted'

/** test-side: the next `getUserMedia` succeeds, or rejects with `NotAllowedError`. */
export function setMicrophoneAccess(access: 'granted' | 'denied'): void {
  microphoneAccess = access
}

/* ---------------------------------------------------------------------- speech recognition */

/** One recognition session. `say()` delivers a transcript, `stop()` ends it. */
export class FakeSpeechRecognition extends EventTarget {
  static instances: FakeSpeechRecognition[] = []

  lang = 'en-US'
  continuous = false
  interimResults = false
  maxAlternatives = 1
  processLocally = false
  started = false

  onstart: ((event: Event) => void) | null = null
  onresult: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onend: ((event: Event) => void) | null = null

  constructor() {
    super()
    FakeSpeechRecognition.instances.push(this)
  }

  start(): void {
    if (this.started) throw new DOMException('already started', 'InvalidStateError')
    this.started = true
    fire(this, new Event('start'))
  }

  stop(): void {
    this.#end()
  }

  abort(): void {
    this.#end()
  }

  /** test-side: the user said something. */
  say(transcript: string, options: { isFinal?: boolean; confidence?: number } = {}): void {
    const alternative = { transcript, confidence: options.confidence ?? 0.95 }
    const result = Object.assign([alternative], {
      isFinal: options.isFinal ?? true,
      length: 1,
      item: () => alternative,
    })
    const results = Object.assign([result], { length: 1, item: () => result })
    fire(this, Object.assign(new Event('result'), { results, resultIndex: 0 }))
  }

  /** test-side: recognition failed. `no-speech`, `not-allowed`, `network`, `aborted`. */
  fail(error = 'no-speech', message = ''): void {
    fire(this, Object.assign(new Event('error'), { error, message }))
  }

  #end(): void {
    this.started = false
    fire(this, new Event('end'))
  }

  static reset(): void {
    FakeSpeechRecognition.instances = []
  }

  static last(): FakeSpeechRecognition {
    return newest(FakeSpeechRecognition.instances, 'FakeSpeechRecognition')
  }
}

/* ----------------------------------------------------------------------- speech synthesis */

export class FakeSpeechSynthesisUtterance extends EventTarget {
  text: string
  voice: SpeechSynthesisVoice | null = null
  lang = 'en-US'
  rate = 1
  pitch = 1
  volume = 1

  onstart: ((event: Event) => void) | null = null
  onend: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onboundary: ((event: Event) => void) | null = null

  constructor(text = '') {
    super()
    this.text = text
  }
}

const VOICES = [
  { name: 'Fake EN', lang: 'en-US', default: true, localService: true, voiceURI: 'fake-en' },
  { name: 'Fake ES', lang: 'es-ES', default: false, localService: true, voiceURI: 'fake-es' },
] as SpeechSynthesisVoice[]

export class FakeSpeechSynthesis extends EventTarget {
  spoken: FakeSpeechSynthesisUtterance[] = []
  speaking = false
  pending = false
  paused = false
  onvoiceschanged: ((event: Event) => void) | null = null

  #voices: SpeechSynthesisVoice[] = VOICES

  getVoices(): SpeechSynthesisVoice[] {
    return this.#voices
  }

  speak(utterance: FakeSpeechSynthesisUtterance): void {
    this.spoken.push(utterance)
    this.speaking = true
    // Real engines fire start asynchronously.
    queueMicrotask(() => fire(utterance, new Event('start')))
  }

  cancel(): void {
    this.spoken.length = 0
    this.speaking = false
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  /** test-side: the line finished. */
  finish(): void {
    this.speaking = false
    const utterance = this.spoken.at(-1)
    if (utterance) fire(utterance, new Event('end'))
  }

  /** test-side: the line failed mid-way. */
  fail(): void {
    this.speaking = false
    const utterance = this.spoken.at(-1)
    if (utterance) fire(utterance, new Event('error'))
  }

  /** test-side: voices arrive late, which is what real engines do on first load. */
  loadVoicesLate(): void {
    this.#voices = []
    queueMicrotask(() => {
      this.#voices = VOICES
      fire(this, new Event('voiceschanged'))
    })
  }

  reset(): void {
    this.spoken.length = 0
    this.speaking = false
    this.paused = false
    this.#voices = VOICES
  }
}

const speech = new FakeSpeechSynthesis()

/** The installed `speechSynthesis`, for driving and inspecting spoken lines. */
export function fakeSpeechSynthesis(): FakeSpeechSynthesis {
  return speech
}

/* ------------------------------------------------------------------------------ observers */

export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []

  observed: Element[] = []
  #callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.push(target)
  }

  unobserve(target: Element): void {
    this.observed = this.observed.filter((element) => element !== target)
  }

  disconnect(): void {
    this.observed = []
  }

  takeRecords(): ResizeObserverEntry[] {
    return []
  }

  /** test-side: everything observed is now this size. */
  resize(width: number, height: number): void {
    const box = { inlineSize: width, blockSize: height }
    const entries = this.observed.map((target) => ({
      target,
      contentRect: { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height },
      borderBoxSize: [box],
      contentBoxSize: [box],
      devicePixelContentBoxSize: [box],
    })) as unknown as ResizeObserverEntry[]
    this.#callback(entries, this as unknown as ResizeObserver)
  }

  static reset(): void {
    FakeResizeObserver.instances = []
  }

  static last(): FakeResizeObserver {
    return newest(FakeResizeObserver.instances, 'FakeResizeObserver')
  }
}

class FakeIntersectionObserver {
  root: Element | null = null
  rootMargin = ''
  thresholds: number[] = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/* -------------------------------------------------------------------------- media queries */

type MediaListener = (event: MediaQueryListEvent) => void

const mediaListeners = new Map<string, Set<MediaListener>>()
let systemDark = false

function queryMatches(query: string): boolean {
  if (query.includes('prefers-color-scheme: dark')) return systemDark
  if (query.includes('prefers-color-scheme: light')) return !systemDark
  return false
}

/** test-side: the operating system switched to dark, or back. */
export function setSystemDark(dark: boolean): void {
  systemDark = dark
  for (const [query, listeners] of mediaListeners) {
    if (!query.includes('prefers-color-scheme')) continue
    const event = { matches: queryMatches(query), media: query } as MediaQueryListEvent
    for (const listener of listeners) listener(event)
  }
}

function fakeMatchMedia(query: string): MediaQueryList {
  let listeners = mediaListeners.get(query)
  if (!listeners) {
    listeners = new Set()
    mediaListeners.set(query, listeners)
  }
  const registered = listeners
  return {
    media: query,
    get matches(): boolean {
      return queryMatches(query)
    },
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => registered.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => registered.delete(listener),
    // Deprecated, still called by some libraries.
    addListener: (listener: MediaListener) => registered.add(listener),
    removeListener: (listener: MediaListener) => registered.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
}

/* ------------------------------------------------------------------------------- install */

/** Put every fake on the global object. Called once per test file, from the setup file. */
export function installBrowserFakes(): void {
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('YT', { Player: FakeYTPlayer, PlayerState: YT_STATE })
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
  vi.stubGlobal('MediaStream', FakeMediaStream)
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
  vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance)
  vi.stubGlobal('speechSynthesis', speech)
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('matchMedia', vi.fn(fakeMatchMedia))
  vi.stubGlobal('scrollTo', vi.fn())

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (_constraints?: MediaStreamConstraints) => {
        if (microphoneAccess === 'denied') {
          throw new DOMException('Permission denied', 'NotAllowedError')
        }
        return new FakeMediaStream() as unknown as MediaStream
      }),
      enumerateDevices: vi.fn(async () => [
        { deviceId: 'default', kind: 'audioinput', label: 'Fake mic', groupId: 'g1' },
      ]),
      addEventListener(): void {},
      removeEventListener(): void {},
    },
  })

  // jsdom implements none of these.
  Element.prototype.setPointerCapture ??= function (): void {}
  Element.prototype.releasePointerCapture ??= function (): void {}
  Element.prototype.hasPointerCapture ??= function (): boolean {
    return false
  }
  Element.prototype.scrollIntoView ??= function (): void {}
}

/** Forget what the fakes recorded, and put the environment back to its defaults. */
export function resetBrowserFakes(): void {
  FakeEventSource.reset()
  FakeYTPlayer.reset()
  FakeAudioContext.reset()
  FakeAudioWorkletNode.reset()
  FakeMediaStream.reset()
  FakeMediaRecorder.reset()
  FakeSpeechRecognition.reset()
  FakeResizeObserver.reset()
  speech.reset()
  // Notified rather than dropped: long-lived subscribers (the theme) keep working.
  setSystemDark(false)
  microphoneAccess = 'granted'
}
