import { BaseSerializer } from '../serializers/BaseSerializer';
import { JSONSerializer } from '../serializers/JSONSerializer';
import { BinarySerializer } from '../serializers/BinarySerializer';
import { ProtoBufSerializer } from '../serializers/ProtoBufSerializer';
import { BaseTransport } from '../transports/BaseTransport';
import { HTTPTransport } from '../transports/HTTPTransport';
import { WSTransport } from '../transports/WSTransport';
import { NATSTransport } from '../transports/NATSTransport';
import { IPCTransport } from '../transports/IPCTransport';
import { TCPTransport } from '../transports/TCPTransport';
import { TransportType, SerializerType } from '../types/mesh.types';

export class TransportFactory {
    static createSerializer(type: SerializerType): BaseSerializer {
        switch (type) {
            case 'binary': return new BinarySerializer();
            case 'protobuf': return new ProtoBufSerializer();
            case 'json':
            default: return new JSONSerializer();
        }
    }

    static createTransport(type: TransportType, serializer: BaseSerializer, port: number): BaseTransport {
        switch (type) {
            case 'tcp': return new TCPTransport(serializer);
            case 'http': return new HTTPTransport(serializer);
            case 'nats': return new NATSTransport(serializer);
            case 'ipc': return new IPCTransport(serializer);
            case 'ws':
            default: return new WSTransport(serializer, port);
        }
    }
}
