(function () {
  const main = document.querySelector('main');
  if (!main) return;

  const initial = main.dataset.initialTab || 'people';
  const italian = main.dataset.locale === 'it';
  const message = (english, translated) => italian ? translated : english;
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const known = tabs.map((tab) => tab.dataset.tab);

  document.querySelectorAll('[data-locale-form]').forEach((form) => {
    form.addEventListener('submit', () => {
      const destination = form.querySelector('[data-locale-return]');
      if (destination) destination.value = location.pathname + location.search + location.hash;
    });
  });

  function activate(key, { writeHistory = false } = {}) {
    const target = known.includes(key) ? key : initial;

    for (const tab of tabs) {
      const active = tab.dataset.tab === target;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('is-active', active);

      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.hidden = !active;
    }

    const tabList = document.querySelector('.tabs');
    const activeTab = tabs.find((tab) => tab.dataset.tab === target);
    if (tabList && activeTab) {
      const listBounds = tabList.getBoundingClientRect();
      const tabBounds = activeTab.getBoundingClientRect();
      if (tabBounds.left < listBounds.left) tabList.scrollLeft -= listBounds.left - tabBounds.left;
      if (tabBounds.right > listBounds.right) tabList.scrollLeft += tabBounds.right - listBounds.right;
    }

    if (location.hash.slice(1) !== target) {
      if (writeHistory) history.pushState(null, '', '#' + target);
      else history.replaceState(null, '', '#' + target);
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab, { writeHistory: true }));

    // The ARIA tabs pattern expects arrow-key navigation between tabs.
    tab.addEventListener('keydown', (event) => {
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (offset === 0) return;

      event.preventDefault();
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      next.focus();
      activate(next.dataset.tab, { writeHistory: true });
    });
  });

  // Confirm destructive submits. Driven by a data attribute so visitor names
  // are never interpolated into an inline JavaScript string.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-confirm]') : null;
    if (target && !window.confirm(target.dataset.confirm)) {
      event.preventDefault();
    }
  });

  // Filtered pickers, for option lists too long for a native select. The
  // options are already in the page, so this never hits the network.
  const MAX_SHOWN = 50;

  document.querySelectorAll('[data-picker-search]').forEach((search) => {
    const field = search.closest('.field');
    const input = field.querySelector('[data-picker-input]');
    const list = field.querySelector('[data-picker-list]');
    const status = field.querySelector('[data-picker-status]');
    const chip = field.querySelector('[data-picker-chip]');
    const chipLabel = field.querySelector('[data-picker-label]');
    if (!input || !list || !status || !chip || !chipLabel) return;

    const options = Array.from(list.querySelectorAll('[data-picker-option]'));
    const results = search.parentElement;

    function filter() {
      const query = search.value.trim().toLowerCase();
      if (query === '') {
        // Dumping hundreds of rows before anything is typed is just as
        // unusable as the select this replaces.
        for (const option of options) option.hidden = true;
        list.hidden = true;
        status.textContent = italian ? `Digita per cercare tra ${options.length} persone.` : `Type to search ${options.length} people.`;
        return;
      }

      const matches = options.filter((option) => option.dataset.label.includes(query));
      // Only the first slice is revealed, so a query that matches most of the
      // list does not dump hundreds of rows into the form.
      const shown = new Set(matches.slice(0, MAX_SHOWN));
      for (const option of options) {
        option.hidden = !shown.has(option);
      }

      if (matches.length === 0) {
        list.hidden = true;
        status.textContent = italian ? `Nessun risultato per “${search.value.trim()}”.` : `No match for "${search.value.trim()}".`;
        return;
      }

      list.hidden = false;
      status.textContent =
        matches.length > MAX_SHOWN
          ? (italian ? `Visualizzati ${MAX_SHOWN} di ${matches.length} risultati.` : `Showing ${MAX_SHOWN} of ${matches.length} matches.`)
          : (italian ? `${matches.length} risultat${matches.length === 1 ? 'o' : 'i'}.` : `${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
    }

    function choose(value, label) {
      input.value = value;
      chipLabel.textContent = label;
      chip.hidden = false;
      results.hidden = true;
    }

    function clear() {
      input.value = '';
      chip.hidden = true;
      results.hidden = false;
      search.value = '';
      filter();
      search.focus();
    }

    search.addEventListener('input', filter);
    list.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-picker-value]') : null;
      if (button) choose(button.dataset.pickerValue, button.textContent.trim());
    });
    chip.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-picker-clear]')) clear();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !results.hidden) clear();
    });

    // Prompt for a choice if nothing is selected yet, otherwise stay on the chip.
    if (input.value === '') filter();
  });

  // Suggest people already on file while the operator types a new one, so a
  // second copy of somebody is caught before it is created.
  const suggester = document.querySelector('[data-suggester]');
  if (suggester) {
    const form = suggester.parentElement.querySelector('form.entity-form');
    const nameInput = form && form.querySelector('#name');
    const surnameInput = form && form.querySelector('#surname');
    const counter = suggester.querySelector('[data-suggester-count]');
    const candidates = Array.from(suggester.querySelectorAll('[data-suggestion]'));

    const MAX_SUGGESTIONS = 10;
    const MIN_CHARS = 2;

    // Ranks how well a candidate matches what has been typed, so the closest
    // match sorts first. Returns -1 when there is no match at all.
    function rank(item, name, surname) {
      if (surname && item.dataset.surname.startsWith(surname)) return 0;
      if (surname && item.dataset.surname.includes(surname)) return 1;
      if (name && item.dataset.name.startsWith(name)) return 2;
      if (name && item.dataset.name.includes(name)) return 3;
      if (name && surname && `${item.dataset.name} ${item.dataset.surname}`.includes(`${name} ${surname}`)) return 4;
      return -1;
    }

    function refresh() {
      const name = nameInput.value.trim().toLowerCase();
      const surname = surnameInput.value.trim().toLowerCase();

      // One letter matches nearly everyone and buries the real candidate.
      if (name.length < MIN_CHARS && surname.length < MIN_CHARS) {
        suggester.hidden = true;
        return;
      }

      const scored = candidates
        .map((item, index) => ({ item, index, score: rank(item, name, surname) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => a.score - b.score || a.index - b.index);

      for (const entry of scored) entry.item.hidden = true;
      for (const entry of scored.slice(0, MAX_SUGGESTIONS)) entry.item.hidden = false;

      suggester.hidden = scored.length === 0;
      counter.textContent =
        scored.length > MAX_SUGGESTIONS
          ? (italian ? `Visualizzati ${MAX_SUGGESTIONS} di ${scored.length} risultati.` : `Showing ${MAX_SUGGESTIONS} of ${scored.length} matches.`)
          : '';
    }

    nameInput.addEventListener('input', refresh);
    surnameInput.addEventListener('input', refresh);
  }

  // List search and paging, one controller per table. Both work over the rows
  // already in the page and only toggle the hidden attribute, so a search
  // keystroke costs nothing and the picker and suggester keep seeing every
  // record.
  const PAGE_SIZE = 25;

  document.querySelectorAll('[data-table]').forEach((table) => {
    const card = table.closest('[data-table-card]');
    const rows = Array.from(table.querySelectorAll('tbody [data-row]'));
    if (!card || rows.length === 0) return;

    const search = card.querySelector('[data-table-search]');
    const scroll = card.querySelector('[data-table-scroll]');
    const noMatch = card.querySelector('[data-table-nomatch]');
    const pager = card.querySelector('[data-pager]');
    const status = card.querySelector('[data-pager-status]');
    const prev = card.querySelector('[data-pager-prev]');
    const next = card.querySelector('[data-pager-next]');

    let page = 0;

    function render() {
      const query = search ? search.value.trim() : '';
      const needle = query.toLowerCase();
      const found = rows.filter((row) => needle === '' || (row.dataset.search || '').includes(needle));

      const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
      // Narrowing the list, or deleting rows, can strand the view past the end.
      page = Math.min(Math.max(page, 0), pages - 1);

      const from = page * PAGE_SIZE;
      const shown = new Set(found.slice(from, from + PAGE_SIZE));
      for (const row of rows) {
        row.hidden = !shown.has(row);
      }

      if (scroll) scroll.hidden = found.length === 0;
      if (noMatch) {
        noMatch.hidden = found.length !== 0;
        if (found.length === 0) noMatch.textContent = italian ? `Nessun risultato per “${query}”.` : `No match for “${query}”.`;
      }

      if (!pager || !status || !prev || !next) return;
      pager.hidden = pages <= 1;
      const first = found.length === 0 ? 0 : from + 1;
      const last = Math.min(from + PAGE_SIZE, found.length);
      status.textContent = italian
        ? (query === '' ? `${first}–${last} di ${found.length}` : `${first}–${last} di ${found.length} risultati per “${query}”`)
        : (query === '' ? `${first}–${last} of ${found.length}` : `${first}–${last} of ${found.length} matching “${query}”`);
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
    }

    prev?.addEventListener('click', () => {
      page -= 1;
      render();
    });
    next?.addEventListener('click', () => {
      page += 1;
      render();
    });
    if (search) {
      search.addEventListener('input', () => {
        page = 0;
        render();
      });
    }

    // Open on the page holding the row being edited, otherwise the highlighted
    // row and its form would be on different pages.
    const editing = table.querySelector('tbody tr.is-editing');
    if (editing) {
      const index = rows.indexOf(editing);
      if (index >= 0) page = Math.floor(index / PAGE_SIZE);
    }

    render();
  });

  // Import box: a dropped file fills the textarea. The file is read in the
  // browser and never uploaded on its own, so there is no multipart parser to
  // accept and no way for a dropped file to be half-sent.
  document.querySelectorAll('[data-import-dropzone]').forEach((area) => {
    function read(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        area.value = String(reader.result ?? '');
        area.setCustomValidity('');
      });
      reader.addEventListener('error', () => {
        area.setCustomValidity(message('That file could not be read.', 'Impossibile leggere il file.'));
      });
      reader.readAsText(file);
    }

    area.addEventListener('dragover', (event) => {
      event.preventDefault();
      area.classList.add('is-drop');
    });
    area.addEventListener('dragleave', () => area.classList.remove('is-drop'));
    area.addEventListener('drop', (event) => {
      event.preventDefault();
      area.classList.remove('is-drop');
      read(event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null);
    });
    area.addEventListener('input', () => area.setCustomValidity(''));
  });

  // Without this, dropping a file anywhere else on the page makes the browser
  // navigate to it and throw away whatever was half typed into a form.
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (event) => event.preventDefault());
  }

  window.addEventListener('popstate', () => activate(location.hash.slice(1)));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));

  const firstInvalid = document.querySelector('[aria-invalid="true"]');
  const invalidControl = firstInvalid?.matches('input, select, textarea, button')
    ? firstInvalid
    : firstInvalid?.querySelector('input, select, textarea, button');
  invalidControl?.focus();
})();
