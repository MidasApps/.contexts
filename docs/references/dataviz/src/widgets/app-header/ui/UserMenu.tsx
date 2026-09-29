'use client';

import { User, LogOut, Shield } from 'lucide-react';
import Link from 'next/link';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

/**
 * O avatar do canto direito, e o que ele guarda.
 *
 * O perfil morava no rodapé da coluna de navegação, onde competia por espaço
 * com a lista de relatórios e sumia junto com ela na gaveta do mobile. Aqui
 * ele é o último item da topbar — depois de Filtros, separado por um traço —,
 * que é onde a pessoa procura por "quem sou eu e como saio daqui".
 *
 * Fail-soft fora do `<AuthProvider>`: sem sessão, não desenha nada. Um avatar
 * vazio no header seria pior que nenhum.
 */
export function UserMenu() {
  let authContext: ReturnType<typeof useAuthContext> | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
  try { authContext = useAuthContext(); } catch {}
  const { isAdmin } = useUserPermissions();
  const profile = authContext?.profile;

  if (!profile) return null;

  const name = profile.displayName ?? profile.email ?? 'Usuário';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Conta de ${name}`}
          title={name}
        >
          {profile.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar 32px de URL externa arbitrária (Firebase/Google); next/image exigiria whitelist de domínios remotos
            <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[220px] border-border bg-popover">
        <div className="px-2 py-1.5">
          <p className="truncate text-[12px] font-medium text-foreground">{name}</p>
          {profile.email && (
            <p className="truncate text-[11px] text-muted-foreground/70">{profile.email}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem asChild className="text-[12px] text-foreground">
            <Link href="/admin">
              <Shield className="mr-2 h-3 w-3" /> Administração
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => authContext?.signOut?.()}
          className="text-[12px] text-foreground"
        >
          <LogOut className="mr-2 h-3 w-3" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
