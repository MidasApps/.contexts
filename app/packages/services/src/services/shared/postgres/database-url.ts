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

const parseSocketDsn = (value: string): SocketDatabaseTarget | undefined => {
  const match = SOCKET_DSN.exec(value);
  if (match === null) return undefined;
  const [, username = "", password, database = "", query = ""] = match;
  const params = new URLSearchParams(query);
  const socketDir = params.get("host");
  const port = parsePort(params.get("port"));
  if (socketDir?.startsWith("/") !== true || port === undefined) return undefined;
  return {
    kind: "socket",
    socketDir,
    database: decodeURIComponent(database),
    username: decodeURIComponent(username),
    ...(password === undefined ? {} : { password: decodeURIComponent(password) }),
    port,
  };
};

/** Reads a Postgres DSN; `undefined` when it is neither supported form. */
export const parseDatabaseUrl = (value: string): DatabaseTarget | undefined =>
  parseTcpUrl(value) ?? parseSocketDsn(value);

/** Socket file the driver opens (`<dir>/.s.PGSQL.<port>`, same rule as libpq and postgres.js). */
export const socketFilePath = (target: Pick<SocketDatabaseTarget, "socketDir" | "port">): string =>
  `${target.socketDir}/.s.PGSQL.${target.port}`;
