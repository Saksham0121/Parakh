import ws from 'k6/ws';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

export const wsConnectingSuccess = new Rate('ws_connecting_success');
export const wsMessagesReceived = new Counter('ws_messages_received');
export const wsLatency = new Trend('ws_ping_latency', true);

export const options = {
  vus: 20,
  duration: '30s',
};

const WS_URL = __ENV.WS_URL || 'ws://localhost/socket.io/?EIO=4&transport=websocket';

export default function () {
  const res = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      wsConnectingSuccess.add(1);
      // Socket.io handshake ping
      socket.send('2probe');
    });

    socket.on('message', (data) => {
      wsMessagesReceived.add(1);
      if (data === '3probe') {
        socket.send('5'); // upgrade acknowledgement
      }
    });

    socket.on('ping', () => {
      socket.send('pong');
    });

    socket.on('close', () => {
      // closed
    });

    socket.setTimeout(function () {
      socket.close();
    }, 5000);
  });

  check(res, { 'connected successfully': (r) => r && r.status === 101 });
}
