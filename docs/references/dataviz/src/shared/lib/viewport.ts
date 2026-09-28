/**
 * Breakpoint único (1024px — o `lg` do Tailwind) para decidir, no momento
 * do evento `toggle-ai-sidebar`, qual UI reage: abaixo dele o
 * DashboardLayout abre o Sheet de chat mobile; a partir dele a
 * ChatSidebar alterna o rail/painel do desktop. As duas UIs ficam
 * montadas ao mesmo tempo (a ChatSidebar só fica `display:none` abaixo de
 * `lg`), então cada ouvinte consulta esta função dentro do próprio
 * handler — a cada disparo do evento, não uma vez no mount — para
 * continuar correto se a janela for redimensionada.
 */
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}
