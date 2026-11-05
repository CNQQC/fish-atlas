(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const fish = window.FISH_DATA;
  const taxonomy = window.FISH_TAXONOMY;
  const profiles = window.FISH_PROFILES;
  const photos = window.FISH_PHOTOS;
  const fishById = new Map(fish.map(item => [item.id, item]));
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  const commonNames = {
    clown:'小丑鱼', coelacanth:'腔棘鱼', tuna:'蓝鳍金枪鱼', hairtail:'带鱼',
    tilapia:'罗非鱼', bass:'大口黑鲈', turbot:'多宝鱼', oscar:'地图鱼',
    discus:'七彩神仙鱼', angelfish:'神仙鱼', neontetra:'红绿灯鱼', flyingfish:'飞鱼',
    fw_pangasius:'巴沙鱼', fw_chinook:'帝王鲑', fw_sockeye:'红鲑',
    aq_piranha:'红腹食人鱼', aq_pacu:'淡水白鲳', aq_silverarowana:'银龙鱼',
    aq_platy:'月光鱼', aq_molly:'黑玛丽', aq_whitecloud:'白云金丝', aq_tigerbarb:'虎皮鱼',
    aq_gourami:'蓝曼龙', aq_dwarfgourami:'丽丽鱼', aq_clownloach:'皇冠泥鳅',
    aq_balashark:'银鲨', aq_tigershark:'虎鲨'
  };
  const name = item => commonNames[item.id] || item.name;
  const photograph = id => 'assets/' + photos[id].file.replace(/^assets\//, '');
  const presets = [
    { key:'compare', label:'鲨与鲤', ids:['whale','white','carp','crucian'] },
    { key:'rays', label:'鲨与鳐', ids:['manta','white','aq_hammerhead','aq_tigershark'] },
    { key:'salmonids', label:'鲑与鳟', ids:['trout','salmon','fw_sockeye','fw_brook'] },
    { key:'starter', label:'常见鲤科鱼', ids:['carp','crucian','grass','silver','bighead','blackcarp','bream','zebra'] }
  ];
  const waters = new Map([['all','全部水域'],['marine','海水'],['fresh','淡水'],['migrate','海淡水洄游']]);
  const latestCollection = fish.slice().reverse().find(item => item.collection)?.collection;
  const addedFish = fish.filter(item => latestCollection && item.collection === latestCollection);
  const state = { view:'tree', scope:'compare', selected:'whale', query:'', water:'all', recent:false };
  const input = byId('search');
  const popup = byId('search-popup');
  let suggestions = [];
  let activeSuggestion = -1;

  function normalized(text) {
    return String(text || '').normalize('NFKC').trim().toLowerCase();
  }

  const searchIndex = new Map(fish.map(item => {
    const groups = ranks.map(rank => taxonomy[item.id][rank]);
    const terms = [name(item), item.name, item.latin, item.aliases, profiles[item.id].range];
    groups.forEach(group => terms.push(group.name, group.latin));
    return [item.id, normalized(terms.join(' '))];
  }));

  function matches(query) {
    const tokens = normalized(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return fish;
    const rank = item => {
      const names = [name(item), item.name, item.latin].map(normalized);
      if (names.includes(normalized(query))) return 0;
      return names.some(value => value.startsWith(normalized(query))) ? 1 : 2;
    };
    return fish.filter(item => tokens.every(token => searchIndex.get(item.id).includes(token)))
      .sort((a, b) => rank(a) - rank(b));
  }

  function branchItems(scope) {
    const preset = presets.find(item => item.key === scope);
    if (preset) return preset.ids.map(id => fishById.get(id));
    if (scope === 'all') return fish;
    if (scope === 'recent') return addedFish;
    const separator = scope.indexOf(':');
    const rank = scope.slice(0, separator);
    const latin = scope.slice(separator + 1);
    return ranks.includes(rank) ? fish.filter(item => taxonomy[item.id][rank].latin === latin) : [];
  }

  function branchLabel(scope) {
    const preset = presets.find(item => item.key === scope);
    if (preset) return preset.label;
    if (scope === 'all') return '全部鱼类';
    if (scope === 'recent') return '本次新增鱼类';
    const item = branchItems(scope)[0];
    return item ? taxonomy[item.id][scope.split(':')[0]].name : '分类树';
  }

  const tree = window.createAtlasTree(byId('atlas-tree'), { name, onSelect: selectInTree });
  const specimen = window.createSpecimenView(byId('specimen-panel'), { name, onSelect: selectFromProfile, onLocate: locateFish });
  const catalog = window.createAtlasCatalog(byId('atlas-catalog'), { name, onOpen: openProfile });

  function saveLocation(push = false) {
    const url = new URL(window.location.href);
    url.hash = state.view === 'tree' ? 'graph' : 'catalog';
    url.searchParams.set('fish', state.selected);
    url.searchParams.set('scope', state.scope);
    url.searchParams.delete('view');
    url.searchParams.delete('q');
    url.searchParams.delete('water');
    url.searchParams.delete('batch');
    if (state.view === 'catalog') {
      if (state.query) url.searchParams.set('q', state.query);
      if (state.water !== 'all') url.searchParams.set('water', state.water);
      if (state.recent) url.searchParams.set('batch','latest');
    }
    try {
      if (push) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    } catch { /* Browsers may restrict history on a local offline copy. */ }
  }

  function readLocation() {
    const url = new URL(window.location.href);
    state.view = url.hash === '#catalog' ? 'catalog' : 'tree';
    const selected = url.searchParams.get('fish');
    state.selected = fishById.has(selected) ? selected : 'whale';
    const requested = url.searchParams.get('scope');
    state.scope = requested && branchItems(requested).length ? requested : 'compare';
    if (state.view === 'tree' && !branchItems(state.scope).some(item => item.id === state.selected)) {
      if (selected && !requested) state.scope = 'family:' + taxonomy[state.selected].family.latin;
      else state.selected = branchItems(state.scope)[0].id;
    }
    state.query = state.view === 'catalog' ? url.searchParams.get('q') || '' : '';
    const water = url.searchParams.get('water');
    state.water = waters.has(water) ? water : 'all';
    state.recent = state.view === 'catalog' && url.searchParams.get('batch') === 'latest';
    input.value = state.query;
    closeSuggestions();
    renderScreen();
  }

  function renderTree(reset = false) {
    const items = branchItems(state.scope);
    byId('branch-title').textContent = branchLabel(state.scope);
    byId('branch-count').textContent = items.length + ' 种';
    byId('scope').value = [...byId('scope').options].some(option => option.value === state.scope) ? state.scope : '';
    tree.update({fish:items, selected:state.selected, reset});
    specimen.select(fishById.get(state.selected));
  }

  function renderCatalog() {
    const items = matches(state.query).filter(item =>
      (!state.recent || item.collection === latestCollection) &&
      (state.water === 'all' || item.habitats.includes(state.water))
    );
    byId('recent-only').checked = state.recent;
    catalog.update(items, true);
    byId('catalog-query').textContent = state.query ? '搜索 “' + state.query + '”' : '';
    byId('water-filters').querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.water === state.water));
    });
  }

  function renderScreen() {
    const isTree = state.view === 'tree';
    document.body.dataset.view = state.view;
    byId('tree-screen').hidden = !isTree;
    byId('catalog-screen').hidden = isTree;
    for (const [id, active] of [['nav-tree',isTree],['nav-catalog',!isTree]]) {
      if (active) byId(id).setAttribute('aria-current','page');
      else byId(id).removeAttribute('aria-current');
    }
    byId('page-title').textContent = isTree ? '鱼类分类图谱' : '鱼类照片图鉴';
    byId('page-lede').textContent = isTree ? '沿分支从界读到种，比较鱼类的分类位置。' : '从真实照片辨认鱼类，点开照片查阅物种档案。';
    syncSearchControls();
    if (isTree) renderTree(true);
    else renderCatalog();
  }

  function go(view) {
    const changed = state.view !== view;
    state.view = view;
    const changeScope = view === 'tree' && !branchItems(state.scope).some(item => item.id === state.selected);
    if (changeScope) state.scope = 'family:' + taxonomy[state.selected].family.latin;
    state.query = '';
    input.value = '';
    closeSuggestions();
    renderScreen();
    if (changeScope) tree.locate(state.selected);
    saveLocation(changed);
    window.scrollTo(0,0);
  }

  function changeBranch(scope) {
    const items = branchItems(scope);
    if (!items.length) return;
    state.scope = scope;
    if (!items.some(item => item.id === state.selected)) state.selected = items[0].id;
    input.value = '';
    closeSuggestions();
    syncSearchControls();
    renderTree(true);
    saveLocation();
  }

  function selectInTree(id) {
    if (!fishById.has(id)) return;
    state.selected = id;
    renderTree(false);
    saveLocation();
  }

  function selectFromProfile(id) {
    if (!fishById.has(id)) return;
    state.selected = id;
    if (state.view === 'tree') {
      if (!branchItems(state.scope).some(item => item.id === id)) state.scope = 'family:' + taxonomy[id].family.latin;
      renderTree(false);
    }
    saveLocation();
  }

  function openProfile(id) {
    if (!fishById.has(id)) return;
    state.selected = id;
    specimen.open(fishById.get(id));
    saveLocation();
  }

  function locateFish(id) {
    if (!fishById.has(id)) return;
    const changed = state.view !== 'tree';
    state.view = 'tree';
    state.selected = id;
    state.scope = 'family:' + taxonomy[id].family.latin;
    state.query = '';
    input.value = '';
    closeSuggestions();
    renderScreen();
    tree.locate(id);
    saveLocation(changed);
    window.scrollTo(0,0);
  }

  function syncSearchControls() {
    byId('search-clear').hidden = !input.value;
    byId('search-shortcut').hidden = Boolean(input.value);
  }

  function closeSuggestions() {
    popup.hidden = true;
    activeSuggestion = -1;
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
  }

  function showSuggestions() {
    syncSearchControls();
    const query = input.value.trim();
    if (!query || state.view === 'catalog') {
      closeSuggestions();
      if (state.view === 'catalog') {
        state.query = query;
        renderCatalog();
        saveLocation();
      }
      return;
    }
    const found = matches(query);
    suggestions = found.slice(0,6);
    activeSuggestion = -1;
    const results = byId('search-results');
    results.replaceChildren();
    for (const [index, item] of suggestions.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'search-option';
      option.id = 'match-' + index;
      option.setAttribute('role','option');
      option.setAttribute('aria-selected','false');
      const photo = new Image();
      photo.src = photograph(item.id);
      photo.alt = '';
      const label = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = name(item);
      const latin = document.createElement('i');
      latin.textContent = item.latin;
      label.append(title,latin);
      const family = document.createElement('small');
      family.textContent = taxonomy[item.id].family.name;
      option.append(photo,label,family);
      option.addEventListener('click',()=>locateFish(item.id));
      results.append(option);
    }
    if (!found.length) {
      const noMatch = document.createElement('div');
      noMatch.className = 'search-none';
      noMatch.textContent = '没有匹配结果，试试鱼的俗名或学名。';
      results.append(noMatch);
    }
    byId('all-results').hidden = !found.length;
    byId('all-results').textContent = '在照片图鉴中查看全部 ' + found.length + ' 个结果 →';
    popup.hidden = false;
    input.setAttribute('aria-expanded','true');
  }

  function openSearchResults() {
    state.query = input.value.trim();
    state.view = 'catalog';
    state.water = 'all';
    state.recent = false;
    closeSuggestions();
    renderScreen();
    saveLocation(true);
  }

  function prepareControls() {
    const scope = byId('scope');
    scope.add(new Option('切换分类分支',''));
    scope.add(new Option('全部鱼类（' + fish.length + ' 种）','all'));
    scope.add(new Option('本次新增（' + addedFish.length + ' 种）','recent'));
    scope.add(new Option('鲤科全部代表种','family:Cyprinidae'));
    for (const rank of ['class','order']) {
      const group = document.createElement('optgroup');
      group.label = rank === 'class' ? '按纲浏览' : '按目浏览';
      const unique = new Map(fish.map(item => [taxonomy[item.id][rank].latin,taxonomy[item.id][rank]]));
      for (const taxon of unique.values()) group.append(new Option(taxon.name + ' · ' + taxon.latin,rank + ':' + taxon.latin));
      scope.append(group);
    }
    scope.addEventListener('change',()=>{ if (scope.value) changeBranch(scope.value); });
    for (const [value,label] of waters) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.water = value;
      button.textContent = label;
      button.addEventListener('click',()=>{state.water=value;renderCatalog();saveLocation();});
      byId('water-filters').append(button);
    }
    byId('total-count').textContent = fish.length;
    byId('recent-count').textContent = addedFish.length;
    byId('recent-only').addEventListener('change',event=>{state.recent=event.target.checked;renderCatalog();saveLocation();});
    byId('nav-tree').addEventListener('click',()=>go('tree'));
    byId('nav-catalog').addEventListener('click',()=>go('catalog'));
    document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();go('tree');});
    byId('sources-open').addEventListener('click',()=>specimen.sources());
    byId('dock-toggle').addEventListener('click',event=>{
      const collapsed = byId('tree-screen').classList.toggle('dock-collapsed');
      const label = collapsed ? '展开物种卡片' : '收起物种卡片';
      event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
      event.currentTarget.setAttribute('aria-label',label);
      event.currentTarget.title = label;
      tree.refit();
    });
    byId('all-results').addEventListener('click',openSearchResults);
    byId('search-clear').addEventListener('click',()=>{input.value='';showSuggestions();input.focus();});
    input.addEventListener('input',showSuggestions);
    input.addEventListener('focus',()=>{if(state.view==='tree' && input.value)showSuggestions();});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#search-wrap'))closeSuggestions();});
    byId('search-wrap').addEventListener('focusout',event=>{if(!event.currentTarget.contains(event.relatedTarget))closeSuggestions();});
    input.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Escape'){closeSuggestions();return;}
      if(popup.hidden)return;
      if(event.key==='Enter'){
        event.preventDefault();
        if(activeSuggestion>=0)locateFish(suggestions[activeSuggestion].id);
        else if(suggestions.length===1)locateFish(suggestions[0].id);
        else if(suggestions.length)openSearchResults();
      }
      if(!suggestions.length || !['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault();
      const offset=event.key==='ArrowDown'?1:-1;
      const position=activeSuggestion<0 && offset<0 ? 0 : activeSuggestion;
      activeSuggestion=(position+offset+suggestions.length)%suggestions.length;
      const buttons=[...byId('search-results').children];
      buttons.forEach((button,index)=>button.setAttribute('aria-selected',String(index===activeSuggestion)));
      input.setAttribute('aria-activedescendant',buttons[activeSuggestion].id);
    });
    document.addEventListener('keydown',event=>{
      if (event.key==='/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') &&
        !event.target.closest('input, textarea, select, [contenteditable="true"]')){
        event.preventDefault();input.focus();input.select();
      }
    });
    window.addEventListener('popstate',readLocation);
    window.addEventListener('hashchange',readLocation);
  }

  prepareControls();
  readLocation();
})();
