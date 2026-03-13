import { Env } from '../utils/Env';

export interface IHttpServer {
    listen(port: number, cb: () => void): void;
    close(cb: () => void): void;
    address(): unknown;
    on(event: string, cb: (data: any) => void): void;
}

export class UnifiedServer {
    private app: any = null;
    private server: IHttpServer | null = null;
    private port: number;
    private listening = false;

    constructor(port = 0) {
        this.port = port;
        if (Env.isNode()) {
            const express = eval('require')('express');
            const http = eval('require')('node:http');
            this.app = express();
            this.server = http.createServer(this.app) as IHttpServer;
        }
    }

    getApp(): any { return this.app; }
    getServer(): IHttpServer | null { return this.server; }
    getPort(): number { return this.port; }

    async listen(): Promise<number | null> {
        if (!Env.isNode() || this.listening || !this.server) return this.port;

        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, () => {
                const addr = this.server!.address();
                if (addr && typeof addr === 'object') this.port = (addr as { port: number }).port;
                this.listening = true;
                resolve(this.port);
            });
            this.server!.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        if (!this.listening || !this.server) return;
        return new Promise((resolve) => {
            this.server!.close(() => {
                this.listening = false;
                resolve();
            });
        });
    }
}
