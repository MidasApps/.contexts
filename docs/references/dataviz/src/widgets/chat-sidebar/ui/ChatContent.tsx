'use client';

import { AISidebar } from '@/widgets/ai-sidebar';

/**
 * Corpo do chat. Consumido pela ChatSidebar (estado expandido, desktop) e pelo
 * Sheet de chat mobile em DashboardLayout (viewport < 1024px).
 *
 * Era aqui que a capacidade do assistente mudava conforme a tela: em edição de
 * relatório montava `ReportEditChat` → `ChatPanel` → `/api/canvas-chat` (com as
 * tools de construir página); fora dela, `AISidebar` → `/api/chat` (sem elas).
 * Quem estivesse na tela errada ouvia do assistente que ele não sabia criar
 * página — e estava certo sobre si mesmo.
 *
 * Com as tools de autoria no supervisor de `/api/chat`, o mesmo componente
 * serve as duas situações. Um efeito colateral bem-vindo: durante a edição o
 * histórico de conversas passa a existir, coisa que o `ChatPanel` não tinha.
 */
export function ChatContent() {
  return <AISidebar open onClose={() => {}} embedded />;
}
