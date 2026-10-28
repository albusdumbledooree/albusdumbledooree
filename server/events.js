'use strict';
// Server-Sent Events hub: pushes live updates (new orders, ready dishes, menu changes) to browsers.
// Each choyxona has its own hub, so events never leak between choyxonas.
function createHub() {
  const clients = new Set();

  function subscribe(req, res, user, token = null) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ user_id: user.id })}\n\n`);
    const client = { res, user, token };
    clients.add(client);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
    });
  }

  // target: { roles?: string[], userIds?: number[] } — omitted means everyone.
  function publish(type, data = {}, target = {}) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) {
      const byRole = target.roles && target.roles.includes(c.user.role);
      const byUser = target.userIds && target.userIds.includes(c.user.id);
      if ((!target.roles && !target.userIds) || byRole || byUser) c.res.write(payload);
    }
  }

  function disconnectUser(userId) {
    for (const c of clients) if (userId === undefined || c.user.id === userId) c.res.end();
  }

  // Closes the live streams of these session keys only (other devices of the same person stay connected).
  function disconnectSessions(tokens) {
    for (const c of clients) if (c.token && tokens.has(c.token)) c.res.end();
  }

  return { subscribe, publish, disconnectUser, disconnectSessions, size: () => clients.size };
}

module.exports = { createHub };
