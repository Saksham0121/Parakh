import ws from 'k6/ws';
import { check } from 'k6';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const url = 'ws://host.docker.internal:80/socket.io/?EIO=4&transport=websocket';
  
  const res = ws.connect(url, null, function (socket) {
    socket.on('open', () => {
      // Socket.io heartbeat
      socket.setInterval(function timeout() {
        socket.ping();
      }, 25000);
    });

    socket.on('message', (msg) => {
      if (msg === '2') { // ping
        socket.send('3'); // pong
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, 60000);
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
