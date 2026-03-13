# isomorphic-mesh

A standalone, isomorphic networking stack for Node.js and the Browser. Built for high-performance, decentralized applications requiring multi-protocol support and environment safety.

## Features

- **Isomorphic**: Works seamlessly in both Node.js and modern browsers.
- **Multi-Protocol**: Support for WebSockets (WS), HTTP/SSE, TCP, IPC, and NATS.
- **Zero-Trust Networking**: Built-in framing, OOM protection, and authentication primitives for TCP.
- **Decentralized Discovery**: Kademlia-style DHT discovery and Gossip/PEX support.
- **Strictly Typed**: Zero `any` usage, providing full type safety for packets and node state.
- **Environment Safe**: Node-only dependencies are dynamically loaded and guarded.

## Installation

```bash
npm install isomorphic-mesh
```

## Quick Start

```typescript
import { MeshNetwork, ILogger, IServiceRegistry } from 'isomorphic-mesh';

const logger: ILogger = { ... };
const registry: IServiceRegistry = { ... };

const mesh = new MeshNetwork({
    transportType: 'ws',
    serializerType: 'json',
    port: 4000,
    host: '0.0.0.0'
}, logger, registry);

await mesh.start();

// Send a message to a peer
await mesh.send('peer-node-id', 'my-topic', { hello: 'world' });

// Listen for messages
mesh.onMessage('other-topic', (data, packet) => {
    console.log('Received:', data);
});
```

## Supported Transports

- **WSTransport**: Isomorphic WebSocket support.
- **HTTPTransport**: Isomorphic HTTP/SSE support.
- **TCPTransport**: High-performance Node.js TCP with custom framing.
- **IPCTransport**: Inter-process communication via Worker Threads.
- **NATSTransport**: High-throughput publish/subscribe via NATS.

## License

MIT
