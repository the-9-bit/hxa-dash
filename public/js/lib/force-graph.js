// Simple Force-Directed Graph Engine (Canvas-based)
class ForceGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.dragging = null;
    this.hovering = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.animFrame = null;

    this.config = {
      repulsion: 800,
      attraction: 0.01,
      damping: 0.9,
      centerForce: 0.005,
      minDist: 60
    };

    this._initEvents();
  }

  setData(nodes, edges) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Preserve existing positions if node exists
    const oldMap = new Map(this.nodes.map(n => [n.id, n]));

    this.nodes = nodes.map(n => {
      const old = oldMap.get(n.id);
      return {
        ...n,
        x: old ? old.x : w / 2 + (Math.random() - 0.5) * w * 0.5,
        y: old ? old.y : h / 2 + (Math.random() - 0.5) * h * 0.5,
        vx: old ? old.vx : 0,
        vy: old ? old.vy : 0,
        radius: Math.max(16, 10 + (n.stats?.open_count || 0) * 3 + (n.stats?.closed_count || 0) * 1)
      };
    });

    this.edges = edges.map(e => ({
      ...e,
      sourceNode: this.nodes.find(n => n.id === e.source),
      targetNode: this.nodes.find(n => n.id === e.target)
    })).filter(e => e.sourceNode && e.targetNode);

    if (!this.animFrame) this._animate();
  }

  _initEvents() {
    const rect = () => this.canvas.getBoundingClientRect();

    this.canvas.addEventListener('mousemove', (e) => {
      const r = rect();
      const scaleX = this.canvas.width / r.width;
      const scaleY = this.canvas.height / r.height;
      this.mouseX = (e.clientX - r.left) * scaleX;
      this.mouseY = (e.clientY - r.top) * scaleY;

      if (this.dragging) {
        this.dragging.x = this.mouseX;
        this.dragging.y = this.mouseY;
        this.dragging.vx = 0;
        this.dragging.vy = 0;
      } else {
        this.hovering = this._findNode(this.mouseX, this.mouseY);
        this.canvas.style.cursor = this.hovering ? 'grab' : 'default';
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      const r = rect();
      const scaleX = this.canvas.width / r.width;
      const scaleY = this.canvas.height / r.height;
      const x = (e.clientX - r.left) * scaleX;
      const y = (e.clientY - r.top) * scaleY;
      this.dragging = this._findNode(x, y);
      if (this.dragging) this.canvas.style.cursor = 'grabbing';
    });

    this.canvas.addEventListener('mouseup', () => {
      this.dragging = null;
      this.canvas.style.cursor = this.hovering ? 'grab' : 'default';
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.dragging = null;
      this.hovering = null;
    });
  }

  _findNode(x, y) {
    for (const n of this.nodes) {
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy < n.radius * n.radius) return n;
    }
    return null;
  }

  _simulate() {
    const { repulsion, attraction, damping, centerForce, minDist } = this.config;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    // Repulsion between all node pairs
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < minDist) dist = minDist;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Attraction along edges
    for (const e of this.edges) {
      const a = e.sourceNode, b = e.targetNode;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction * (1 + e.weight * 0.5);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Center gravity
    for (const n of this.nodes) {
      n.vx += (cx - n.x) * centerForce;
      n.vy += (cy - n.y) * centerForce;
    }

    // Apply velocity with damping
    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(n.radius, Math.min(this.canvas.width - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(this.canvas.height - n.radius, n.y));
    }
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw edges
    for (const e of this.edges) {
      const a = e.sourceNode, b = e.targetNode;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      const colors = { review: '#bc8cff', issue: '#3fb950', project: '#58a6ff' };
      ctx.strokeStyle = colors[e.type] || '#30363d';
      ctx.lineWidth = Math.min(1 + e.weight * 0.8, 5);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Edge label on hover
      if (this.hovering && (e.sourceNode === this.hovering || e.targetNode === this.hovering)) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = colors[e.type] || '#58a6ff';
        ctx.lineWidth = Math.min(2 + e.weight, 6);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw nodes
    for (const n of this.nodes) {
      const isHovered = n === this.hovering;

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = n.online ? '#1a3a2a' : '#1c1c1c';
      ctx.fill();
      ctx.strokeStyle = n.online ? '#3fb950' : '#484f58';
      ctx.lineWidth = isHovered ? 3 : 1.5;
      ctx.stroke();

      // Name
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${isHovered ? 'bold ' : ''}12px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.name, n.x, n.y);

      // Role below (on hover)
      if (isHovered && n.role) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillText(n.role, n.x, n.y + n.radius + 12);
      }
    }

    // Edge labels on hover
    if (this.hovering) {
      for (const e of this.edges) {
        if (e.sourceNode === this.hovering || e.targetNode === this.hovering) {
          const midX = (e.sourceNode.x + e.targetNode.x) / 2;
          const midY = (e.sourceNode.y + e.targetNode.y) / 2;
          const typeLabels = { review: 'Review', issue: 'Issue协作', project: '同项目' };
          const label = `${typeLabels[e.type] || e.type} (${e.weight}x)`;
          ctx.font = '10px -apple-system, sans-serif';
          ctx.fillStyle = 'rgba(22,27,34,.85)';
          const tw = ctx.measureText(label).width + 8;
          ctx.fillRect(midX - tw/2, midY - 8, tw, 16);
          ctx.fillStyle = '#e6edf3';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, midX, midY);
        }
      }
    }

    // Tooltip for hovered node
    if (this.hovering) {
      const n = this.hovering;
      const s = n.stats || {};
      const connectedEdges = this.edges.filter(e => e.sourceNode === n || e.targetNode === n);
      const partners = connectedEdges.length;
      const text = `${n.name}${n.role ? ' (' + n.role + ')' : ''}: ${s.open_count || 0} 进行中, ${s.closed_count || 0} 已完成, ${partners} 协作伙伴`;
      ctx.fillStyle = 'rgba(22,27,34,.9)';
      ctx.font = '11px -apple-system, sans-serif';
      const tw = ctx.measureText(text).width + 16;
      const tx = Math.min(n.x - tw / 2, w - tw - 8);
      const ty = n.y - n.radius - 30;
      ctx.fillRect(tx, ty, tw, 22);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tw, 22);
      ctx.fillStyle = '#e6edf3';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tx + 8, ty + 11);
    }
  }

  _animate() {
    this._simulate();
    this._draw();
    this.animFrame = requestAnimationFrame(() => this._animate());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
