// The seven rows are taxonomic ranks. Each terminal in a layout receives one slot.
(() => {
  'use strict';

  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  const rankLabels = ['界', '门', '纲', '目', '科', '属', '种'];
  const rankNames = ['Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species'];
  // A taxon label hangs from its branch labelRise above the row center, and its
  // children leave from the knot knotDrop below it. tree-view.css places the knot
  // at the same offset (labelRise + knotDrop).
  const labelRise = 21;
  const knotDrop = 25;
  const leafHeight = 112;
  const centers = [44, 122, 200, 278, 356, 434, 551];
  const leafBottom = centers[6] + leafHeight / 2;
  const maxScale = 1.4;
  const svgNamespace = 'http://www.w3.org/2000/svg';
  // Each class takes its lineage's hue, and every branch below it keeps that hue.
  // The order follows the tree; neighbouring hues pass the palette CVD checks on the dark canvas.
  const neutralHue = '#a6bbb6';
  const lineages = [
    { label: '无颌类', color: '#9085e9', classes: ['Myxini', 'Petromyzonti'] },
    { label: '软骨鱼', color: '#dc6a43', classes: ['Elasmobranchii', 'Holocephali'] },
    { label: '真骨鱼', color: '#1da48a', classes: ['Teleostei'] },
    { label: '肉鳍鱼', color: '#c28410', classes: ['Actinistia', 'Dipnoi'] },
    { label: '原始辐鳍鱼', color: '#3d8ee6', classes: ['Cladistii', 'Chondrostei', 'Holostei'] }
  ];
  const lineageByClass = new Map(lineages.flatMap(lineage => lineage.classes.map(name => [name, lineage])));

  const rowTop = depth => centers[depth] - (depth === 6 ? leafHeight / 2 : labelRise);
  // Faint guides run between rows, halfway from one row's knots to the next row's tops.
  const bands = centers.slice(1).map((_, i) => (centers[i] + knotDrop + rowTop(i + 1)) / 2);

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
      const lineage = lineageByClass.get(record.class.latin) || null;
      let parent = null;
      let siblings = roots;
      ranks.forEach((rank, depth) => {
        const data = record[rank];
        const key = `${parent?.key || ''}/${rank}:${data.latin}`;
        let node = siblings.get(key);
        if (!node) {
          node = { key, depth, parent, data, children: new Map(), count: 0, lineage: depth >= 2 ? lineage : null };
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

  function hue(node) { return node.lineage?.color || neutralHue; }

  function nodeTop(node) { return node.fish ? node.y - leafHeight / 2 : node.y - labelRise; }

  // Close children hang from S-curves; far ones lean toward their child from the
  // knot, so a wide fan spreads out instead of stacking into one horizontal bar.
  function branch(parent, child) {
    const startY = parent.y + knotDrop;
    const endY = nodeTop(child);
    const mid = (startY + endY) / 2;
    const reach = child.x - parent.x;
    const drop = endY - startY;
    const lean = Math.min(.5, Math.max(0, (Math.abs(reach) - 2 * drop) / (8 * drop)));
    return `M ${parent.x} ${startY} C ${parent.x + reach * lean} ${mid} ${child.x} ${mid} ${child.x} ${endY}`;
  }

  function createAtlasTree(container, options = {}) {
    const displayName = options.name || (fish => fish.name);
    const root = element('div', 'tv-root');
    const plot = element('div', 'tv-plot');
    const rail = element('div', 'tv-rail');
    rail.setAttribute('aria-hidden', 'true');
    const rankTags = rankLabels.map((label, i) => {
      const tag = element('span', 'tv-rank');
      tag.append(element('b', '', label), element('small', '', rankNames[i]));
      rail.append(tag);
      return tag;
    });
    const guides = element('div', 'tv-guides');
    guides.setAttribute('aria-hidden', 'true');
    const guideLines = bands.map(() => guides.appendChild(element('span', 'tv-guide')));
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
    plot.append(rail, guides, viewport, empty);

    const footer = element('div', 'tv-footer');
    const legend = element('div', 'tv-legend');
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
    let shown = new Set();
    let width = 1;
    let height = leafBottom;
    let unit = 124;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let nodeWidth = 120;
    let inset = { top: 0, right: 0, bottom: 0, left: 0 };
    let lastViewportWidth = 0;
    let lastContainerWidth = 0;
    let autoScale = true;
    let resizeFrame = 0;
    let halos = svgElement('g', {});
    let flows = svgElement('g', {});
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

    // The selected path is redrawn brighter, over a soft halo, with light flowing toward the species.
    function markSelection() {
      const active = activePath();
      halos.replaceChildren();
      flows.replaceChildren();
      for (const node of visible) {
        const control = buttons.get(node.key);
        const isActive = active.has(node.key);
        control.classList.toggle('tv-active', isActive);
        if (node.fish) control.setAttribute('aria-pressed', String(isActive));
        const wire = wires.get(node.key);
        if (!wire) continue;
        wire.classList.toggle('tv-active', isActive);
        if (!isActive) continue;
        flows.before(wire);
        const d = wire.getAttribute('d');
        const halo = svgElement('path', { d, class: 'tv-halo', 'stroke-width': Number(wire.getAttribute('stroke-width')) + 7 });
        halo.style.setProperty('--hue', hue(node));
        halos.append(halo);
        flows.append(svgElement('path', { d, class: 'tv-flow' }));
      }
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
      return Math.min(limit, roomWidth / width, roomHeight / height);
    }

    function layout() {
      visible = [];
      const roots = [...tree.roots.values()];
      const slots = roots.reduce((total, node) => total + weigh(node), 0);
      const available = room().width || 640;
      unit = Math.min(166, Math.max(128, (available - 30) / Math.max(slots, 1)));
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
      // The canvas ends below the deepest open rank, so a folded overview sits centered.
      const deepest = Math.max(0, ...visible.map(node => node.depth));
      height = (deepest === 6 ? leafBottom : centers[deepest] + knotDrop + 12) + 26;
    }

    function createNode(node) {
      const isLeaf = Boolean(node.fish);
      const control = button(`tv-node ${isLeaf ? 'tv-leaf' : 'tv-taxon'}`, '');
      control.dataset.treeKey = node.key;
      control.style.top = `${nodeTop(node)}px`;
      // Higher taxa may use the room their whole branch spans below them.
      const span = isLeaf ? nodeWidth : Math.min(220, node.weight * unit - 14);
      control.style.left = `${node.x - span / 2}px`;
      control.style.width = `${span}px`;
      control.style.setProperty('--hue', hue(node));
      const title = isLeaf ? displayName(node.fish) : node.data.name;
      control.title = `${rankLabels[node.depth]} · ${title} · ${node.data.latin}`;
      if (isLeaf) {
        control.dataset.treeFish = node.fish.id;
        const metadata = window.FISH_PHOTOS[node.fish.id];
        const picture = element('img', 'tv-photo');
        picture.src = metadata.file.startsWith('assets/') ? metadata.file : `assets/${metadata.file}`;
        picture.alt = `${metadata.photoSpecies || title} 真实照片`;
        picture.decoding = 'async';
        picture.loading = 'lazy';
        const caption = element('span', 'tv-leaf-caption');
        caption.append(element('strong', '', title), element('i', '', node.data.latin));
        const chosen = element('span', 'tv-check', '✓');
        chosen.setAttribute('aria-hidden', 'true');
        control.append(picture, caption, chosen);
        control.setAttribute('aria-label', `查看${title}，${node.data.latin}`);
      } else {
        const name = element('span', 'tv-name');
        const count = element('span', 'tv-count', String(node.count));
        count.setAttribute('aria-hidden', 'true');
        name.append(element('strong', '', title), count);
        const label = element('span', 'tv-taxon-copy');
        label.append(name, element('i', '', node.data.latin));
        const knot = element('span', 'tv-knot');
        knot.setAttribute('aria-hidden', 'true');
        const closed = folded.has(node.key);
        control.classList.toggle('tv-folded', closed);
        control.setAttribute('aria-expanded', String(!closed));
        control.setAttribute('aria-label', `${rankLabels[node.depth]}，${title}，图中${node.count}种，${closed ? '展开' : '收起'}分支`);
        control.append(label, knot);
      }
      buttons.set(node.key, control);
      return control;
    }

    function alignRanks() {
      const shift = offsetY - viewport.scrollTop;
      rankTags.forEach((tag, i) => { tag.style.top = `${shift + centers[i] * scale}px`; });
      guideLines.forEach((line, i) => { line.style.top = `${shift + bands[i] * scale}px`; });
    }

    function sizeCanvas() {
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const outerWidth = Math.max(viewport.clientWidth, scaledWidth + inset.left + inset.right);
      const outerHeight = Math.max(viewport.clientHeight, scaledHeight + inset.top + inset.bottom);
      offsetX = inset.left + (outerWidth - inset.left - inset.right - scaledWidth) / 2;
      offsetY = inset.top + (outerHeight - inset.top - inset.bottom - scaledHeight) / 2;
      space.style.width = `${outerWidth}px`;
      space.style.height = `${outerHeight}px`;
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      stage.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
      percent.textContent = `${Math.round(scale * 100)}%`;
      alignRanks();
    }

    function paintLegend() {
      const present = new Set([...tree.byKey.values()].map(node => node.lineage));
      const keys = lineages.filter(lineage => present.has(lineage)).map(lineage => {
        const key = element('span', 'tv-key', lineage.label);
        key.style.setProperty('--hue', lineage.color);
        return key;
      });
      legend.replaceChildren(...keys);
      legend.hidden = keys.length < 2;
    }

    function paint({ reset = false, anchor } = {}) {
      const focused = stage.contains(document.activeElement) ? document.activeElement?.dataset.treeKey : null;
      const before = anchor ? tree.byKey.get(anchor) : null;
      const anchorScreen = before ? offsetX + before.x * scale - viewport.scrollLeft : null;
      readInsets();
      layout();
      buttons.clear();
      wires.clear();
      // Nodes appearing for the first time grow in, one rank after another.
      const fresh = new Set(visible.filter(node => !shown.has(node.key)));
      const firstDepth = Math.min(...[...fresh].map(node => node.depth));
      shown = new Set(visible.map(node => node.key));
      function enter(target, node, lag) {
        if (!fresh.has(node)) return;
        target.classList.add('tv-enter');
        target.style.setProperty('--delay', `${(node.depth - firstDepth) * 70 + lag}ms`);
      }
      const content = document.createDocumentFragment();
      const svg = svgElement('svg', { width, height, 'aria-hidden': 'true', class: 'tv-wires' });
      const usedRanks = new Set(visible.map(node => node.depth));
      rankTags.forEach((tag, i) => tag.classList.toggle('tv-unused', !usedRanks.has(i)));
      halos = svgElement('g', { class: 'tv-halos' });
      flows = svgElement('g', { class: 'tv-flows' });
      svg.append(halos);
      const total = visible.reduce((sum, node) => sum + (node.parent ? 0 : node.count), 0) || 1;
      visible.forEach(node => {
        if (!node.parent) return;
        const thickness = 1 + 2.4 * Math.sqrt(node.count / total);
        const wire = svgElement('path', { d: branch(node.parent, node), class: 'tv-wire', pathLength: 1, 'stroke-width': thickness.toFixed(2) });
        wire.style.setProperty('--hue', hue(node));
        enter(wire, node, 0);
        wires.set(node.key, wire);
        svg.append(wire);
      });
      svg.append(flows);
      content.append(svg);
      visible.forEach(node => {
        const control = createNode(node);
        enter(control, node, 120);
        content.append(control);
      });
      stage.replaceChildren(content);
      paintLegend();
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
        if (signature !== fishIds) shown = new Set();
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
