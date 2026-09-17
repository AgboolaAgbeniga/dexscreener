/**
 * Server-Sent Events (SSE) Channel Manager
 * Manages client connections, channel subscriptions, heartbeats, and broadcasts.
 */
class SSEManager {
  constructor() {
    this.clients = new Map(); // clientId -> { res, chain, timer }
    this.clientIdCounter = 0;
    this.heartbeatInterval = process.env.NODE_ENV === 'test' ? null : setInterval(() => this._sendHeartbeats(), 15000);
  }

  addClient(req, res, chain = 'solana') {
    const clientId = ++this.clientIdCounter;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.flushHeaders?.();

    // Send initial handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, chain, timestamp: Date.now() })}\n\n`);

    this.clients.set(clientId, { res, chain });

    req.on('close', () => {
      this.clients.delete(clientId);
    });

    return clientId;
  }

  broadcast(chain, eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [clientId, client] of this.clients.entries()) {
      if (client.chain === chain || chain === 'all') {
        try {
          client.res.write(payload);
        } catch (err) {
          this.clients.delete(clientId);
        }
      }
    }
  }

  _sendHeartbeats() {
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.res.write(':ping\n\n');
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  getClientCount(chain) {
    if (!chain) return this.clients.size;
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.chain === chain) count++;
    }
    return count;
  }

  cleanup() {
    clearInterval(this.heartbeatInterval);
  }
}

module.exports = new SSEManager();
