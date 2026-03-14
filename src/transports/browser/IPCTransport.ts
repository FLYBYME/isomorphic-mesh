import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { TransportConnectOptions } from '../../types/mesh.types';

import { MeshPacket } from '../../types/packet.types';

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

    async send(_nodeID: string, _packet: MeshPacket): Promise<void> {
        throw new Error('IPCTransport is not supported in the browser environment.');
    }

    async publish(_topic: string, _packet: MeshPacket): Promise<void> {
        throw new Error('IPCTransport is not supported in the browser environment.');
    }
}
