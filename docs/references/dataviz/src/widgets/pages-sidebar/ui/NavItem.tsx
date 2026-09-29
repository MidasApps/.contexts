'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Banknote,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
  Table2,
  BookOpen,
  Shield,
  FileCheck,
  Building2,
  BarChart3,
  Map,
  PieChart,
  Users,
  Settings2,
  Upload,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Banknote,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
  Table2,
  BookOpen,
  Shield,
  FileCheck,
  Building2,
  BarChart3,
  Map,
  PieChart,
  Users,
  Settings2,
  Upload,
};

interface NavItemProps {
  label: string;
  href: string;
  icon: string;
  collapsed?: boolean;
  /** Chamado no clique do link em si — não no container ao redor dele. */
  onClick?: () => void;
}

export function NavItem({ label, href, icon, collapsed, onClick }: NavItemProps) {
  const pathname = usePathname() ?? '';
  const isActive = pathname === href || pathname.startsWith(href + '/');
  const Icon = iconMap[icon] ?? LayoutDashboard;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-full text-[13px] transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20',
        isActive
          ? 'bg-primary/10 text-foreground font-medium shadow-sm'
          : 'text-foreground/55 hover:bg-muted/40 hover:text-muted-foreground',
        collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
      )}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-primary" />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
          isActive ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-muted-foreground/80'
        )}
        strokeWidth={isActive ? 1.8 : 1.5}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
