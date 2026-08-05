import 'echarts-not-a-real-package'
export function mount(el: HTMLElement): () => void {
  el.textContent = 'never'
  return () => {}
}
