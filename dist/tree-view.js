// The seven rows are taxonomic ranks. Each terminal in a layout receives one slot.
(() => {
  'use strict';

  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  const rankLabels = ['界', '门', '纲', '目', '科', '属', '种'];
  const centers = [31, 81, 133, 186, 239, 292, 377];
  const diagramHeight = 434;
  const maxScale = 1.4;
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, label, action) {
    const result = element('button', className, label);
    result.type = 'button';
    if (action) result.addEventListener('click', action);
    return result;
  }

  function svgElement(tag, attributes) {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function makeTaxonomy(fish) {
    const roots = new Map();
    const byKey = new Map();
    const byFish = new Map();
    for (const specimen of fish) {
      const record = window.FISH_TAXONOMY[specimen.id];
      let parent = null;
      let siblings = roots;
      ranks.forEach((rank, depth) => {
        const data = record[rank];
        const key = `${parent?.key || ''}/${rank}:${data.latin}`;
        let node = siblings.get(key);
        if (!node) {
          node = { key, depth, parent, data, children: new Map(), count: 0 };
          siblings.set(key, node);
          byKey.set(key, node);
        }
        node.count++;
        if (rank === 'species') {
          node.fish = specimen;
          byFish.set(specimen.id, node);
        }
        parent = node;
        siblings = node.children;
      });
    }
    return { roots, byKey, byFish };
  }

  function createAtlasTree(container, options = {}) {
    const displayName = options.name || (fish => fish.name);
    const root = element('div', 'tv-root');
    const plot = element('div', 'tv-plot');
    const rail = element('div', 'tv-rail');
    rail.setAttribute('aria-hidden', 'true');
    const rankTags = rankLabels.map(label => {
      const tag = element('span', 'tv-rank', label);
      rail.append(tag);
      return tag;
    });
    const viewport = element('div', 'tv-viewport');
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', '自上而下的鱼类分类树，可拖动画布浏览分支');
    const space = element('div', 'tv-space');
    const stage = element('div', 'tv-stage');
    const empty = element('div', 'tv-empty', '没有匹配的鱼种');
    empty.hidden = true;
    space.append(stage);
    viewport.append(space);
    plot.append(rail, viewport, empty);

    const footer = element('div', 'tv-footer');
    const legend = element('span', 'tv-legend', '选中鱼种的分类路径');
    const controls = element('div', 'tv-controls');
    const collapseButton = button('tv-text-action', '收起', overview);
    collapseButton.title = '收起到纲，选择分支继续展开';
    const expandButton = button('tv-text-action', '展开', expandAll);
    expandButton.title = '展开当前范围的全部分支';
    const divider = element('span', 'tv-divider');
    const less = button('tv-zoom-step', '−', () => zoomBy(1 / 1.25));
    less.setAttribute('aria-label', '缩小分类树');
    const percent = button('tv-percent', '100%', () => setScale(1));
    percent.title = '恢复原大';
    const more = button('tv-zoom-step', '+', () => zoomBy(1.25));
    more.setAttribute('aria-label', '放大分类树');
    const fitButton = button('tv-fit', '适配', fit);
    fitButton.title = '显示当前展开的全部分支';
    const zoomGroup = element('div', 'tv-zoom-group');
    zoomGroup.append(less, percent, more);
    controls.append(collapseButton, expandButton, divider, zoomGroup, fitButton);
    footer.append(legend, controls);
    root.append(plot, footer);
    container.replaceChildren(root);

    let tree = makeTaxonomy([]);
    let fishIds = '';
    let selected = '';
    let folded = new Set();
    let visible = [];
    let width = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let nodeWidth = 120;
    let inset = { top: 0, right: 0, bottom: 0, left: 0 };
    let lastViewportWidth = 0;
    let lastContainerWidth = 0;
    let autoScale = true;
    let resizeFrame = 0;
    const buttons = new Map();
    const wires = new Map();

    function foldBelowClass(revealFirstFork = false) {
      folded = new Set();
      const classes = [];
      tree.byKey.forEach(node => {
        if (node.depth === 2) classes.push(node);
        if (node.depth >= 2 && node.children.size) folded.add(node.key);
      });
      if (!revealFirstFork || classes.length !== 1) return;
      let node = classes[0];
      while (node.children.size) {
        folded.delete(node.key);
        if (node.children.size > 1) break;
        node = node.children.values().next().value;
      }
    }

    function activePath() {
      const result = new Set();
      let node = tree.byFish.get(selected);
      while (node) {
        result.add(node.key);
        node = node.parent;
      }
      return result;
    }

    function markSelection() {
      const active = activePath();
      for (const node of visible) {
        const control = buttons.get(node.key);
        const isActive = active.has(node.key);
        control.classList.toggle('tv-active', isActive);
        if (node.fish) control.setAttribute('aria-pressed', String(isActive));
        const wire = wires.get(node.key);
        if (wire) {
          wire.classList.toggle('tv-active', isActive);
          if (isActive) wire.parentNode.append(wire);
        }
      }
      legend.style.visibility = active.size ? 'visible' : 'hidden';
    }

    function weigh(node) {
      node.drawChildren = folded.has(node.key) ? [] : [...node.children.values()];
      node.weight = node.drawChildren.reduce((total, child) => total + weigh(child), 0) || 1;
      return node.weight;
    }

    // Overlays above the canvas reserve its edges through --tv-inset-* properties.
    function readInsets() {
      const style = getComputedStyle(viewport);
      const read = side => parseFloat(style.getPropertyValue(`--tv-inset-${side}`)) || 0;
      inset = { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
    }

    function room() {
      return {
        width: Math.max(0, viewport.clientWidth - inset.left - inset.right),
        height: Math.max(0, viewport.clientHeight - inset.top - inset.bottom)
      };
    }

    function fittedScale(limit) {
      const { width: roomWidth, height: roomHeight } = room();
      return Math.min(limit, roomWidth / width, roomHeight / diagramHeight);
    }

    function layout() {
      visible = [];
      const roots = [...tree.roots.values()];
      const slots = roots.reduce((total, node) => total + weigh(node), 0);
      const available = room().width || 640;
      const unit = Math.min(166, Math.max(124, (available - 30) / Math.max(slots, 1)));
      nodeWidth = Math.min(146, unit - 14);
      width = slots * unit + 30;
      function position(node, start) {
        node.x = 15 + (start + node.weight / 2) * unit;
        node.y = centers[node.depth];
        visible.push(node);
        let childStart = start;
        for (const child of node.drawChildren) {
          position(child, childStart);
          childStart += child.weight;
        }
      }
      let start = 0;
      roots.forEach(node => { position(node, start); start += node.weight; });
    }

    function nodeHeight(node) { return node.fish ? 94 : 36; }

    function elbow(parent, child) {
      const startY = parent.y + nodeHeight(parent) / 2;
      const endY = child.y - nodeHeight(child) / 2;
      const mid = (startY + endY) / 2;
      const radius = Math.min(4, Math.abs(parent.x - child.x) / 2, (endY - startY) / 2);
      if (radius < 1) return `M ${parent.x} ${startY} V ${endY}`;
      const direction = child.x > parent.x ? 1 : -1;
      return `M ${parent.x} ${startY} V ${mid-radius} Q ${parent.x} ${mid} ${parent.x+direction*radius} ${mid} H ${child.x-direction*radius} Q ${child.x} ${mid} ${child.x} ${mid+radius} V ${endY}`;
    }

    function createNode(node) {
      const isLeaf = Boolean(node.fish);
      const control = button(`tv-node ${isLeaf ? 'tv-leaf' : 'tv-taxon'}`, '');
      control.dataset.treeKey = node.key;
      control.style.left = `${node.x - nodeWidth / 2}px`;
      control.style.top = `${node.y - nodeHeight(node) / 2}px`;
      control.style.width = `${nodeWidth}px`;
      const title = isLeaf ? displayName(node.fish) : node.data.name;
      control.title = `${rankLabels[node.depth]} · ${title} · ${node.data.latin}`;
      if (isLeaf) {
        control.dataset.treeFish = node.fish.id;
        const metadata = window.FISH_PHOTOS[node.fish.id];
        const picture = element('img', 'tv-photo');
        picture.src = metadata.file.startsWith('assets/') ? metadata.file : `assets/${metadata.file}`;
        picture.alt = `${metadata.photoSpecies || title} 真实照片`;
        picture.decoding = 'async';
        const caption = element('span', 'tv-leaf-caption');
        caption.append(element('strong', '', title), element('i', '', node.data.latin));
        const chosen = element('span', 'tv-check', '✓');
        chosen.setAttribute('aria-hidden', 'true');
        control.append(picture, caption, chosen);
        control.setAttribute('aria-label', `查看${title}，${node.data.latin}`);
      } else {
        const label = element('span', 'tv-taxon-copy');
        label.append(element('strong', '', title), element('i', '', node.data.latin));
        const count = element('span', 'tv-count', String(node.count));
        count.setAttribute('aria-hidden', 'true');
        const closed = folded.has(node.key);
        const indicator = element('span', 'tv-chevron');
        indicator.setAttribute('aria-hidden', 'true');
        control.classList.toggle('tv-folded', closed);
        control.setAttribute('aria-expanded', String(!closed));
        control.setAttribute('aria-label', `${rankLabels[node.depth]}，${title}，图中${node.count}种，${closed ? '展开' : '收起'}分支`);
        control.append(label, count, indicator);
      }
      buttons.set(node.key, control);
      return control;
    }

    function alignRanks() {
      rankTags.forEach((tag, i) => {
        tag.style.top = `${offsetY + centers[i] * scale - viewport.scrollTop}px`;
      });
    }

    function sizeCanvas() {
      const scaledWidth = width * scale;
      const scaledHeight = diagramHeight * scale;
      const outerWidth = Math.max(viewport.clientWidth, scaledWidth + inset.left + inset.right);
      const outerHeight = Math.max(viewport.clientHeight, scaledHeight + inset.top + inset.bottom);
      offsetX = inset.left + (outerWidth - inset.left - inset.right - scaledWidth) / 2;
      offsetY = inset.top + (outerHeight - inset.top - inset.bottom - scaledHeight) / 2;
      space.style.width = `${outerWidth}px`;
      space.style.height = `${outerHeight}px`;
      stage.style.width = `${width}px`;
      stage.style.height = `${diagramHeight}px`;
      stage.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
      percent.textContent = `${Math.round(scale * 100)}%`;
      alignRanks();
    }

    function paint({ reset = false, anchor } = {}) {
      const focused = stage.contains(document.activeElement) ? document.activeElement?.dataset.treeKey : null;
      const before = anchor ? tree.byKey.get(anchor) : null;
      const anchorScreen = before ? offsetX + before.x * scale - viewport.scrollLeft : null;
      readInsets();
      layout();
      buttons.clear();
      wires.clear();
      const content = document.createDocumentFragment();
      const svg = svgElement('svg', { width, height: diagramHeight, 'aria-hidden': 'true', class: 'tv-wires' });
      const usedRanks = new Set(visible.map(node => node.depth));
      rankTags.forEach((tag, i) => {
        tag.classList.toggle('tv-unused', !usedRanks.has(i));
        const guide = svgElement('line', { x1: 0, y1: centers[i], x2: width, y2: centers[i], class: 'tv-guide' });
        svg.append(guide);
      });
      const active = activePath();
      const onPath = [];
      visible.forEach(node => {
        if (!node.parent) return;
        const path = svgElement('path', { d: elbow(node.parent, node), class: 'tv-wire' });
        wires.set(node.key, path);
        if (active.has(node.key)) onPath.push(path); else svg.append(path);
      });
      svg.append(...onPath);
      content.append(svg);
      visible.forEach(node => content.append(createNode(node)));
      stage.replaceChildren(content);
      root.classList.toggle('tv-no-data', visible.length === 0);
      empty.hidden = visible.length > 0;
      if (reset) {
        autoScale = true;
        scale = Math.max(.85, fittedScale(maxScale) || 1);
      }
      sizeCanvas();
      if (before && Number.isFinite(anchorScreen)) {
        viewport.scrollLeft = offsetX + before.x * scale - anchorScreen;
      } else if (reset) {
        viewport.scrollLeft = offsetX + width * scale / 2 - inset.left - room().width / 2;
        viewport.scrollTop = 0;
      }
      markSelection();
      if (focused && buttons.has(focused)) buttons.get(focused).focus({ preventScroll: true });
      const hasVisibleOpen = visible.some(node => node.children.size && !folded.has(node.key) && node.depth >= 2);
      collapseButton.disabled = !hasVisibleOpen;
      expandButton.disabled = folded.size === 0 || visible.length === 0;
      for (const control of [less, more, percent, fitButton]) control.disabled = !visible.length;
    }

    function update({ fish = [], selected: nextSelected, reset = false }) {
      const signature = fish.map(f => f.id).join('|');
      selected = nextSelected || '';
      if (signature === fishIds && !reset && visible.length) { markSelection(); return; }
      if (signature !== fishIds || reset) {
        tree = makeTaxonomy(fish);
        fishIds = signature;
        if (fish.length > 12) foldBelowClass(true); else folded.clear();
      }
      paint({ reset: true });
    }

    function setScale(value) {
      if (!visible.length) return;
      autoScale = false;
      const centerX = inset.left + room().width / 2;
      const centerY = inset.top + room().height / 2;
      const midX = (viewport.scrollLeft + centerX - offsetX) / scale;
      const midY = (viewport.scrollTop + centerY - offsetY) / scale;
      scale = Math.max(.01, Math.min(2.5, value));
      sizeCanvas();
      viewport.scrollLeft = offsetX + midX * scale - centerX;
      viewport.scrollTop = offsetY + midY * scale - centerY;
    }

    function fit() {
      if (!visible.length) return;
      setScale(fittedScale(maxScale));
      viewport.scrollTo(0, 0);
    }

    function zoomBy(factor) { if (Number.isFinite(factor) && factor > 0) setScale(scale * factor); }
    function refit() { paint({ reset: autoScale }); }
    function overview() { foldBelowClass(); paint({ reset: true }); }
    function expandAll() { folded.clear(); paint({ reset: true }); }

    function locate(id) {
      const leaf = tree.byFish.get(id);
      if (!leaf || !viewport.clientWidth) return false;
      selected = id;
      let parent = leaf.parent;
      while (parent) { folded.delete(parent.key); parent = parent.parent; }
      scale = Math.max(1, scale);
      autoScale = false;
      paint();
      viewport.scrollLeft = offsetX + leaf.x * scale - inset.left - room().width / 2;
      viewport.scrollTop = offsetY + leaf.y * scale - viewport.clientHeight + inset.bottom + 68;
      return true;
    }

    stage.addEventListener('click', event => {
      const control = event.target.closest('button[data-tree-key]');
      if (!control) return;
      const node = tree.byKey.get(control.dataset.treeKey);
      if (node.fish) {
        selected = node.fish.id;
        markSelection();
        options.onSelect?.(selected);
      } else {
        if (folded.has(node.key)) {
          let only = node;
          while (only && !only.fish) {
            folded.delete(only.key);
            only = only.children.size === 1 ? only.children.values().next().value : null;
          }
        } else folded.add(node.key);
        paint({ anchor: node.key });
      }
    });

    let drag = null;
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
      drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('tv-grabbing');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag) return;
      viewport.scrollLeft = drag.left + drag.x - event.clientX;
      viewport.scrollTop = drag.top + drag.y - event.clientY;
    });
    function release() { drag = null; viewport.classList.remove('tv-grabbing'); }
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('lostpointercapture', release);
    viewport.addEventListener('scroll', alignRanks, { passive: true });

    const observer = new ResizeObserver(() => {
      const measured = viewport.clientWidth;
      const outer = container.clientWidth;
      if (!measured || !outer) {
        lastViewportWidth = 0;
        lastContainerWidth = 0;
        return;
      }
      if (lastViewportWidth === measured && outer === lastContainerWidth) return;
      lastViewportWidth = measured;
      lastContainerWidth = outer;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => paint({ reset: autoScale }));
    });
    observer.observe(container);
    observer.observe(viewport);
    return { update, fit, zoomBy, overview, expandAll, locate, refit };
  }

  window.createAtlasTree = createAtlasTree;
})();
