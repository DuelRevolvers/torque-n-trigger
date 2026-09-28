import { Peer } from 'peerjs';

// Online sessions over WebRTC data channels. PeerJS's public signalling server
// only brokers the connection; game traffic goes peer to peer. The host's peer
// id is derived from the room code, so joining needs nothing but the code.

const PREFIX = 'torque-trigger-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const fail = (e) => {
      peer.destroy();
      reject(e);
    };
    peer.once('open', () => {
      peer.off('error', fail);
      resolve(peer);
    });
    peer.once('error', fail);
  });
}

export class NetSession {
  constructor(role) {
    this.role = role; // 'host' | 'client'
    this.handlers = {};
    this.conns = new Map(); // peer id (or 'host') -> DataConnection
    this.peer = null;
    this.code = null;
  }

  // Handlers: message(msg, from), join(id), leave(id). Replaces any previous set.
  on(handlers) {
    this.handlers = handlers;
  }

  emit(name, ...args) {
    this.handlers[name]?.(...args);
  }

  static async host() {
    const s = new NetSession('host');
    for (let attempt = 0; attempt < 4 && !s.peer; attempt++) {
      const code = makeCode();
      try {
        s.peer = await openPeer(PREFIX + code);
        s.code = code;
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e;
      }
    }
    if (!s.peer) throw new Error('Could not reserve a room code. Try again.');
    s.peer.on('connection', (conn) => {
      conn.on('open', () => {
        s.conns.set(conn.peer, conn);
        s.emit('join', conn.peer);
      });
      conn.on('data', (msg) => s.emit('message', msg, conn.peer));
      const gone = () => {
        if (s.conns.delete(conn.peer)) s.emit('leave', conn.peer);
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    s.keepAlive();
    return s;
  }

  static async join(code) {
    const s = new NetSession('client');
    s.code = code.trim().toUpperCase();
    s.peer = await openPeer();
    const conn = s.peer.connect(PREFIX + s.code, { serialization: 'json', reliable: true });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Room not found.')), 10000);
        conn.on('open', () => {
          clearTimeout(timer);
          resolve();
        });
        s.peer.on('error', (e) => {
          clearTimeout(timer);
          reject(e.type === 'peer-unavailable' ? new Error('Room not found.') : e);
        });
      });
    } catch (e) {
      s.peer.destroy();
      throw e;
    }
    s.conns.set('host', conn);
    conn.on('data', (msg) => s.emit('message', msg, 'host'));
    const gone = () => {
      if (s.conns.delete('host')) s.emit('leave', 'host');
    };
    conn.on('close', gone);
    conn.on('error', gone);
    s.keepAlive();
    return s;
  }

  // Losing the signalling server doesn't drop open data channels; reconnect quietly.
  keepAlive() {
    this.peer.on('disconnected', () => {
      if (!this.peer.destroyed) this.peer.reconnect();
    });
  }

  send(msg, to = 'host') {
    const c = this.conns.get(to);
    if (c?.open) c.send(msg);
  }

  broadcast(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  close() {
    this.handlers = {};
    this.peer?.destroy();
  }
}
