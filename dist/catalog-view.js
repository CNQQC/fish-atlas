(function () {
  'use strict';

  const PAGE_SIZE = 15;
  const openingSelection = ['whale', 'clown', 'carp', 'manta', 'betta', 'seahorse', 'fw_sockeye', 'neontetra'];
  const habitatNames = { fresh: '淡水', marine: '海水', migrate: '洄游' };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, label) {
    const node = element('button', className, label);
    node.type = 'button';
    return node;
  }

  function orderForFullCatalog(fishes) {
    const byId = new Map(fishes.map(fish => [fish.id, fish]));
    const opening = openingSelection.map(id => byId.get(id)).filter(Boolean);
    return opening.concat(fishes.filter(fish => !openingSelection.includes(fish.id)));
  }

  function speciesCard(fish, isLead, displayName, openProfile) {
    const photo = window.FISH_PHOTOS[fish.id];
    const profile = window.FISH_PROFILES[fish.id];
    const family = window.FISH_TAXONOMY[fish.id].family.name;
    const waters = fish.habitats.map(value => habitatNames[value]).filter(Boolean);
    const title = displayName(fish);
    const card = button('fc-card' + (isLead ? ' fc-card-lead' : ''));
    card.dataset.catalogFish = fish.id;
    card.setAttribute('aria-label', '查看' + title + '的物种档案');
    card.addEventListener('click', () => openProfile(fish.id));

    const frame = element('span', 'fc-frame');
    const image = element('img', 'fc-photo');
    image.src = photo.file.startsWith('assets/') ? photo.file : 'assets/' + photo.file;
    image.alt = (photo.photoSpecies || fish.latin) + ' 真实照片';
    image.loading = isLead ? 'eager' : 'lazy';
    image.decoding = 'async';
    frame.append(image);

    const info = element('span', 'fc-info');
    const classification = element('span', 'fc-classification', [family, waters.join(' / ')].filter(Boolean).join(' · '));
    const nameRow = element('span', 'fc-name-row');
    const direction = element('span', 'fc-open', '→');
    direction.setAttribute('aria-hidden', 'true');
    nameRow.append(element('strong', 'fc-name', title), direction);
    const cue = profile.recognition[0] || fish.feature;
    info.append(classification, nameRow, element('i', 'fc-latin', fish.latin), element('span', 'fc-cue', cue));
    card.append(frame, info);
    return card;
  }

  window.createAtlasCatalog = function createAtlasCatalog(container, options) {
    const displayName = options.name;
    const openProfile = options.onOpen;
    const totalSpecies = window.FISH_DATA.length;
    let matches = [];
    let currentPage = 1;
    let fullCatalog = false;

    container.classList.add('fish-catalog');
    const toolbar = element('div', 'fc-toolbar');
    const summary = element('div', 'fc-summary');
    const count = element('strong', 'fc-total');
    const range = element('span', 'fc-range');
    summary.setAttribute('aria-live', 'polite');
    summary.setAttribute('aria-atomic', 'true');
    summary.append(count, range);

    const pager = element('nav', 'fc-pager');
    pager.setAttribute('aria-label', '鱼种图鉴分页');
    const previous = button('fc-page-turn', '← 上一页');
    previous.setAttribute('aria-label', '上一页');
    const next = button('fc-page-turn', '下一页 →');
    next.setAttribute('aria-label', '下一页');
    const numberedPages = element('span', 'fc-page-numbers');
    pager.append(previous, numberedPages, next);
    toolbar.append(summary, pager);

    const grid = element('div', 'fc-grid');
    grid.setAttribute('aria-label', '鱼种照片');
    const empty = element('div', 'fc-empty');
    empty.append(
      element('h3', '', '没有找到匹配的鱼种'),
      element('p', '', '可以换用较短的鱼名或学名，也可以调整水域筛选。')
    );
    empty.hidden = true;
    container.replaceChildren(toolbar, grid, empty);

    function pageCount() {
      return Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    }

    function renderPage(page) {
      currentPage = Math.max(1, Math.min(page, pageCount()));
      const start = (currentPage - 1) * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, matches.length);
      const hasLead = fullCatalog && currentPage === 1;
      grid.classList.toggle('fc-with-lead', hasLead);
      grid.hidden = matches.length === 0;
      empty.hidden = matches.length !== 0;
      count.textContent = matches.length + ' 种鱼';
      range.textContent = pageCount() > 1 ? '显示第 ' + (start + 1) + '–' + end + ' 种' : '';
      pager.hidden = pageCount() <= 1;
      previous.disabled = currentPage === 1;
      next.disabled = currentPage === pageCount();
      const totalPages = pageCount();
      const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
        .filter(page => totalPages <= 7 || page === 1 || page === totalPages ||
          Math.abs(page - currentPage) <= 1 ||
          (currentPage <= 3 && page <= 4) || (currentPage >= totalPages - 2 && page >= totalPages - 3));
      const pageControls = [];
      let previousPage = 0;
      for (const page of visiblePages) {
        if (previousPage && page - previousPage > 1) {
          const gap = element('span', 'fc-page-gap', '…');
          gap.setAttribute('aria-hidden', 'true');
          pageControls.push(gap);
        }
        const pageButton = button('fc-page', String(page));
        pageButton.dataset.page = String(page);
        pageButton.setAttribute('aria-label', '前往第 ' + page + ' 页');
        if (page === currentPage) pageButton.setAttribute('aria-current', 'page');
        pageControls.push(pageButton);
        previousPage = page;
      }
      numberedPages.replaceChildren(...pageControls);
      const cards = matches.slice(start, end).map((fish, index) => {
        return speciesCard(fish, hasLead && index === 0, displayName, openProfile);
      });
      grid.replaceChildren(...cards);
    }

    previous.addEventListener('click', () => renderPage(currentPage - 1));
    next.addEventListener('click', () => renderPage(currentPage + 1));
    numberedPages.addEventListener('click', event => {
      const target = event.target.closest('button[data-page]');
      if (target) renderPage(Number(target.dataset.page));
    });

    function update(fishArray, resetPage = true) {
      fullCatalog = fishArray.length === totalSpecies;
      matches = fullCatalog ? orderForFullCatalog(fishArray) : fishArray.slice();
      renderPage(resetPage ? 1 : currentPage);
    }

    return { update };
  };
})();
