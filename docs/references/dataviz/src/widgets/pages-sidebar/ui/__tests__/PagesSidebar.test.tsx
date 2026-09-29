/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * A coluna deixou de ser uma ÁRVORE de relatórios expansíveis: o relatório
 * virou escopo, escolhido num dropdown irmão do de cliente, e a lista abaixo
 * mostra só as páginas dele. Dez relatórios não são mais dez nós disputando
 * a coluna.
 */

const pushMock = vi.fn();
const useReportsMock = vi.fn();
const useGroupsMock = vi.fn();
const setActiveReportMock = vi.fn();
const setActiveGroupMock = vi.fn();
const createGroupMock = vi.fn(async () => 'g-novo');

// A rota é dado de entrada da coluna: ela diz qual relatório está na tela.
const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/shared/hooks/useGroups', () => ({
  useGroups: () => useGroupsMock(),
}));

// Recebe o groupId: é o que prova que a busca de páginas é a do relatório em
// foco, e só a dele.
vi.mock('@/shared/hooks/useReports', () => ({
  useReports: (groupId: string | null) => useReportsMock(groupId),
}));

const storeState = vi.hoisted(() => ({
  activeClientId: 'vila-rosa',
  activeGroupId: 'g1',
  activeReportId: 'r2',
  clients: [{ id: 'vila-rosa', name: 'Vila Rosa', initial: 'V', color: '#F3A169' }],
  isNavCollapsed: false,
  chatOpen: false,
  bumpReportsList: vi.fn(),
}));

const toggleNavMock = vi.fn();
const renameInTrailMock = vi.fn();
const setChatOpenMock = vi.fn();

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      ...storeState,
      setActiveReport: setActiveReportMock,
      setActiveGroup: setActiveGroupMock,
      toggleNavCollapsed: toggleNavMock,
      setChatOpen: setChatOpenMock,
      renameInTrail: renameInTrailMock,
    }),
}));

vi.mock('../PageListItem', () => ({
  PageListItem: ({ name, active, onOpen, onRename, onDuplicate, onDelete, onSaveAsTemplate }: {
    name: string;
    active: boolean;
    onOpen: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSaveAsTemplate?: () => void;
  }) => (
    <div>
      <button onClick={onOpen} aria-current={active ? 'page' : undefined}>{name}</button>
      <button onClick={onRename}>{`Renomear ${name}`}</button>
      <button onClick={onDuplicate}>{`Duplicar ${name}`}</button>
      <button onClick={onDelete}>{`Excluir ${name}`}</button>
      {onSaveAsTemplate && (
        <button onClick={onSaveAsTemplate}>{`Template de ${name}`}</button>
      )}
    </div>
  ),
}));

vi.mock('@/features/templates/ui/SaveAsTemplateFromPage', () => ({
  SaveAsTemplateFromPage: ({ open, page }: { open: boolean; page: { name: string } }) =>
    open ? <div data-testid="save-as-template">{`Template de: ${page.name}`}</div> : null,
}));

/*
 * O ReportSwitcher real abre um menu do Radix em portal — o mesmo motivo pelo
 * qual o PageListItem já era mockado aqui. O componente real é coberto em
 * ReportSwitcher.test.tsx; aqui interessa a FIAÇÃO: quem troca de escopo,
 * quem cria, quem renomeia, quem exclui.
 */
vi.mock('../ReportSwitcher', () => ({
  ReportSwitcher: ({ reports, activeGroupId, loading, onSwitch, onNew, onRename, onDelete }: {
    reports: Array<{ id: string; name: string }>;
    activeGroupId: string;
    loading: boolean;
    onSwitch: (id: string) => void;
    onNew: () => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string, name: string) => void;
  }) => {
    const isActive = reports.find((r) => r.id === activeGroupId) ?? reports[0];
    return (
      <div data-testid="report-switcher">
        {loading && <span>carregando relatórios</span>}
        <span>{`Relatório em foco: ${isActive?.name ?? '—'}`}</span>
        {reports.map((r) => (
          <button key={r.id} onClick={() => onSwitch(r.id)}>{`Trocar para ${r.name}`}</button>
        ))}
        <button onClick={onNew}>Novo relatório</button>
        <button onClick={() => isActive && onRename(isActive.id, isActive.name)}>Renomear relatório</button>
        <button onClick={() => isActive && onDelete(isActive.id, isActive.name)}>Excluir relatório</button>
      </div>
    );
  },
}));

// PagesSidebar importa createReport direto do Firestore (não via useReports),
// então o mock precisa ser do módulo, não do hook.
vi.mock('@/shared/lib/firestore/reports', () => ({
  createReport: vi.fn(async () => 'new-report-id'),
}));

vi.mock('../TemplateGallery', () => ({
  TemplateGallery: () => <div data-testid="template-gallery" />,
}));

vi.mock('@/widgets/chat-sidebar', () => ({
  ChatContent: () => <div data-testid="chat-na-coluna" />,
  AgentPicker: () => <div data-testid="agent-picker" />,
  // Atalhos e abertura automatica ao editar sao cobertos no proprio hook.
  useAssistantTab: () => {},
}));

const isAdminMock = vi.fn(() => true);

vi.mock('@/widgets/client-switcher', () => ({
  TopbarClientSwitcher: () => <div data-testid="client-switcher" />,
}));

vi.mock('@/shared/hooks/useUserPermissions', () => ({
  useUserPermissions: () => ({ isAdmin: isAdminMock(), canAccessRoute: () => true }),
}));

import { PagesSidebar } from '../PagesSidebar';

const PAGES = [
  { id: 'r1', name: 'Covenants' },
  { id: 'r2', name: 'Unidades' },
];

const renameMock = vi.fn(async () => {});
const removeMock = vi.fn(async () => {});
const duplicateMock = vi.fn(async () => 'r-dup');

const pages = () => ({
  reports: PAGES,
  loading: false,
  rename: renameMock,
  remove: removeMock,
  duplicate: duplicateMock,
});

const removeGroupMock = vi.fn(async () => {});
const renameGroupMock = vi.fn(async () => {});

const twoReports = () => ({
  groups: [{ id: 'g1', name: 'Carteira' }, { id: 'g2', name: 'Covenants mensais' }],
  loading: false,
  create: createGroupMock,
  rename: renameGroupMock,
  remove: removeGroupMock,
});

function prepare() {
  vi.clearAllMocks();
  isAdminMock.mockReturnValue(true);
  storeState.activeGroupId = 'g1';
  storeState.activeReportId = 'r2';
  storeState.isNavCollapsed = false;
  storeState.chatOpen = false;
  nav.pathname = '/dashboard';
  useGroupsMock.mockReturnValue(twoReports());
  useReportsMock.mockReturnValue(pages());
}

/**
 * Quem manda no escopo quando o store e a URL discordam.
 *
 * O fallback existe para preencher escopo VAZIO, e resolvia sempre para
 * `groups[0]`. Só que a rota também nomeia um relatório — e quando a IA cria um
 * e navega para `/g/teste-x`, ou quando a pessoa dá refresh nessa URL, o
 * `groups[0]` é uma resposta pior que a que está na barra de endereço: o
 * conteúdo abria "Teste X" e a coluna voltava para Covenants, duas afirmações
 * contraditórias na mesma tela.
 */
describe('PagesSidebar — escopo vem da URL antes do primeiro da lista', () => {
  beforeEach(prepare);

  it('carga nova em /g/:id assume o relatório da URL', () => {
    storeState.activeGroupId = '';
    nav.pathname = '/g/g2';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).toHaveBeenCalledWith('g2');
    expect(setActiveGroupMock).not.toHaveBeenCalledWith('g1');
  });

  it('vale também na rota da página, /g/:id/r/:pagina', () => {
    storeState.activeGroupId = '';
    nav.pathname = '/g/g2/r/r1';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).toHaveBeenCalledWith('g2');
  });

  // Fora das rotas de relatório (admin, home resolvendo redirect) não há
  // relatório na URL — o primeiro da lista continua sendo a resposta.
  it('sem relatório na URL, o fallback segue no primeiro da lista', () => {
    storeState.activeGroupId = '';
    nav.pathname = '/dashboard';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).toHaveBeenCalledWith('g1');
  });

  // Link velho / relatório excluído em outra aba: a URL não é autoridade para
  // um id que não existe no cliente.
  it('URL com relatório inexistente não vira escopo', () => {
    storeState.activeGroupId = '';
    nav.pathname = '/g/apagado';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).toHaveBeenCalledWith('g1');
  });

  // O escopo já é válido: ninguém reescreve nada, nem a URL.
  it('escopo já válido não é reescrito', () => {
    storeState.activeGroupId = 'g1';
    nav.pathname = '/g/g2';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).not.toHaveBeenCalled();
  });
});

describe('PagesSidebar — relatório como escopo', () => {
  beforeEach(prepare);

  it('o relatório em foco aparece no seletor, não como nó de árvore', () => {
    render(<PagesSidebar />);
    expect(screen.getByText('Relatório em foco: Carteira')).toBeInTheDocument();
  });

  it('busca as páginas do relatório em foco, e só as dele', () => {
    render(<PagesSidebar />);
    expect(useReportsMock).toHaveBeenCalledWith('g1');
    expect(useReportsMock).not.toHaveBeenCalledWith('g2');
  });

  it('a lista de páginas é intitulada "Páginas"', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('heading', { name: 'Páginas' })).toBeInTheDocument();
  });

  it('trocar de relatório muda o escopo ativo', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para Covenants mensais' }));
    expect(setActiveGroupMock).toHaveBeenCalledWith('g2');
  });

  /* Ficar no relatório novo com o conteúdo do anterior na tela seria um
     estado sem sentido — a troca termina na primeira página do destino. */
  it('a troca abre a primeira página do relatório escolhido', async () => {
    const { rerender } = render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para Covenants mensais' }));

    // O clique só pede a troca; as páginas do destino ainda nem foram
    // buscadas. Este é o render seguinte, já com elas.
    storeState.activeGroupId = 'g2';
    useReportsMock.mockReturnValue({ ...pages(), reports: [{ id: 'r9', name: 'Resumo' }] });
    rerender(<PagesSidebar />);

    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/g/g2/r/r9'));
    expect(setActiveReportMock).toHaveBeenCalledWith('g2', 'r9');
  });

  it('relatório de destino ainda carregando não navega para lugar nenhum', () => {
    const { rerender } = render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para Covenants mensais' }));
    storeState.activeGroupId = 'g2';
    useReportsMock.mockReturnValue({ ...pages(), reports: [], loading: true });
    rerender(<PagesSidebar />);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('clicar no relatório que já está em foco não faz nada', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para Carteira' }));
    expect(setActiveGroupMock).not.toHaveBeenCalled();
  });

  /* A store nasce com activeGroupId vazio: sem o fallback a coluna ficaria
     muda em toda rota que não é de relatório. */
  it('sem escopo guardado, o primeiro relatório vira o foco', () => {
    storeState.activeGroupId = '';
    render(<PagesSidebar />);
    expect(setActiveGroupMock).toHaveBeenCalledWith('g1');
  });

  it('criar relatório passa pelo prompt', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo relatório' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Inadimplência' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await vi.waitFor(() => expect(createGroupMock).toHaveBeenCalledWith('Inadimplência'));
  });

  /* Sem navegar, a coluna passava a mostrar o relatório novo e vazio enquanto
     o meio da tela seguia exibindo os blocos do anterior. */
  it('criar relatório leva para o relatório novo, que está vazio', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Novo relatório' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Inadimplência' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/g/g-novo'));
  });

  it('trocar para relatório sem páginas para no vazio dele, não na rota anterior', async () => {
    const { rerender } = render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para Covenants mensais' }));
    storeState.activeGroupId = 'g2';
    useReportsMock.mockReturnValue({ ...pages(), reports: [] });
    rerender(<PagesSidebar />);
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/g/g2'));
    expect(setActiveReportMock).not.toHaveBeenCalled();
  });

  /* O vazio de `/g/:id` tem o botão; o diálogo mora aqui. Um evento evita dois
     donos do mesmo fluxo. */
  it('o pedido de nova página vindo do conteúdo abre o diálogo', async () => {
    render(<PagesSidebar />);
    act(() => { window.dispatchEvent(new CustomEvent('new-page-request')); });
    expect(await screen.findByRole('button', { name: /Em branco/ })).toBeInTheDocument();
  });

  it('renomear relatório abre o prompt com o nome em foco', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear relatório' }));
    expect(screen.getByDisplayValue('Carteira')).toBeInTheDocument();
  });

  it('excluir relatório pede confirmação avisando das páginas', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir relatório' }));
    expect(screen.getByText(/Excluir relatório "Carteira"/)).toBeInTheDocument();
    expect(screen.getByText(/páginas dentro dele serão perdidas/)).toBeInTheDocument();
    expect(removeGroupMock).not.toHaveBeenCalled();
  });

  it('excluir o relatório em foco devolve o usuário para /dashboard', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir relatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await vi.waitFor(() => expect(removeGroupMock).toHaveBeenCalledWith('g1'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });
});

describe('PagesSidebar — páginas do relatório em foco', () => {
  beforeEach(prepare);

  it('lista as páginas em nível único', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Covenants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unidades' })).toBeInTheDocument();
  });

  it('clique numa página navega para a rota dela', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Covenants' }));
    expect(setActiveReportMock).toHaveBeenCalledWith('g1', 'r1');
    expect(pushMock).toHaveBeenCalledWith('/g/g1/r/r1');
  });

  it('marca a página ativa com aria-current', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Unidades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Covenants' })).not.toHaveAttribute('aria-current');
  });

  it('duplicar age sobre o item apontado, não sobre o ativo', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Covenants' }));
    await vi.waitFor(() => expect(duplicateMock).toHaveBeenCalledWith('r1'));
  });

  it('renomear abre o prompt com o nome do item apontado', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Covenants' }));
    expect(screen.getByDisplayValue('Covenants')).toBeInTheDocument();
  });

  // A trilha do header não relê o documento: a coluna avisa o store.
  it('renomear atualiza a trilha do header com o nome novo', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Unidades' }));
    fireEvent.change(screen.getByDisplayValue('Unidades'), { target: { value: 'Estoque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(renameMock).toHaveBeenCalledWith('r2', 'Estoque'));
    expect(renameInTrailMock).toHaveBeenCalledWith({ reportId: 'r2' }, 'Estoque');
  });

  it('excluir pede confirmação nomeando a página apontada', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Covenants' }));
    expect(screen.getByText(/Excluir página "Covenants"/)).toBeInTheDocument();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('confirmar exclusão da página ativa navega para /dashboard', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Unidades' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await vi.waitFor(() => expect(removeMock).toHaveBeenCalledWith('r2'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('chama onNavigate ao abrir uma página (fecha a gaveta mobile)', () => {
    const onNavigate = vi.fn();
    render(<PagesSidebar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Covenants' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('mostra skeleton enquanto as páginas carregam', () => {
    useReportsMock.mockReturnValue({ ...pages(), reports: [], loading: true });
    render(<PagesSidebar />);
    expect(screen.getByTestId('pages-skeleton')).toBeInTheDocument();
  });

  it('relatório vazio diz que está vazio e segue oferecendo a criação', () => {
    useReportsMock.mockReturnValue({ ...pages(), reports: [] });
    render(<PagesSidebar />);
    expect(screen.getByText('Nenhuma página ainda')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nova página' })).toHaveLength(2);
  });

  /* Sem relatório nenhum não há onde a página nascer — quem convida é o
     próprio seletor de relatório. */
  it('sem relatório nenhum, criar página fica indisponível', () => {
    useGroupsMock.mockReturnValue({ groups: [], loading: false, create: createGroupMock, rename: renameGroupMock, remove: removeGroupMock });
    useReportsMock.mockReturnValue({ ...pages(), reports: [] });
    storeState.activeGroupId = '';
    render(<PagesSidebar />);
    const buttons = screen.getAllByRole('button', { name: 'Nova página' });
    expect(buttons).toHaveLength(1); // só o + do cabeçalho, e desabilitado
    expect(buttons[0]).toBeDisabled();
  });

  it('a linha e o + do cabeçalho são as duas portas para criar página', () => {
    render(<PagesSidebar />);
    expect(screen.getAllByRole('button', { name: 'Nova página' })).toHaveLength(2);
  });

  it('criar página em branco nasce no relatório em foco e abre em edição', async () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Nova página' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Em branco/ }));
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/g/g1/r/new-report-id?edit=1'));
  });

  /*
   * Publicar template é o inverso de importar: sai da página que já funciona,
   * na mesma coluna onde ela é renomeada e duplicada. Não existe mais editor
   * de template separado no admin.
   */
  it('salvar como template age sobre a página apontada', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Template de Covenants' }));
    expect(screen.getByTestId('save-as-template')).toHaveTextContent('Template de: Covenants');
  });

  it('não oferece salvar como template para quem não é admin', () => {
    isAdminMock.mockReturnValue(false);
    render(<PagesSidebar />);
    expect(screen.queryByRole('button', { name: 'Template de Covenants' })).not.toBeInTheDocument();
  });
});

describe('PagesSidebar — chrome persistente', () => {
  beforeEach(prepare);

  /* O cliente dá escopo ao relatório, que dá escopo às páginas: os três
     descem em ordem na mesma coluna. */
  it('o seletor de cliente vive no topo, acima do de relatório', () => {
    render(<PagesSidebar />);
    expect(screen.getByTestId('client-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('report-switcher')).toBeInTheDocument();
  });

  it('o perfil saiu do rodapé — vive no menu do avatar, na topbar', () => {
    render(<PagesSidebar />);
    expect(screen.queryByText('Giulliano Soares')).not.toBeInTheDocument();
  });

  it('mostra Administração para admin', () => {
    render(<PagesSidebar />);
    expect(screen.getByText('Administração')).toBeInTheDocument();
  });

  it('esconde Administração para não-admin', () => {
    isAdminMock.mockReturnValue(false);
    render(<PagesSidebar />);
    expect(screen.queryByText('Administração')).not.toBeInTheDocument();
  });
});

describe('PagesSidebar — colapsar e expandir', () => {
  beforeEach(prepare);

  /* Colapsada, a coluna guarda a ORIENTAÇÃO: qual cliente e quais páginas o
     relatório em foco tem. O escopo em si não cabe num ícone. */
  it('colapsada, troca a lista por um trilho de ícones de página', () => {
    storeState.isNavCollapsed = true;
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Unidades' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Páginas' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('report-switcher')).not.toBeInTheDocument();
  });

  it('no trilho, clicar numa página navega direto', () => {
    storeState.isNavCollapsed = true;
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Covenants' }));
    expect(pushMock).toHaveBeenCalledWith('/g/g1/r/r1');
  });

  it('a inicial do cliente expande a coluna', () => {
    storeState.isNavCollapsed = true;
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(toggleNavMock).toHaveBeenCalledTimes(1);
  });

  /* A gaveta do mobile é a mesma coluna, mas já se abre e fecha inteira: um
     trilho de 56px flutuando dentro dela não serviria a nada. */
  it('colapsavel=false ignora o colapso guardado — é a gaveta do mobile', () => {
    storeState.isNavCollapsed = true;
    render(<PagesSidebar collapsible={false} />);
    expect(screen.getByRole('heading', { name: 'Páginas' })).toBeInTheDocument();
  });
});

/**
 * O chat divide a coluna com as paginas, em vez de flutuar sobre o relatorio.
 *
 * Antes ele era um painel de 360px por cima do conteudo — cobria os graficos
 * justamente enquanto se editava a pagina. Agora e uma ABA: a largura do
 * relatorio nao muda ao trocar, porque a coluna e a mesma nas duas.
 */
describe('PagesSidebar — aba de paginas e assistente', () => {
  beforeEach(prepare);

  it('por padrao mostra as paginas, nao o assistente', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Covenants' })).toBeInTheDocument();
    expect(screen.queryByTestId('chat-na-coluna')).not.toBeInTheDocument();
  });

  it('com o chat pedido, a coluna mostra o assistente no lugar da lista', () => {
    storeState.chatOpen = true;
    render(<PagesSidebar />);
    expect(screen.getByTestId('chat-na-coluna')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renomear Covenants' })).not.toBeInTheDocument();
  });

  it('o seletor troca de aba pelo store', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistente' }));
    expect(setChatOpenMock).toHaveBeenCalledWith(true);
  });

  /* O cliente e o escopo das DUAS abas — some-lo ao abrir o assistente
     esconderia de quem se esta falando. Ele fica acima do seletor de aba. */
  it('o cliente continua visivel na aba do assistente', () => {
    storeState.chatOpen = true;
    render(<PagesSidebar />);
    expect(screen.getByTestId('client-switcher')).toBeInTheDocument();
  });

  /*
   * O relatorio desceu para DENTRO da aba que leva o nome dele.
   *
   * Enquanto ficava acima do seletor, a coluna lia "Covenants" e logo abaixo
   * uma aba chamada "Paginas": o escopo parecia governar as duas abas, e a
   * lista que ele governava tinha outro nome. Agora o dropdown de relatorio e
   * o seletor de agente caem no MESMO lugar — um por aba.
   */
  it('o dropdown de relatorio vive na aba dele, nao acima das duas', () => {
    render(<PagesSidebar />);
    expect(screen.getByTestId('report-switcher')).toBeInTheDocument();
  });

  it('na aba do assistente, o seletor de agente ocupa o lugar do relatorio', () => {
    storeState.chatOpen = true;
    render(<PagesSidebar />);
    expect(screen.queryByTestId('report-switcher')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-picker')).toBeInTheDocument();
  });
});
