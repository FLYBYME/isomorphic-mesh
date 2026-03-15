import { IBrokerPlugin, IServiceBroker, IMeshNetwork, IContext } from 'isomorphic-core';

/**
 * Internal interface for errors with a code property.
 */
interface MeshErrorCode extends Error {
    code?: string | number;
}

/**
 * NetworkPlugin — The Global Sink/Source.
 * ZERO 'any' casts.
 */
export class NetworkPlugin implements IBrokerPlugin {
    public readonly name = 'network-plugin';

    constructor(private network: IMeshNetwork) {}

    onRegister(broker: IServiceBroker): void {
        broker.setNetwork(this.network);

        // 1. Inbound Flow (Source) with Error Boundary
        this.network.onMessage('*', async (_data, packet) => {
            if (packet.type === 'REQUEST') {
                if (packet.senderNodeID === broker.app.nodeID) return;
                
                try {
                    const result = await broker.handleIncomingRPC(packet);
                    await this.network.send(packet.senderNodeID, '$rpc.response', {
                        id: packet.id,
                        type: 'RESPONSE',
                        data: result,
                        senderNodeID: broker.app.nodeID,
                        meta: { correlationID: packet.id }
                    });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Unknown RPC Error';
                    let code: string | number = 'RPC_ERROR';
                    
                    if (err instanceof Error && 'code' in err) {
                        const codedError = err as MeshErrorCode;
                        if (codedError.code !== undefined) code = codedError.code;
                    }

                    await this.network.send(packet.senderNodeID, '$rpc.response', {
                        id: packet.id,
                        type: 'RESPONSE_ERROR',
                        error: { message, code },
                        senderNodeID: broker.app.nodeID,
                        meta: { correlationID: packet.id }
                    });
                }
            }
        });

        // 2. Outbound Sink (Middleware)
        broker.use(async (ctx: IContext<unknown, Record<string, unknown>>, next: () => Promise<unknown>) => {
            if (ctx.targetNodeID && ctx.targetNodeID !== broker.app.nodeID) {
                const response = await broker.executeRemote(
                    ctx.targetNodeID, 
                    ctx.actionName, 
                    ctx.params, 
                    ctx.meta
                );
                ctx.result = response;
                return;
            }
            return await next();
        });
    }

    async onStart(): Promise<void> {
        await this.network.start();
    }

    async onStop(): Promise<void> {
        await this.network.stop();
    }
}
