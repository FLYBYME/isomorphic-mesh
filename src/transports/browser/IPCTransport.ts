import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { TransportConnectOptions } from '../../types/mesh.types';

/**
 * IPCTransport — Browser stub (IPC not supported in browsers).
 */
export class IPCTransport extends BaseTransport {
    readonly protocol = 'ipc';

    constructor(serializer: BaseSerializer) {
        super(serializer);
    }

    async connect(_opts: TransportConnectOptions): Promise<void> {
        throw new Error('IPCTransport is not supported in the browser environment.');
    }

    async disconnect(): Promise<void> {
        // No-op
    }

    async send(_nodeID: string, _packet: Record<string, unknown>): Promise<void> {
        throw new Error('IPCTransport is not supported in the browser environment.');
    }

    async publish(_topic: string, _data: Record<string, unknown>): Promise<void> {
        throw new Error('IPCTransport is not supported in the browser environment.');
    }
}
