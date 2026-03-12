// HxA Dash — Main Application
// Utility functions (used by components)
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// App state
const App = {
  ws: null,
  reconnectTimer: null,
  data: { team: [], board: {}, timeline: [], graph: { nodes: [], edges: [] } },

  async init() {
    CardWall.init();
    DetailDrawer.init();
    CollabGraph.init();
    TaskBoard.init();
    Timeline.init();

    // Initial REST fetch
    await this.fetchAll();

    // WebSocket connection
    this.connectWS();

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => this.fetchAll());
  },

  async fetchAll() {
    try {
      const [teamRes, boardRes, timelineRes, graphRes] = await Promise.all([
        fetch('/api/team'),
        fetch('/api/board'),
        fetch('/api/timeline'),
        fetch('/api/graph')
      ]);

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        this.data.team = teamData.agents;
        CardWall.render(teamData.agents);
      }

      if (boardRes.ok) {
        this.data.board = await boardRes.json();
        TaskBoard.render(this.data.board);
      }

      if (timelineRes.ok) {
        const tlData = await timelineRes.json();
        this.data.timeline = tlData.events;
        Timeline.render(tlData.events);
      }

      if (graphRes.ok) {
        this.data.graph = await graphRes.json();
        CollabGraph.render(this.data.graph);
      }

      this.updateTimestamp();
    } catch (err) {
      console.error('Fetch error:', err);
    }
  },

  connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws`;

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus('connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.setStatus('disconnected');
      };
    } catch (err) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  },

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWS();
    }, 5000);
  },

  handleMessage(msg) {
    this.updateTimestamp();

    switch (msg.type) {
      case 'snapshot':
        if (msg.data.team) {
          const agents = Array.isArray(msg.data.team) ? msg.data.team : [];
          this.data.team = agents;
          CardWall.render(agents);
        }
        if (msg.data.board) {
          this.data.board = msg.data.board;
          TaskBoard.render(msg.data.board);
        }
        if (msg.data.timeline) {
          this.data.timeline = msg.data.timeline;
          Timeline.render(msg.data.timeline);
        }
        if (msg.data.graph) {
          this.data.graph = msg.data.graph;
          CollabGraph.render(msg.data.graph);
        }
        break;

      case 'team:update':
        if (Array.isArray(msg.data)) {
          this.data.team = msg.data;
          CardWall.render(msg.data);
        }
        break;

      case 'board:update':
        this.data.board = msg.data;
        TaskBoard.render(msg.data);
        break;

      case 'timeline:new':
        if (Array.isArray(msg.data)) {
          this.data.timeline = msg.data;
          Timeline.render(msg.data);
        }
        break;

      case 'graph:update':
        this.data.graph = msg.data;
        CollabGraph.render(msg.data);
        break;
    }
  },

  setStatus(status) {
    const el = document.getElementById('ws-status');
    el.className = `status-badge ${status}`;
    const labels = { connected: '已连接', disconnected: '断开', connecting: '连接中…' };
    el.textContent = labels[status] || status;
  },

  updateTimestamp() {
    const el = document.getElementById('last-update');
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `最后更新: ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
