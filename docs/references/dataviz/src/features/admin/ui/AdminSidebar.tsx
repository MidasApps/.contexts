'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, LogOut, Shield, Database, Activity, BarChart3, Upload } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import {
  ADMIN_SECTIONS,
  ADMIN_GROUP_ORDER,
  ADMIN_GROUP_LABELS,
  ADMIN_TOOLS,
  DEFAULT_ADMIN_SECTION,
} from '@/features/admin/model/admin-nav';

const TOOL_ICONS = { Database, Activity, BarChart3, Upload } as const;

interface AdminSidebarProps {
  className?: string;
}

/**
 * Sidebar de navegação do Admin (substitui o NavSidebar com chat de IA nas
 * rotas `/admin`). Segue o pattern Sidebar do design-system: 240px, densidade
 * compact, tokens semânticos. Sem ClientSwitcher (admin é global) e sem chat.
 */
export function AdminSidebar({ className }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onIndex = pathname === '/admin';
  const activeSection = onIndex
    ? searchParams?.get('section') ?? DEFAULT_ADMIN_SECTION
    : null;

  let authContext: ReturnType<typeof useAuthContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
    authContext = useAuthContext();
  } catch {}
  const profile = authContext?.profile;

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-background', className)}>
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Shield className="h-4 w-4 text-primary" strokeWidth={1.75} />
        <span className="text-sm font-semibold text-foreground">Admin</span>
        <Link
          href="/dashboard"
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title="Voltar ao app"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          App
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Administração">
        {ADMIN_GROUP_ORDER.map((group) => {
          const items = ADMIN_SECTIONS.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="px-2 mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                {ADMIN_GROUP_LABELS[group]}
              </p>
              <div className="space-y-0.5">
                {items.map((s) => {
                  const active = activeSection === s.id;
                  return (
                    <Link
                      key={s.id}
                      href={`/admin?section=${s.id}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                        active
                          ? 'bg-primary/10 text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0 transition-colors',
                          active ? 'bg-primary' : 'bg-transparent',
                        )}
                      />
                      <span className="truncate">{s.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Ferramentas */}
        <div>
          <p className="px-2 mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Ferramentas
          </p>
          <div className="space-y-0.5">
            {ADMIN_TOOLS.map((t) => {
              const Icon = TOOL_ICONS[t.icon];
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-primary/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
                  <span className="truncate">{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer: usuário */}
      {profile && (
        <div className="border-t border-border p-2">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/50 overflow-hidden shrink-0">
              {profile.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoURL} alt={profile.displayName ?? ''} className="h-full w-full object-cover" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground/80" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[12px] font-medium text-foreground truncate leading-tight">
                {profile.displayName ?? 'User'}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 truncate">
                {profile.email?.split('@')[0]}
              </span>
            </div>
            <button
              onClick={() => authContext?.signOut?.()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground transition-colors"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
