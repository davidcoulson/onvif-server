import net from 'node:net';

/**
 * A plain TCP forwarder, replacing the unmaintained `node-tcp-proxy` 0.0.x.
 *
 * Each virtual camera advertises RTSP/snapshot URLs on its own IP, so we accept
 * on that address and pipe both directions to the real camera. Errors are logged
 * and the pair torn down rather than thrown, so one dead camera cannot take the
 * process (and every other camera) with it.
 */
export class TcpProxy {
    #server;
    #sockets = new Set();
    #logger;
    #target;

    constructor({ listenHost, listenPort, targetHost, targetPort, logger }) {
        this.#logger = logger;
        this.#target = `${targetHost}:${targetPort}`;
        this.listenHost = listenHost;
        this.listenPort = listenPort;

        this.#server = net.createServer((client) => {
            const upstream = net.createConnection({ host: targetHost, port: targetPort });

            this.#track(client);
            this.#track(upstream);

            const teardown = (error) => {
                if (error && error.code !== 'ECONNRESET' && error.code !== 'EPIPE')
                    this.#logger.debug(`proxy ${listenPort} -> ${this.#target} closed: ${error.message}`);
                client.destroy();
                upstream.destroy();
            };

            client.on('error', teardown);
            upstream.on('error', teardown);
            client.on('close', teardown);
            upstream.on('close', teardown);

            client.pipe(upstream);
            upstream.pipe(client);
        });

        this.#server.on('error', (error) => {
            this.#logger.error(`tcp proxy on port ${listenPort} failed: ${error.message}`);
        });
    }

    #track(socket) {
        this.#sockets.add(socket);
        socket.on('close', () => this.#sockets.delete(socket));
    }

    listen() {
        return new Promise((resolve, reject) => {
            const onError = (error) => reject(error);
            this.#server.once('error', onError);
            this.#server.listen(this.listenPort, this.listenHost, () => {
                this.#server.removeListener('error', onError);
                resolve();
            });
        });
    }

    async close() {
        for (const socket of this.#sockets) socket.destroy();
        this.#sockets.clear();
        await new Promise((resolve) => this.#server.close(resolve));
    }
}
