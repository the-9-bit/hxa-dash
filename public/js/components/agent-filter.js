// Agent Filter/Selector Component
// Manages agent subset selection with localStorage persistence
const AgentFilter = {
  // Storage keys for different filter contexts
  STORAGE_KEYS: {
    overview: 'hxa-dash-filter-overview',
    collab: 'hxa-dash-filter-collab',
    tasks: 'hxa-dash-filter-tasks',
    timeline: 'hxa-dash-filter-timeline'
  },

  // Current filter state per context
  filters: {
    overview: null,  // null = show all, Set = show subset
    collab: null,
    tasks: null,
    timeline: null
  },

  // All known agents
  allAgents: [],

  init() {
    // Load persisted filters
    for (const [ctx, key] of Object.entries(this.STORAGE_KEYS)) {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const names = JSON.parse(saved);
          if (Array.isArray(names) && names.length > 0) {
            this.filters[ctx] = new Set(names);
          }
        } catch {}
      }
    }

    this._setupModal();
  },

  // Update the agent list (called when team data arrives)
  setAgents(agents) {
    this.allAgents = agents.map(a => ({
      name: a.name,
      online: !!a.online,
      role: a.role || ''
    }));

    // Update collab sidebar if visible
    this._renderCollabSidebar();
  },

  // Get filtered agent names for a context (null = all)
  getFilter(context) {
    return this.filters[context];
  },

  // Check if an agent passes the filter
  passes(context, agentName) {
    const f = this.filters[context];
    if (!f) return true;
    return f.has(agentName);
  },

  // Filter a list of items by agent name
  filterItems(context, items, agentKey = 'assignee') {
    const f = this.filters[context];
    if (!f) return items;
    return items.filter(item => {
      const name = item[agentKey];
      return !name || f.has(name);
    });
  },

  // Save filter
  _save(context) {
    const key = this.STORAGE_KEYS[context];
    const f = this.filters[context];
    if (f) {
      localStorage.setItem(key, JSON.stringify([...f]));
    } else {
      localStorage.removeItem(key);
    }
  },

  // Update filter count display
  updateCountDisplay(context) {
    const countEl = document.getElementById(`${context}-agent-count`);
    const clearBtn = document.getElementById(`${context}-clear-filter`);
    const f = this.filters[context];

    if (countEl) {
      if (f) {
        countEl.textContent = `${f.size} / ${this.allAgents.length} Agent`;
      } else {
        countEl.textContent = `全部 ${this.allAgents.length} Agent`;
      }
    }
    if (clearBtn) {
      clearBtn.style.display = f ? '' : 'none';
    }
  },

  // Open agent selector modal for a context
  _activeContext: null,
  _tempSelection: null,

  openSelector(context) {
    this._activeContext = context;
    const currentFilter = this.filters[context];
    this._tempSelection = currentFilter ? new Set(currentFilter) : new Set(this.allAgents.map(a => a.name));

    this._renderModalList();
    document.getElementById('agent-selector-modal').classList.remove('hidden');
  },

  _setupModal() {
    const modal = document.getElementById('agent-selector-modal');
    if (!modal) return;

    modal.querySelector('.modal-overlay').addEventListener('click', () => this._closeModal());
    modal.querySelector('.modal-close').addEventListener('click', () => this._closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this._closeModal());

    document.getElementById('modal-select-all').addEventListener('click', () => {
      this._tempSelection = new Set(this.allAgents.map(a => a.name));
      this._renderModalList();
    });

    document.getElementById('modal-clear-all').addEventListener('click', () => {
      this._tempSelection = new Set();
      this._renderModalList();
    });

    document.getElementById('modal-apply').addEventListener('click', () => {
      const ctx = this._activeContext;
      if (!ctx) return;

      if (this._tempSelection.size === 0 || this._tempSelection.size === this.allAgents.length) {
        this.filters[ctx] = null;
      } else {
        this.filters[ctx] = new Set(this._tempSelection);
      }
      this._save(ctx);
      this.updateCountDisplay(ctx);
      this._closeModal();

      // Trigger re-render
      if (typeof App !== 'undefined') App.onFilterChange(ctx);
    });

    // Wire up page filter buttons
    for (const ctx of ['overview', 'tasks', 'timeline']) {
      const btn = document.getElementById(`${ctx}-select-agents`);
      if (btn) btn.addEventListener('click', () => this.openSelector(ctx));
      const clearBtn = document.getElementById(`${ctx}-clear-filter`);
      if (clearBtn) clearBtn.addEventListener('click', () => {
        this.filters[ctx] = null;
        this._save(ctx);
        this.updateCountDisplay(ctx);
        if (typeof App !== 'undefined') App.onFilterChange(ctx);
      });
    }
  },

  _renderModalList() {
    const container = document.getElementById('modal-agent-list');
    if (!container) return;

    const sorted = [...this.allAgents].sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online;
      return a.name.localeCompare(b.name);
    });

    container.innerHTML = sorted.map(a => {
      const checked = this._tempSelection.has(a.name) ? 'checked' : '';
      return `
        <label class="check-item">
          <input type="checkbox" value="${esc(a.name)}" ${checked}>
          <span class="online-dot ${a.online ? 'online' : 'offline'}"></span>
          <span class="check-name">${esc(a.name)}</span>
          <span class="check-role">${esc(a.role)}</span>
        </label>
      `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          this._tempSelection.add(cb.value);
        } else {
          this._tempSelection.delete(cb.value);
        }
      });
    });
  },

  _closeModal() {
    document.getElementById('agent-selector-modal').classList.add('hidden');
    this._activeContext = null;
    this._tempSelection = null;
  },

  // Collab sidebar (dedicated for collab page)
  _renderCollabSidebar() {
    const container = document.getElementById('collab-agent-list');
    if (!container) return;

    const currentFilter = this.filters.collab;

    const sorted = [...this.allAgents].sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online;
      return a.name.localeCompare(b.name);
    });

    container.innerHTML = sorted.map(a => {
      const checked = currentFilter ? currentFilter.has(a.name) : true;
      return `
        <label class="check-item">
          <input type="checkbox" value="${esc(a.name)}" ${checked ? 'checked' : ''}>
          <span class="online-dot ${a.online ? 'online' : 'offline'}"></span>
          <span class="check-name">${esc(a.name)}</span>
        </label>
      `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this._updateCollabFilterFromSidebar();
      });
    });
  },

  _updateCollabFilterFromSidebar() {
    const checkboxes = document.querySelectorAll('#collab-agent-list input[type="checkbox"]');
    const selected = new Set();
    checkboxes.forEach(cb => { if (cb.checked) selected.add(cb.value); });

    if (selected.size === 0 || selected.size === this.allAgents.length) {
      this.filters.collab = null;
    } else {
      this.filters.collab = selected;
    }
    this._save('collab');
    if (typeof App !== 'undefined') App.onFilterChange('collab');
  },

  initCollabButtons() {
    const selectAll = document.getElementById('collab-select-all');
    const clearAll = document.getElementById('collab-clear-all');

    if (selectAll) selectAll.addEventListener('click', () => {
      document.querySelectorAll('#collab-agent-list input[type="checkbox"]').forEach(cb => cb.checked = true);
      this._updateCollabFilterFromSidebar();
    });

    if (clearAll) clearAll.addEventListener('click', () => {
      document.querySelectorAll('#collab-agent-list input[type="checkbox"]').forEach(cb => cb.checked = false);
      this._updateCollabFilterFromSidebar();
    });
  }
};
