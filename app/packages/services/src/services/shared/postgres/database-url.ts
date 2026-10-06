/**
 * `DATABASE_URL` forms (decision 0023, SP0 follow-up #3):
 * - TCP: `postgresql://user:pass@host:5432/db` (local container, private IP);
 * - Cloud SQL unix socket: `postgresql://user@/db?host=/cloudsql/<project:region:instance>`.
 * The socket form has an empty host, which WHATWG `URL` (and so `z.url()` and
 * postgres.js) cannot parse, so it is read here and handed to the driver as options.
 */
export type TcpDatabaseTarget = { kind: "tcp"; url: string; hostname: string };
export type SocketDatabaseTarget = {
  kind: "socket";
  socketDir: string;
  database: string;
  username: string;
  password?: string;
  port: number;
  /** Query parameters other than `host` and `port` (e.g. `sslmode`, `application_name`). */
  params: Readonly<Record<string, string>>;
};
export type DatabaseTarget = TcpDatabaseTarget | SocketDatabaseTarget;

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEFAULT_PORT = 5432;
// user[:password]@/database?query — the empty host between "@" and "/" marks the socket form.
const SOCKET_DSN = /^postgres(?:ql)?:\/\/([^:@/?#]+)(?::([^@/?#]*))?@\/([^/?#]+)\?([^#]+)$/;

const parseTcpUrl = (value: string): TcpDatabaseTarget | undefined => {
  if (!URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (!POSTGRES_PROTOCOLS.has(url.protocol) || url.hostname === "") return undefined;
  return { kind: "tcp", url: value, hostname: url.hostname };
};

const parsePort = (value: string | null): number | undefined => {
  if (value === null) return DEFAULT_PORT;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
};

const SOCKET_ROUTING_PARAMS = new Set(["host", "port"]);

const extraParams = (params: URLSearchParams): Record<string, string> =>
  Object.fromEntries([...params].filter(([key]) => !SOCKET_ROUTING_PARAMS.has(key)));

/** `decodeURIComponent` without the throw: a malformed escape makes the DSN unsupported. */
const decodeComponent = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch (error: unknown) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
};

const decodeCredentials = (raw: { username: string; password: string | undefined; database: string }) => {
  const username = decodeComponent(raw.username);
  const database = decodeComponent(raw.database);
  const password = raw.password === undefined ? undefined : decodeComponent(raw.password);
  if (username === undefined || database === undefined || (raw.password !== undefined && password === undefined))
    return undefined;
  return { username, database, ...(password === undefined ? {} : { password }) };
};

const parseSocketDsn = (value: string): SocketDatabaseTarget | undefined => {
  const match = SOCKET_DSN.exec(value);
  if (match === null) return undefined;
  const [, username = "", password, database = "", query = ""] = match;
  const params = new URLSearchParams(query);
  const socketDir = params.get("host");
  const port = parsePort(params.get("port"));
  const credentials = decodeCredentials({ username, password, database });
  if (socketDir?.startsWith("/") !== true || port === undefined || credentials === undefined) return undefined;
  return { kind: "socket", socketDir, ...credentials, port, params: extraParams(params) };
};

/** Reads a Postgres DSN; `undefined` when it is neither supported form. */
export const parseDatabaseUrl = (value: string): DatabaseTarget | undefined =>
  parseTcpUrl(value) ?? parseSocketDsn(value);

/** Socket file the driver opens (`<dir>/.s.PGSQL.<port>`, same rule as libpq and postgres.js). */
export const socketFilePath = (target: Pick<SocketDatabaseTarget, "socketDir" | "port">): string =>
  `${target.socketDir}/.s.PGSQL.${target.port}`;
