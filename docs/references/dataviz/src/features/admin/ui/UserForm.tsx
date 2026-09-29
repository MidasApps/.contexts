'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { RouteCheckboxGrid } from './RouteCheckboxGrid';
import { useAdminGroups } from '@/features/admin/model/useAdminGroups';
import { useAdminClients } from '@/features/admin/model/useAdminClients';
import type { AppUser, ClientAccess, SaveUserInput, SaveUserResult } from '@/features/admin/model/types';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import { slugifyEmail } from '@/shared/schemas/identifier';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface UserFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: SaveUserInput) => Promise<SaveUserResult>;
  user?: AppUser;
}

interface ClientOverrideConfig {
  useGroupRoutes: boolean;
  customRoutes: string[];
}

export function UserForm({ open, onClose, onSave, user }: UserFormProps) {
  const isEdit = !!user;
  const { groups } = useAdminGroups();
  const { clients } = useAdminClients();
  const { isAdmin } = useUserPermissions();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [clientRouteConfigs, setClientOverrideConfigs] = useState<Record<string, ClientOverrideConfig>>({});
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [provisionCredential, setProvisionCredential] = useState(true);
  const [generatePasswordLink, setGeneratePasswordLink] = useState(true);
  const [adminClientIds, setAdminClientIds] = useState<string[]>([]);
  const [resetLink, setResetLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (user) {
        setEmail(user.email);
        setDisplayName(user.displayName);
        setSelectedGroups(user.groups);
        const clientIds = user.clientAccess.map((ca) => ca.clientId);
        setSelectedClients(clientIds);
        const configs: Record<string, ClientOverrideConfig> = {};
        for (const ca of user.clientAccess) {
          configs[ca.clientId] = {
            useGroupRoutes: ca.routeOverrides == null,
            customRoutes: ca.routeOverrides ?? [],
          };
        }
        setClientOverrideConfigs(configs);
        setAdminClientIds(user.adminClientIds ?? []);
      } else {
        setEmail('');
        setDisplayName('');
        setSelectedGroups([]);
        setSelectedClients([]);
        setClientOverrideConfigs({});
        setAdminClientIds([]);
      }
      setError('');
      setExpandedClient(null);
      setResetLink(null);
      setProvisionCredential(true);
      setGeneratePasswordLink(true);
    }
  }, [open, user]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]
    );
  };

  const toggleClient = (clientId: string) => {
    setSelectedClients((prev) => {
      if (prev.includes(clientId)) {
        const next = prev.filter((c) => c !== clientId);
        setClientOverrideConfigs((configs) => {
          const updated = { ...configs };
          delete updated[clientId];
          return updated;
        });
        return next;
      } else {
        setClientOverrideConfigs((configs) => ({
          ...configs,
          [clientId]: { useGroupRoutes: true, customRoutes: [] },
        }));
        return [...prev, clientId];
      }
    });
  };

  const getClientConfig = (clientId: string): ClientOverrideConfig => {
    return clientRouteConfigs[clientId] ?? { useGroupRoutes: true, customRoutes: [] };
  };

  const updateClientConfig = (clientId: string, config: Partial<ClientOverrideConfig>) => {
    setClientOverrideConfigs((prev) => ({
      ...prev,
      [clientId]: { ...getClientConfig(clientId), ...config },
    }));
  };

  const generatedId = isEdit ? user!.id : slugifyEmail(email);

  const handleSave = async () => {
    if (!email.trim()) { setError('Email é obrigatório'); return; }

    const validClientIds = new Set(clients.map((c) => c.id));
    const invalidClients = selectedClients.filter((id) => !validClientIds.has(id));
    if (invalidClients.length > 0) {
      setError(`Cliente(s) inválido(s): ${invalidClients.join(', ')}`);
      return;
    }

    const validGroupIds = new Set(groups.map((g) => g.id));
    const invalidGroups = selectedGroups.filter((id) => !validGroupIds.has(id));
    if (invalidGroups.length > 0) {
      setError(`Grupo(s) inválido(s): ${invalidGroups.join(', ')}`);
      return;
    }

    const clientAccess: ClientAccess[] = selectedClients.map((clientId) => {
      const config = getClientConfig(clientId);
      return {
        clientId,
        routeOverrides: config.useGroupRoutes ? null : config.customRoutes,
      };
    });
    // adminClientIds só entre os clientes selecionados (a fronteira de tenant contém o efeito).
    const scopedAdmin = isAdmin ? adminClientIds.filter((id) => selectedClients.includes(id)) : undefined;

    setSaving(true);
    setError('');
    try {
      const result = await onSave(generatedId, {
        email: email.trim(),
        displayName: displayName.trim(),
        groups: selectedGroups,
        clientAccess,
        ...(scopedAdmin ? { adminClientIds: scopedAdmin } : {}),
        provisionCredential,
        generatePasswordLink,
      });
      if (result?.resetLink) {
        setResetLink(result.resetLink); // one-shot: mostrado até fechar o form; não persiste
      } else {
        onClose();
      }
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-3xl w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? 'Editar Usuário' : 'Adicionar Usuário'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ID */}
          <div>
            <label className="text-[11px] text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">ID</label>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground/80 font-mono">
              {generatedId || '—'}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              disabled={saving || isEdit}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome do usuário"
              disabled={saving}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Groups */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 block">
              Grupos ({selectedGroups.length} selecionados)
            </label>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">Nenhum grupo disponível</p>
            ) : (
              <div className="space-y-1.5">
                {groups.map((group) => {
                  const checked = selectedGroups.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                        checked
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-border bg-muted/40 hover:bg-muted/40'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(group.id)}
                        className="sr-only"
                        disabled={saving}
                      />
                      <div
                        className={cn(
                          'size-3.5 rounded flex items-center justify-center border flex-shrink-0',
                          checked ? 'bg-primary border-primary' : 'border-border bg-transparent'
                        )}
                      >
                        {checked && (
                          <svg className="size-2.5 text-black" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm', checked ? 'text-foreground' : 'text-muted-foreground')}>{group.name}</p>
                        {group.description && (
                          <p className="text-[11px] text-muted-foreground/60 truncate">{group.description}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground/60">{group.routes.length} rotas</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clients */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 block">
              Clientes ({selectedClients.length} selecionados)
            </label>
            {clients.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">Nenhum cliente disponível</p>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => {
                  const checked = selectedClients.includes(client.id);
                  const config = getClientConfig(client.id);
                  const isExpanded = expandedClient === client.id;

                  return (
                    <div
                      key={client.id}
                      className={cn(
                        'rounded-lg border transition-colors overflow-hidden',
                        checked ? 'border-primary/30' : 'border-border'
                      )}
                    >
                      <label
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                          checked ? 'bg-primary/10' : 'bg-muted/40 hover:bg-muted/40'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClient(client.id)}
                          className="sr-only"
                          disabled={saving}
                        />
                        <div
                          className={cn(
                            'size-3.5 rounded flex items-center justify-center border flex-shrink-0',
                            checked ? 'bg-primary border-primary' : 'border-border bg-transparent'
                          )}
                        >
                          {checked && (
                            <svg className="size-2.5 text-black" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div
                          className="size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black flex-shrink-0"
                          style={{ backgroundColor: client.color }}
                        >
                          {client.initial}
                        </div>
                        <span className={cn('text-sm flex-1', checked ? 'text-foreground' : 'text-muted-foreground')}>
                          {client.name}
                        </span>
                        {checked && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setExpandedClient(isExpanded ? null : client.id);
                            }}
                            className="text-muted-foreground/80 hover:text-foreground transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </button>
                        )}
                      </label>

                      {/* Route config (expanded) */}
                      {checked && isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border bg-black/20 space-y-3">
                          {/* Toggle: group routes vs custom */}
                          <div className="flex items-center gap-3 py-2">
                            <button
                              type="button"
                              onClick={() => updateClientConfig(client.id, { useGroupRoutes: true })}
                              className={cn(
                                'text-xs rounded-lg px-3 py-1.5 border transition-colors',
                                config.useGroupRoutes
                                  ? 'bg-primary/15 border-primary/40 text-primary'
                                  : 'bg-muted/40 border-border text-muted-foreground/80 hover:text-muted-foreground'
                              )}
                            >
                              Usar rotas do grupo
                            </button>
                            <button
                              type="button"
                              onClick={() => updateClientConfig(client.id, { useGroupRoutes: false })}
                              className={cn(
                                'text-xs rounded-lg px-3 py-1.5 border transition-colors',
                                !config.useGroupRoutes
                                  ? 'bg-primary/15 border-primary/40 text-primary'
                                  : 'bg-muted/40 border-border text-muted-foreground/80 hover:text-muted-foreground'
                              )}
                            >
                              Rotas personalizadas
                            </button>
                          </div>

                          {!config.useGroupRoutes && (
                            <RouteCheckboxGrid
                              selected={config.customRoutes}
                              onChange={(routes) => updateClientConfig(client.id, { customRoutes: routes })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Provisionamento de credencial */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                aria-label="Criar credencial de acesso"
                checked={provisionCredential}
                onChange={(e) => setProvisionCredential(e.target.checked)}
                disabled={saving}
              />
              Criar credencial de acesso
            </label>
            {provisionCredential && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pl-6">
                <input
                  type="checkbox"
                  aria-label="Gerar link de definição de senha"
                  checked={generatePasswordLink}
                  onChange={(e) => setGeneratePasswordLink(e.target.checked)}
                  disabled={saving}
                />
                Gerar link de definição de senha (login por senha; dispensável para Google)
              </label>
            )}
          </div>

          {/* adminClientIds: só admin global provisiona clientAdmin; escopo fica preso aos clientes já selecionados acima */}
          {isAdmin && (
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 block">
                Administra os clientes (papel clientAdmin)
              </label>
              {selectedClients.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">Selecione ao menos um cliente acima</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedClients.map((cid) => {
                    const checked = adminClientIds.includes(cid);
                    return (
                      <label key={cid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setAdminClientIds((prev) => checked ? prev.filter((x) => x !== cid) : [...prev, cid])
                          }
                          disabled={saving}
                        />
                        {clients.find((c) => c.id === cid)?.name ?? cid}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {resetLink && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
              <p className="text-xs text-foreground">Link de definição de senha (entregue manualmente, uso único):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] break-all text-muted-foreground">{resetLink}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(resetLink)}>Copiar</Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
