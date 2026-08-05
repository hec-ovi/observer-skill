export const meta = { title: 'Probe', kind: 'diagram' as const }
export function mount(el: HTMLElement): () => void {
  el.textContent = 'probe'
  return () => { el.textContent = '' }
}
