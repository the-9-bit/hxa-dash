// Collaboration Graph Component
const CollabGraph = {
  graph: null,

  init() {
    const canvas = document.getElementById('collab-canvas');
    if (!canvas) return;
    this.graph = new ForceGraph(canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (this.graph) this.graph.resize();
  },

  render(data) {
    if (!this.graph || !data) return;
    this.graph.setData(data.nodes || [], data.edges || []);
  }
};
