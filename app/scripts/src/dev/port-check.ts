import { connect, createServer } from "node:net";

export type PortCheck = { name: string; port: number; variable: string };

const CONNECT_TIMEOUT_MS = 500;

/** True when something accepts TCP connections on `host:port`. */
const acceptsConnections = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (inUse: boolean): void => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });

/** True when this process cannot bind `port` on all interfaces. */
const cannotBind = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.listen(port, () => server.close(() => resolve(false)));
  });

/**
 * Whether a dev server could not use `port`: something answers on IPv4 or IPv6
 * loopback, or the port cannot be bound. Both checks, because on Windows a
 * loopback-only listener does not always block a wildcard bind.
 */
export const isPortInUse = async (port: number): Promise<boolean> => {
  // Sequential on purpose: while the bind probe listens, a connect would reach it.
  if (await cannotBind(port)) return true;
  const [ipv4, ipv6] = await Promise.all([acceptsConnections("127.0.0.1", port), acceptsConnections("::1", port)]);
  return ipv4 || ipv6;
};

/** The checks whose port is taken, probed in parallel. */
export const findBusyPorts = async (
  checks: readonly PortCheck[],
  probe: (port: number) => Promise<boolean> = isPortInUse,
): Promise<PortCheck[]> => {
  const inUse = await Promise.all(checks.map((check) => probe(check.port)));
  return checks.filter((_check, index) => inUse[index] === true);
};
