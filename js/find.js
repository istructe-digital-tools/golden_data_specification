(function () {
  "use strict";

  const data = window.SPEC_DATA;

  const findInput = document.getElementById("find-input");
  const findCount = document.getElementById("find-count");
  const findPrev = document.getElementById("find-prev");
  const findNext = document.getElementById("find-next");

  if (!data || !findInput || !findCount || !findPrev || !findNext) return;

  let query = "";
  let matches = [];
  let activeMatchIndex = -1;
  let debounceTimer = null;
  let findDefRestore = null;

  function restoreFindExpandedDefinition() {
    if (!findDefRestore) return;
    const specApp = app();
    const { cell, wasCollapsed } = findDefRestore;
    if (specApp?.setDefinitionCollapsed && cell.isConnected) {
      specApp.setDefinitionCollapsed(cell, wasCollapsed);
    }
    findDefRestore = null;
  }

  function syncFindDefinitionExpand(root) {
    const specApp = app();
    if (!specApp?.setDefinitionCollapsed) return;

    const current = root.querySelector("mark.find-hit.is-current");
    if (!current) return;

    const cell = current.closest(".def-cell.has-toggle");
    if (!cell) return;

    const wasCollapsed = cell.classList.contains("is-collapsed");
    findDefRestore = { cell, wasCollapsed };
    if (wasCollapsed) {
      specApp.setDefinitionCollapsed(cell, false);
    }
  }

  function app() {
    return window.SpecApp;
  }

  function stripHtml(text) {
    return (text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function cellText(value) {
    return stripHtml((value || "").trim());
  }

  function pageSearchChunks(page) {
    const sheet = data.sheets[page.sheetId];
    if (!sheet) return [];

    return [
      stripHtml(sheet.partIntro),
      page.part.title,
      page.category?.title,
      page.subsection.title,
      page.item?.title,
      stripHtml(sheet.intro),
      stripHtml(sheet.commentary),
      stripHtml(sheet.notes),
      stripHtml(sheet.note),
      stripHtml(sheet.imageCaption),
      stripHtml(sheet.contentHtml),
      ...(sheet.headers || []).map((h) => stripHtml(h)),
      ...(sheet.rows || []).flatMap((row) => row.map((cell) => cellText(cell))),
    ].filter(Boolean);
  }

  function findInText(text, searchQuery) {
    const q = searchQuery.toLowerCase();
    const lower = text.toLowerCase();
    const hits = [];
    let pos = 0;

    while (pos < lower.length) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) break;
      hits.push({ start: idx, end: idx + searchQuery.length });
      pos = idx + searchQuery.length;
    }

    return hits;
  }

  function buildMatches(searchQuery) {
    const q = searchQuery.trim();
    if (!q) return [];

    const specApp = app();
    if (!specApp) return [];

    const found = [];

    specApp.pages.forEach((page, pageIndex) => {
      pageSearchChunks(page).forEach((chunk) => {
        findInText(chunk, q).forEach(() => {
          found.push({ pageIndex, page });
        });
      });
    });

    return found;
  }

  function currentPageIndexFromHash() {
    const specApp = app();
    if (!specApp) return -1;

    const parts = location.hash.replace(/^#/, "").split("/");
    return specApp.pages.findIndex((p) => {
      if (parts.length === 4) {
        return (
          p.part.id === parts[0] &&
          p.categoryId === parts[1] &&
          p.subsection.id === parts[2] &&
          p.sheetId === parts[3]
        );
      }
      if (parts.length === 3) {
        return (
          p.part.id === parts[0] &&
          !p.categoryId &&
          p.subsection.id === parts[1] &&
          p.sheetId === parts[2]
        );
      }
      return false;
    });
  }

  function updateCountLabel() {
    if (!query.trim()) {
      findCount.textContent = "—";
      return;
    }
    if (!matches.length) {
      findCount.textContent = "0/0";
      return;
    }
    findCount.textContent = `${activeMatchIndex + 1}/${matches.length}`;
  }

  function updateNavButtons() {
    const enabled = matches.length > 0;
    findPrev.disabled = !enabled;
    findNext.disabled = !enabled;
  }

  function clearHighlights(root) {
    if (!root) return;
    root.querySelectorAll("mark.find-hit").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function findDomHits(root, searchQuery) {
    const q = searchQuery.trim();
    if (!q) return [];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("mark.find-hit")) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script, style")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const hits = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      findInText(node.nodeValue, q).forEach((hit) => {
        hits.push({ node, start: hit.start, end: hit.end });
      });
    }

    return hits;
  }

  function wrapTextNodeHit(node, start, end, isCurrent) {
    if (start >= end || end > node.nodeValue.length) return;

    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);

    const mark = document.createElement("mark");
    mark.className = isCurrent ? "find-hit is-current" : "find-hit";

    try {
      range.surroundContents(mark);
    } catch {
      /* skip — invalid range inside table or similar */
    }
  }

  function highlightCurrentPage() {
    const specApp = app();
    if (!specApp?.mainEl) return;

    restoreFindExpandedDefinition();
    clearHighlights(specApp.mainEl);

    const q = query.trim();
    if (!q || activeMatchIndex < 0 || !matches[activeMatchIndex]) return;

    const match = matches[activeMatchIndex];
    const onPage = matches.filter((m) => m.pageIndex === match.pageIndex);
    const ordinalOnPage = onPage.findIndex((m) => m === match);

    const domHits = findDomHits(specApp.mainEl, q);
    if (!domHits.length) return;

    const activeDomIndex = Math.min(ordinalOnPage, domHits.length - 1);

    const byNode = new Map();
    domHits.forEach((hit, index) => {
      if (!byNode.has(hit.node)) byNode.set(hit.node, []);
      byNode.get(hit.node).push({ ...hit, index });
    });

    byNode.forEach((nodeHits) => {
      nodeHits
        .sort((a, b) => b.start - a.start)
        .forEach((hit) => {
          wrapTextNodeHit(hit.node, hit.start, hit.end, hit.index === activeDomIndex);
        });
    });

    syncFindDefinitionExpand(specApp.mainEl);

    const current = specApp.mainEl.querySelector("mark.find-hit.is-current");
    if (current) {
      current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function goToMatch(index, direction) {
    if (!matches.length) return;

    if (index < 0) {
      activeMatchIndex = direction > 0 ? 0 : matches.length - 1;
    } else if (index >= matches.length) {
      activeMatchIndex = direction > 0 ? 0 : matches.length - 1;
    } else {
      activeMatchIndex = index;
    }

    const match = matches[activeMatchIndex];
    const specApp = app();
    if (!specApp) return;

    const page = match.page;
    specApp.showPage(page.part.id, page.categoryId, page.subsection.id, page.sheetId, false);
    updateCountLabel();
    updateNavButtons();
  }

  function runSearch() {
    query = findInput.value;
    matches = buildMatches(query);

    if (!query.trim() || !matches.length) {
      activeMatchIndex = -1;
      restoreFindExpandedDefinition();
      clearHighlights(app()?.mainEl);
      updateCountLabel();
      updateNavButtons();
      return;
    }

    const currentPageIdx = currentPageIndexFromHash();
    const onPage = matches.findIndex((m) => m.pageIndex === currentPageIdx);
    activeMatchIndex = onPage >= 0 ? onPage : 0;
    goToMatch(activeMatchIndex, 1);
  }

  function scheduleSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 200);
  }

  findInput.addEventListener("input", scheduleSearch);

  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!matches.length) {
        runSearch();
        return;
      }
      goToMatch(activeMatchIndex + (e.shiftKey ? -1 : 1), e.shiftKey ? -1 : 1);
    }
    if (e.key === "Escape") {
      findInput.value = "";
      query = "";
      matches = [];
      activeMatchIndex = -1;
      restoreFindExpandedDefinition();
      clearHighlights(app()?.mainEl);
      updateCountLabel();
      updateNavButtons();
      findInput.blur();
    }
  });

  findPrev.addEventListener("click", () => {
    goToMatch(activeMatchIndex - 1, -1);
  });

  findNext.addEventListener("click", () => {
    goToMatch(activeMatchIndex + 1, 1);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      findInput.focus();
      findInput.select();
    }
  });

  document.addEventListener("spec:page-rendered", () => {
    if (query.trim() && activeMatchIndex >= 0) {
      highlightCurrentPage();
    }
  });

  updateCountLabel();
  updateNavButtons();
})();
