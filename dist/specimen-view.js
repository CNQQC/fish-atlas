(() => {
  'use strict';

  const ranks = [
    ['kingdom', '界'], ['phylum', '门'], ['class', '纲'], ['order', '目'],
    ['family', '科'], ['genus', '属'], ['species', '种']
  ];
  const habitats = {fresh: '淡水', marine: '海水', migrate: '海淡水洄游'};
  const tabs = [
    ['recognition', '辨认特征'], ['life', '生活习性'],
    ['taxonomy', '七级分类'], ['references', '资料来源']
  ];
  const symbols = {
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m10 7h-3M12 22v-3M2 12h3"/>'
  };

  function icon(key) {
    return `<svg class="sp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[key]}</svg>`;
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }
  function link(url, text) {
    if (!/^https?:\/\//i.test(url || '')) return escape(text);
    return `<a class="sp-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(text)}<span aria-hidden="true"> ↗</span></a>`;
  }
  function simpleText(text) {
    return String(text || '').replace(/[\s，。；、：！？·,.!?;:]/g, '');
  }
  function factList(rows) {
    const content = rows.filter(([, value]) => value).map(([label, value]) => `
      <div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
    return `<dl class="sp-facts">${content}</dl>`;
  }
  function section(title, content) {
    return `<section class="sp-section"><h3>${escape(title)}</h3>${content}</section>`;
  }
  function closeButton(label) {
    return `<button type="button" class="sp-close" data-sp-action="close" aria-label="${escape(label)}">${icon('close')}</button>`;
  }

  window.createSpecimenView = function createSpecimenView(container, options = {}) {
    const fishList = window.FISH_DATA;
    const byId = new Map(fishList.map(fish => [fish.id, fish]));
    const taxonomy = window.FISH_TAXONOMY;
    const profiles = window.FISH_PROFILES;
    const photos = window.FISH_PHOTOS;
    const displayName = options.name || (fish => fish.name);
    let current;
    let activeTab = 'recognition';
    const unique = `specimen-${++instanceCounter}`;

    function createDialog(kind, label) {
      const dialog = document.createElement('dialog');
      dialog.className = `sp-dialog sp-${kind}-dialog`;
      dialog.setAttribute('aria-label', label);
      document.body.append(dialog);
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
      return dialog;
    }
    const record = createDialog('record', '鱼类完整档案');
    const lightbox = createDialog('image', '鱼类真实照片');
    const sourceBook = createDialog('sources', '资料与图片来源');

    function fishImage(fish, className) {
      const photo = photos[fish.id];
      const file = photo.file.startsWith('assets/') ? photo.file : `assets/${photo.file}`;
      const alt = `${displayName(fish)}照片，${photo.photoSpecies || fish.latin}`;
      return `<img class="${className}" src="${escape(file)}" alt="${escape(alt)}" decoding="async">`;
    }
    function waterText(fish) {
      return (fish.habitats || []).map(value => habitats[value] || value).join(' / ');
    }
    function isGenusPhoto(fish) {
      return /\bsp\./i.test(photos[fish.id].photoSpecies || '');
    }
    function photoButton(fish, className) {
      return `<button class="sp-image-button ${className}" type="button" data-sp-action="enlarge" aria-label="放大${escape(displayName(fish))}照片">
        ${fishImage(fish, 'sp-photo')}<span class="sp-expand">${icon('expand')}</span>
      </button>`;
    }
    function photoCredits(fish) {
      const p = photos[fish.id];
      const links = [[p.sourceCommons, '共享资源文件页'], [p.observationSource, '原始观测记录'], [p.originalUrl, '来源图片'], [p.downloadUrl, '图片文件']];
      const seen = new Set([p.source]);
      const originals = [];
      for (const [url, label] of links) {
        if (url && !seen.has(url)) originals.push(link(url, label));
        seen.add(url);
      }
      const imageInfo = factList([['图片题名', p.subject], ['记录学名', p.photoSpecies], ['原始说明', p.description]]);
      return `<div class="sp-credits"><div class="sp-credit-links">${link(p.source, '照片原始页面')}<span>·</span>${link(p.licenseUrl, p.license)}</div>
        <p>摄影 / ${escape(p.author)}</p>${p.note ? `<p>${escape(p.note)}</p>` : ''}${p.changes ? `<p>${escape(p.changes)}</p>` : ''}
        <details class="sp-image-info"><summary>查看照片记录</summary>${imageInfo}<div class="sp-credit-links">${originals.join('')}</div></details></div>`;
    }
    function select(fish) {
      if (!fish || !byId.has(fish.id)) return;
      const changed = current?.id !== fish.id;
      current = fish;
      if (!changed && container.firstElementChild) return;
      const t = taxonomy[fish.id];
      const traits = profiles[fish.id].recognition.slice(0, 2);
      container.innerHTML = `<article class="sp-quick" aria-label="${escape(displayName(fish))}快览">
        <div class="sp-quick-media">${photoButton(fish, 'sp-quick-photo')}<span class="sp-selected-label">${isGenusPhoto(fish) ? '同属代表照' : '当前物种'}</span></div>
        <div class="sp-quick-body">
          <div class="sp-quick-lineage"><span>${escape(t.class.name)}</span><span aria-hidden="true">/</span><span>${escape(t.family.name)}</span></div>
          <div class="sp-name-line"><h2>${escape(displayName(fish))}</h2><span class="sp-water">${escape(waterText(fish))}</span></div>
          <p class="sp-latin" lang="la">${escape(fish.latin)}</p>
          <div class="sp-field-notes"><h3>辨认要点</h3><ul>${traits.map(trait => `<li>${escape(trait)}</li>`).join('')}</ul></div>
          <button type="button" class="sp-primary" data-sp-action="open">查看完整档案 ${icon('arrow')}</button>
        </div></article>`;
    }
    function photoPane(fish) {
      const profile = profiles[fish.id];
      const formalName = displayName(fish) !== fish.name ? `<p class="sp-formal">${escape(fish.name)}</p>` : '';
      return `<aside class="sp-dossier">
        ${photoButton(fish, 'sp-dossier-photo')}
        <div class="sp-shot-credit">${link(photos[fish.id].source, `摄影 / ${photos[fish.id].author}`)}</div>
        <div class="sp-dossier-main"><div class="sp-dossier-categories">${escape(taxonomy[fish.id].family.name)}<span> · </span>${escape(waterText(fish))}</div>
          <h2>${escape(displayName(fish))}</h2>${formalName}<p class="sp-latin" lang="la">${escape(fish.latin)}</p>
          ${factList([['体型参考', profile.size]])}
          ${isGenusPhoto(fish) ? `<p class="sp-annotation">${escape(photos[fish.id].note)}</p>` : ''}
          <button class="sp-locate" type="button" data-sp-action="locate">${icon('locate')}在树中定位</button>
        </div></aside>`;
    }
    function relatedSpecies(fish) {
      const family = taxonomy[fish.id].family.latin;
      const peers = fishList.filter(peer => peer.id !== fish.id && taxonomy[peer.id].family.latin === family);
      if (!peers.length) return '';
      return section('图谱中的同科鱼', `<div class="sp-peers">${peers.map(peer => `<button type="button" class="sp-peer" data-sp-action="peer" data-sp-id="${escape(peer.id)}">${escape(displayName(peer))}</button>`).join('')}</div>`);
    }
    function references(fish) {
      const t = taxonomy[fish.id];
      const p = profiles[fish.id];
      const extended = (p.sources || []).map(source => `<li>${link(source.url, source.label)}</li>`).join('');
      return section('分类与物种资料', `<ul class="sp-reference-list"><li>${link(t.source, '七级分类记录')}</li><li>${link(fish.source, '物种资料页')}</li></ul>`) +
        section('科普资料', `<ul class="sp-reference-list">${extended}</ul>`) + section('照片与许可', photoCredits(fish));
    }
    function tabContent(fish) {
      const p = profiles[fish.id];
      const t = taxonomy[fish.id];
      if (activeTab === 'taxonomy') {
        const path = fish.path?.join(' › ');
        const rankedPath = ranks.map(([key]) => t[key].name).join(' › ');
        const names = factList([['所属类群', fish.group], ['其他检索名', fish.aliases], ['类群位置', path !== rankedPath ? path : '']]);
        return section('分类位置', `<ol class="sp-lineage">${ranks.map(([key, rank]) => `<li><span class="sp-rank">${rank}</span><strong>${escape(t[key].name)}</strong><i lang="la">${escape(t[key].latin)}</i></li>`).join('')}</ol>${t.note ? `<p class="sp-annotation">${escape(t.note)}</p>` : ''}`) +
          relatedSpecies(fish) + section('名称与类群', names) + `<p class="sp-reference-foot">${link(t.source, '查看原始分类记录')}</p>`;
      }
      if (activeTab === 'life') {
        return section('生活水域', factList([['自然分布', p.range], ['栖息环境', fish.habitat]])) +
          section('生活史', factList([['食物', fish.diet], ['日常活动', p.behavior], ['繁殖生长', p.reproduction]]));
      }
      if (activeTab === 'references') return references(fish);
      const cues = p.recognition || [];
      const extra = simpleText(fish.feature) !== simpleText(cues.join('')) ? `<p class="sp-lede">${escape(fish.feature)}</p>` : '';
      const lookalike = p.lookalike ? section('相似鱼辨别', `<p>${escape(p.lookalike)}</p>`) : '';
      const myth = fish.myth && simpleText(fish.myth) !== simpleText(p.lookalike) ? section('容易混淆的地方', `<p>${escape(fish.myth)}</p>`) : '';
      return section('辨认要点', extra + `<ul class="sp-cues">${cues.map(cue => `<li>${escape(cue)}</li>`).join('')}</ul>`) + lookalike + myth;
    }
    function renderTab() {
      record.querySelectorAll('[role="tab"]').forEach(button => {
        const active = button.dataset.spTab === activeTab;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      const pane = record.querySelector('.sp-pane');
      pane.setAttribute('aria-labelledby', `${unique}-tab-${activeTab}`);
      pane.innerHTML = tabContent(current);
      pane.scrollTop = 0;
    }
    function renderRecord() {
      record.setAttribute('aria-label', `${displayName(current)}的鱼类档案`);
      record.innerHTML = `<div class="sp-dialog-header"><span>物种档案</span>${closeButton('关闭档案')}</div>
        <div class="sp-record-layout">${photoPane(current)}<div class="sp-reading">
          <div class="sp-tabs" role="tablist" aria-label="物种资料分类">${tabs.map(([key, label]) => `<button type="button" id="${unique}-tab-${key}" role="tab" aria-controls="${unique}-pane" data-sp-tab="${key}">${label}</button>`).join('')}</div>
          <div class="sp-pane" id="${unique}-pane" role="tabpanel" tabindex="0"></div></div></div>`;
      renderTab();
    }
    function open(fish) {
      if (!fish || !byId.has(fish.id)) return;
      select(fish);
      activeTab = 'recognition';
      renderRecord();
      if (!record.open) record.showModal();
      record.querySelector('[aria-selected="true"]').focus({preventScroll:true});
    }
    function enlarge() {
      lightbox.setAttribute('aria-label', `${displayName(current)}照片`);
      lightbox.innerHTML = `<div class="sp-dialog-header"><span>${escape(displayName(current))}<i lang="la">${escape(current.latin)}</i></span>${closeButton('关闭大图')}</div>
        <div class="sp-original">${fishImage(current, 'sp-full-photo')}</div><div class="sp-image-caption">${photoCredits(current)}</div>`;
      if (!lightbox.open) lightbox.showModal();
    }
    function renderSourceEntries(term = '') {
      const query = term.trim().toLocaleLowerCase();
      const found = fishList.filter(fish => `${displayName(fish)} ${fish.name} ${fish.latin} ${fish.aliases || ''}`.toLocaleLowerCase().includes(query));
      sourceBook.querySelector('.sp-source-count').textContent = `${found.length} 种`;
      sourceBook.querySelector('.sp-source-list').innerHTML = found.length ? found.map(fish => `
        <details class="sp-source-entry"><summary><span><strong>${escape(displayName(fish))}</strong><i lang="la">${escape(fish.latin)}</i></span><span class="sp-disclosure" aria-hidden="true">⌄</span></summary>
          <div class="sp-source-entry-body">${references(fish)}</div></details>`).join('') : '<p class="sp-no-match">没有匹配的鱼种。</p>';
    }
    function sources() {
      sourceBook.innerHTML = `<div class="sp-dialog-header"><h2>资料与图片来源</h2>${closeButton('关闭来源')}</div>
        <div class="sp-source-shell"><p class="sp-method">七级分类采用 WoRMS 收录的 FishBase 分类记录，省略中间阶元。照片的摄影者、许可和处理说明可按鱼种查看。</p>
          <div class="sp-source-tools"><label><span>查找来源</span><input type="search" placeholder="鱼名、别名或学名" autocomplete="off"></label><span class="sp-source-count" aria-live="polite"></span></div>
          <div class="sp-source-list"></div></div>`;
      renderSourceEntries();
      if (!sourceBook.open) sourceBook.showModal();
      const input = sourceBook.querySelector('input');
      input.addEventListener('input', () => renderSourceEntries(input.value));
      input.focus({preventScroll:true});
    }
    function handleAction(event) {
      const button = event.target.closest('button[data-sp-action],button[data-sp-tab]');
      if (!button) return;
      if (button.dataset.spTab) {
        activeTab = button.dataset.spTab;
        renderTab();
        return;
      }
      switch (button.dataset.spAction) {
        case 'open': open(current); break;
        case 'close': button.closest('dialog').close(); break;
        case 'locate': record.close(); options.onLocate?.(current.id); break;
        case 'enlarge': enlarge(); break;
        case 'peer': {
          const next = byId.get(button.dataset.spId);
          if (!next) return;
          options.onSelect?.(next.id);
          select(next);
          renderRecord();
          record.querySelector('[aria-selected="true"]').focus({preventScroll:true});
          break;
        }
      }
    }
    for (const area of [container, record, lightbox, sourceBook]) area.addEventListener('click', handleAction);
    record.addEventListener('keydown', event => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab || !['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
      const index = tabs.findIndex(([key]) => key === tab.dataset.spTab);
      const count = tabs.length;
      const destination = {ArrowRight:(index+1)%count, ArrowLeft:(index+count-1)%count, Home:0, End:count-1};
      event.preventDefault();
      activeTab = tabs[destination[event.key]][0];
      renderTab();
      record.querySelector('[aria-selected="true"]').focus();
    });
    return {select, open, sources};
  };
  let instanceCounter = 0;
})();
