(function () {
  "use strict";

  const data = window.SPEC_DATA;
  if (!data) {
    document.getElementById("main").innerHTML =
      "<p>Missing spec data. Run <code>python build.py</code>.</p>";
    return;
  }

  const navPrimaryEl = document.getElementById("nav-primary");
  const navSubnavEl = document.getElementById("nav-subnav");
  const navSecondaryEl = document.getElementById("nav-secondary");
  const navTertiaryEl = document.getElementById("nav-tertiary");
  const navQuaternaryEl = document.getElementById("nav-quaternary");
  const mainEl = document.getElementById("main");
  const pageTitleEl = document.getElementById("page-title");
  const pageEyebrowEl = document.getElementById("page-eyebrow");
  const pagePositionEl = document.getElementById("page-position");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnPrint = document.getElementById("btn-print");
  const printDialogEl = document.getElementById("print-dialog");
  const btnPrintPage = document.getElementById("btn-print-page");
  const btnPrintDocument = document.getElementById("btn-print-document");
  const btnPrintCancel = document.getElementById("btn-print-cancel");

  let pinPanel = null;
  let pinnedFigure = null;
  let pinInteraction = null;

  const PIN_MARGIN = 8;
  const PIN_MIN_WIDTH = 120;
  const PIN_OPEN_SCALE = 1.1;
  const pinDesktopMq = window.matchMedia("(min-width: 901px)");

  function isFigurePinEnabled() {
    return pinDesktopMq.matches;
  }

  function syncFigurePinAvailability(root = mainEl) {
    if (!root) return;
    const enabled = isFigurePinEnabled();
    root.querySelectorAll(".figure-image").forEach((img) => {
      if (enabled) {
        img.classList.add("figure-image--pinnable");
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        img.setAttribute("aria-label", "Pin illustration to top of page");
      } else {
        img.classList.remove("figure-image--pinnable");
        img.removeAttribute("tabindex");
        img.removeAttribute("role");
        img.removeAttribute("aria-label");
      }
    });
  }

  function handlePinViewportChange() {
    if (!isFigurePinEnabled()) {
      if (pinnedFigure) unpinFigure();
    } else if (pinPanel && !pinPanel.hidden) {
      keepPinPanelInView();
    }
    syncFigurePinAvailability();
  }

  function resetPinPanelLayout(panel) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    panel.style.width = "";
    panel.style.maxHeight = "";
    panel.classList.remove("is-interacting");
  }

  function clampPin(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pinPanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    if (!panel.style.left) {
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
    }
    return {
      left: parseFloat(panel.style.left),
      top: parseFloat(panel.style.top),
    };
  }

  function pinResizeScale(corner, dx, dy, startWidth, startHeight) {
    let scaleW;
    let scaleH;

    if (corner === "se") {
      scaleW = (startWidth + dx) / startWidth;
      scaleH = (startHeight + dy) / startHeight;
    } else if (corner === "sw") {
      scaleW = (startWidth - dx) / startWidth;
      scaleH = (startHeight + dy) / startHeight;
    } else if (corner === "ne") {
      scaleW = (startWidth + dx) / startWidth;
      scaleH = (startHeight - dy) / startHeight;
    } else {
      scaleW = (startWidth - dx) / startWidth;
      scaleH = (startHeight - dy) / startHeight;
    }

    const growing = scaleW >= 1 || scaleH >= 1;
    return growing ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);
  }

  function keepPinPanelInView() {
    if (!pinPanel || pinPanel.hidden || pinInteraction) return;

    const m = PIN_MARGIN;
    const minWidth = PIN_MIN_WIDTH;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pos = pinPanelPosition(pinPanel);

    let left = pos.left;
    let top = pos.top;
    let width = pinPanel.offsetWidth;
    let height = pinPanel.offsetHeight;

    const maxWidthInView = Math.max(minWidth, vw - m * 2);
    if (width > maxWidthInView) {
      pinPanel.style.width = `${maxWidthInView}px`;
      width = pinPanel.offsetWidth;
      height = pinPanel.offsetHeight;
    }

    let maxHeightInView = Math.max(80, vh - m * 2);
    let guard = 0;
    while (height > maxHeightInView && width > minWidth && guard < 24) {
      const nextWidth = Math.max(minWidth, Math.floor(width * (maxHeightInView / height) * 0.98));
      if (nextWidth === width) break;
      pinPanel.style.width = `${nextWidth}px`;
      width = pinPanel.offsetWidth;
      height = pinPanel.offsetHeight;
      maxHeightInView = Math.max(80, vh - m * 2);
      guard += 1;
    }

    if (height > vh - m * 2) {
      pinPanel.style.maxHeight = `${vh - m * 2}px`;
      height = pinPanel.offsetHeight;
    } else {
      pinPanel.style.maxHeight = "";
    }

    width = pinPanel.offsetWidth;
    height = pinPanel.offsetHeight;
    left = clampPin(left, m, Math.max(m, vw - width - m));
    top = clampPin(top, m, Math.max(m, vh - height - m));

    pinPanel.style.left = `${left}px`;
    pinPanel.style.top = `${top}px`;
  }

  function initPinPanelInteractions(panel) {
    if (panel.dataset.interactionsReady) return;
    panel.dataset.interactionsReady = "1";

    const dragHandle = panel.querySelector(".figure-pin-drag");

    function startInteraction(e, type, corner) {
      e.preventDefault();
      const pos = pinPanelPosition(panel);
      pinInteraction = {
        type,
        corner,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: pos.left,
        startTop: pos.top,
        startWidth: panel.offsetWidth,
        startHeight: panel.offsetHeight,
      };
      panel.setPointerCapture(e.pointerId);
      panel.classList.add("is-interacting");
    }

    function moveInteraction(e) {
      if (!pinInteraction || e.pointerId !== pinInteraction.pointerId) return;

      if (pinInteraction.type === "move") {
        const dx = e.clientX - pinInteraction.startX;
        const dy = e.clientY - pinInteraction.startY;
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const maxLeft = Math.max(PIN_MARGIN, window.innerWidth - width - PIN_MARGIN);
        const maxTop = Math.max(PIN_MARGIN, window.innerHeight - height - PIN_MARGIN);
        panel.style.left = `${Math.min(maxLeft, Math.max(PIN_MARGIN, pinInteraction.startLeft + dx))}px`;
        panel.style.top = `${Math.min(maxTop, Math.max(PIN_MARGIN, pinInteraction.startTop + dy))}px`;
        return;
      }

      const dx = e.clientX - pinInteraction.startX;
      const dy = e.clientY - pinInteraction.startY;
      const corner = pinInteraction.corner;
      const scale = pinResizeScale(
        corner,
        dx,
        dy,
        pinInteraction.startWidth,
        pinInteraction.startHeight
      );
      const minScale = PIN_MIN_WIDTH / pinInteraction.startWidth;
      let maxScale = Infinity;

      if (corner === "se" || corner === "ne") {
        maxScale = (window.innerWidth - PIN_MARGIN - pinInteraction.startLeft) / pinInteraction.startWidth;
      } else {
        maxScale = (pinInteraction.startLeft + pinInteraction.startWidth - PIN_MARGIN) / pinInteraction.startWidth;
      }

      if (corner === "se" || corner === "sw") {
        const maxHeightScale =
          (window.innerHeight - PIN_MARGIN - pinInteraction.startTop) / pinInteraction.startHeight;
        maxScale = Math.min(maxScale, maxHeightScale);
      } else {
        const maxHeightScale =
          (pinInteraction.startTop + pinInteraction.startHeight - PIN_MARGIN) /
          pinInteraction.startHeight;
        maxScale = Math.min(maxScale, maxHeightScale);
      }

      const clampedScale = clampPin(scale, minScale, maxScale);
      const newWidth = pinInteraction.startWidth * clampedScale;

      panel.style.width = `${newWidth}px`;

      if (corner === "sw" || corner === "nw") {
        panel.style.left = `${pinInteraction.startLeft + pinInteraction.startWidth - newWidth}px`;
      }

      if (corner === "ne" || corner === "nw") {
        const newHeight = panel.offsetHeight;
        panel.style.top = `${pinInteraction.startTop + pinInteraction.startHeight - newHeight}px`;
      }
    }

    function endInteraction(e) {
      if (!pinInteraction || e.pointerId !== pinInteraction.pointerId) return;
      pinInteraction = null;
      panel.classList.remove("is-interacting");
      panel.releasePointerCapture(e.pointerId);
      keepPinPanelInView();
    }

    dragHandle.addEventListener("pointerdown", (e) => startInteraction(e, "move"));
    panel.querySelectorAll(".figure-pin-resize").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        startInteraction(e, "resize", handle.dataset.corner);
      });
    });
    panel.addEventListener("pointermove", moveInteraction);
    panel.addEventListener("pointerup", endInteraction);
    panel.addEventListener("pointercancel", endInteraction);
  }

  function ensurePinPanel() {
    if (pinPanel) return pinPanel;

    pinPanel = document.createElement("div");
    pinPanel.id = "figure-pin-panel";
    pinPanel.className = "figure-pin-panel";
    pinPanel.hidden = true;
    pinPanel.setAttribute("aria-hidden", "true");
    pinPanel.innerHTML = `
      <div class="figure-pin-chrome">
        <button type="button" class="figure-pin-drag" aria-label="Move illustration">
          <span class="figure-pin-caption figure-caption"></span>
        </button>
        <button type="button" class="figure-pin-close" aria-label="Close pinned illustration">×</button>
      </div>
      <div class="figure-pin-slot"></div>
      <div class="figure-pin-resize figure-pin-resize-nw" data-corner="nw" role="separator" aria-label="Resize illustration" tabindex="0"></div>
      <div class="figure-pin-resize figure-pin-resize-ne" data-corner="ne" role="separator" aria-hidden="true" tabindex="-1"></div>
      <div class="figure-pin-resize figure-pin-resize-sw" data-corner="sw" role="separator" aria-hidden="true" tabindex="-1"></div>
      <div class="figure-pin-resize figure-pin-resize-se" data-corner="se" role="separator" aria-hidden="true" tabindex="-1"></div>`;

    pinPanel.querySelector(".figure-pin-close").addEventListener("click", (e) => {
      e.stopPropagation();
      unpinFigure();
    });

    initPinPanelInteractions(pinPanel);
    document.body.appendChild(pinPanel);
    return pinPanel;
  }

  function unpinFigure() {
    if (!pinnedFigure) return;

    const { figure, placeholder, parent } = pinnedFigure;
    if (figure.parentNode && placeholder.parentNode) {
      parent.insertBefore(figure, placeholder);
      placeholder.remove();
      figure.style.width = "";
      figure.classList.remove("is-pinned");
    } else if (placeholder.parentNode) {
      placeholder.remove();
    }

    const dragCaption = pinPanel.querySelector(".figure-pin-caption");
    if (dragCaption) dragCaption.textContent = "";

    resetPinPanelLayout(pinPanel);
    pinPanel.hidden = true;
    pinPanel.setAttribute("aria-hidden", "true");
    pinnedFigure = null;
  }

  function syncPinPanelCaption(figureBlock, panel) {
    const captionEl = figureBlock.querySelector(".figure-caption");
    const dragCaption = panel.querySelector(".figure-pin-caption");
    if (!dragCaption) return;
    dragCaption.textContent = captionEl?.textContent?.trim() || "";
  }

  function pinFigure(figureBlock) {
    if (!isFigurePinEnabled()) return;
    if (pinnedFigure?.figure === figureBlock) return;
    if (pinnedFigure) unpinFigure();

    const panel = ensurePinPanel();
    const slot = panel.querySelector(".figure-pin-slot");
    const parent = figureBlock.parentNode;
    const rect = figureBlock.getBoundingClientRect();

    resetPinPanelLayout(panel);

    const placeholder = document.createElement("div");
    placeholder.className = "figure-pin-placeholder";
    placeholder.style.height = `${rect.height}px`;
    placeholder.setAttribute("aria-hidden", "true");
    parent.insertBefore(placeholder, figureBlock);

    figureBlock.style.width = "100%";
    figureBlock.classList.add("is-pinned");
    slot.appendChild(figureBlock);
    panel.style.width = `${rect.width * PIN_OPEN_SCALE}px`;
    syncPinPanelCaption(figureBlock, panel);

    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    requestAnimationFrame(keepPinPanelInView);

    pinnedFigure = { figure: figureBlock, placeholder, parent };
  }

  function partHasCategories(part) {
    return Array.isArray(part?.categories) && part.categories.length > 0;
  }

  function findPart(partId) {
    return data.navigation.find((p) => p.id === partId);
  }

  function findCategory(part, categoryId) {
    return part?.categories?.find((c) => c.id === categoryId) ?? null;
  }

  function subsectionsInCategory(category) {
    if (!category) return [];
    if (category.groups) {
      return category.groups.flatMap((group) => group.subsections);
    }
    return category.subsections || [];
  }

  function subsectionHasStages(subsection) {
    const staged = subsection.items.filter((item) => item.title);
    return staged.length > 1;
  }

  function addPagesForSubsection(part, category, subsection) {
    const categoryId = category?.id ?? null;
    if (subsectionHasStages(subsection)) {
      subsection.items.forEach((item) => {
        if (item.title) {
          pages.push({
            part,
            category,
            categoryId,
            subsection,
            item,
            sheetId: item.id,
            staged: true,
          });
        }
      });
      return;
    }
    subsection.items.forEach((item) => {
      pages.push({
        part,
        category,
        categoryId,
        subsection,
        item,
        sheetId: item.id,
        staged: false,
      });
    });
  }

  const pages = [];
  data.navigation.forEach((part) => {
    if (partHasCategories(part)) {
      part.categories.forEach((category) => {
        subsectionsInCategory(category).forEach((subsection) => {
          addPagesForSubsection(part, category, subsection);
        });
      });
      return;
    }
    part.subsections.forEach((subsection) => {
      addPagesForSubsection(part, null, subsection);
    });
  });

  let activePartId = pages[0]?.part.id ?? "";
  let activeCategoryId = pages[0]?.categoryId ?? null;
  let activeSubsectionId = pages[0]?.subsection.id ?? "";
  let activeSheetId = pages[0]?.sheetId ?? "";

  document.title = data.title;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findPageBySheetId(sheetId) {
    return pages.find((p) => p.sheetId === sheetId);
  }

  function hashForSheetId(sheetId) {
    const page = findPageBySheetId(sheetId);
    if (!page) return "";
    if (page.categoryId) {
      return `#${page.part.id}/${page.categoryId}/${page.subsection.id}/${sheetId}`;
    }
    return `#${page.part.id}/${page.subsection.id}/${sheetId}`;
  }

  function parseInlineRichText(text, options = {}) {
    const allowBold = options.allowBold !== false;
    const refLinks = data.refLinks || {};
    const refDisplay = data.refDisplay || {};
    let remaining = String(text ?? "");
    let html = "";

    while (remaining.length > 0) {
      const escaped = remaining.match(/^\\(.)/);
      if (escaped) {
        html += escapeHtml(escaped[1]);
        remaining = remaining.slice(escaped[0].length);
        continue;
      }

      const quote = remaining.match(/^"([^"]+)"/);
      if (quote) {
        const label = quote[1];
        const sheetId = refLinks[label];
        const hash = sheetId && data.sheets[sheetId] ? hashForSheetId(sheetId) : "";
        const display = refDisplay[label] || label;
        if (hash) {
          html += `<a class="sheet-ref-link" href="${hash}">${escapeHtml(display)}</a>`;
        } else {
          html += escapeHtml(quote[0]);
        }
        remaining = remaining.slice(quote[0].length);
        continue;
      }

      const refToken = remaining.match(/^@ref\{([^}]+)\}ref@/);
      if (refToken) {
        const refId = refToken[1].trim();
        const sheetId = refLinks[refId];
        const hash = sheetId && data.sheets[sheetId] ? hashForSheetId(sheetId) : "";
        const display = refDisplay[refId] || refId;
        if (hash) {
          html += `<a class="sheet-ref-link" href="${hash}">${escapeHtml(display)}</a>`;
        } else {
          html += escapeHtml(refToken[0]);
        }
        remaining = remaining.slice(refToken[0].length);
        continue;
      }

      const bold = remaining.match(/^\*\*([^*]+)\*\*/);
      if (bold) {
        if (allowBold) {
          html += `<strong>${escapeHtml(bold[1])}</strong>`;
        } else {
          html += escapeHtml(bold[1]);
        }
        remaining = remaining.slice(bold[0].length);
        continue;
      }

      const code = remaining.match(/^`([^`]+)`/);
      if (code) {
        html += `<code>${escapeHtml(code[1])}</code>`;
        remaining = remaining.slice(code[0].length);
        continue;
      }

      const plain = remaining.match(/^[^"\\`*@<>]+/);
      if (plain) {
        html += escapeHtml(plain[0]);
        remaining = remaining.slice(plain[0].length);
        continue;
      }

      html += escapeHtml(remaining[0]);
      remaining = remaining.slice(1);
    }

    return html;
  }

  function richTextHtml(sheet, fieldHtml, fieldMarkdown, options = {}) {
    const html = sheet?.[fieldHtml];
    if (html) return html;
    return parseInlineRichText(String(sheet?.[fieldMarkdown] ?? ""), options).replace(/\n/g, "<br>");
  }

  /** Table cells are pre-rendered to HTML at build time; do not escape again. */
  function enrichedCellHtml(value) {
    const v = String(value ?? "").trim();
    if (!v) return '<span class="cell-empty">—</span>';
    return v.replace(/\n/g, "<br>");
  }

  function linkifySheetRefs(text) {
    return parseInlineRichText(String(text ?? "")).replace(/\n/g, "<br>");
  }

  function formatRecordCell(value) {
    const v = (value || "").trim();
    if (!v) return '<span class="cell-empty">—</span>';

    const parts = v.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (!parts) return enrichedCellHtml(v);

    const firstRaw = parts[1];
    const first = firstRaw.toLowerCase().replace(/[.,]$/, "");
    const rest = (parts[2] || "").trim();

    let badgeClass = "";
    let badgeLabel = firstRaw;

    if (first === "necessary" || first.startsWith("necessary")) {
      badgeClass = "badge-record-necessary";
      badgeLabel = "Necessary";
    } else if (first === "optional" || first.startsWith("optional")) {
      badgeClass = "badge-record-optional";
      badgeLabel = "Optional";
    } else if (first === "record" || first === "recorded" || first.startsWith("record")) {
      badgeClass = "badge-record-record";
      badgeLabel = first === "recorded" ? "Recorded" : "Record";
    }

    if (!badgeClass) {
      return enrichedCellHtml(v);
    }

    const tail = rest
      ? `<span class="record-cell-detail">${enrichedCellHtml(rest)}</span>`
      : "";
    return `<span class="record-cell"><span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>${tail}</span>`;
  }

  function findPage(partId, categoryId, subsectionId, sheetId) {
    return pages.find(
      (p) =>
        p.part.id === partId &&
        (categoryId == null ? p.categoryId == null : p.categoryId === categoryId) &&
        p.subsection.id === subsectionId &&
        p.sheetId === sheetId
    );
  }

  function currentPart() {
    return findPart(activePartId);
  }

  function currentCategory() {
    const part = currentPart();
    if (!partHasCategories(part)) return null;
    return findCategory(part, activeCategoryId);
  }

  function currentSubsection() {
    const part = currentPart();
    if (partHasCategories(part)) {
      return subsectionsInCategory(currentCategory()).find((s) => s.id === activeSubsectionId);
    }
    return part?.subsections?.find((s) => s.id === activeSubsectionId);
  }

  function currentPageIndex() {
    return pages.findIndex(
      (p) =>
        p.part.id === activePartId &&
        (activeCategoryId == null ? p.categoryId == null : p.categoryId === activeCategoryId) &&
        p.subsection.id === activeSubsectionId &&
        p.sheetId === activeSheetId
    );
  }

  function formatDefinitionCell(value) {
    const v = (value || "").trim();
    if (!v) return '<span class="cell-empty">—</span>';

    return `<div class="def-cell">
      <button type="button" class="def-toggle" hidden aria-expanded="false" aria-label="Expand definition">▶</button>
      <div class="def-text">${enrichedCellHtml(v)}</div>
    </div>`;
  }

  let definitionMeasureHost = null;

  function measureHostEl() {
    if (!definitionMeasureHost) {
      definitionMeasureHost = document.createElement("div");
      definitionMeasureHost.className = "def-measure-host";
      document.body.appendChild(definitionMeasureHost);
    }
    return definitionMeasureHost;
  }

  function measureCellNaturalHeight(td) {
    const host = measureHostEl();
    const probe = document.createElement("div");
    const styles = getComputedStyle(td);
    probe.style.width = `${td.clientWidth}px`;
    probe.style.padding = styles.padding;
    probe.style.font = styles.font;
    probe.style.lineHeight = styles.lineHeight;
    probe.style.letterSpacing = styles.letterSpacing;
    probe.style.wordBreak = styles.wordBreak;
    probe.style.overflowWrap = styles.overflowWrap;
    probe.innerHTML = td.innerHTML;
    host.appendChild(probe);
    const height = probe.scrollHeight;
    probe.remove();
    return height;
  }

  const COMMENTARY_ACCORDION_MIN_LINES = 6;
  const COMMENTARY_PREF_KEY = "gt-commentary-expanded";

  function getCommentaryExpandedPref() {
    const value = localStorage.getItem(COMMENTARY_PREF_KEY);
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  }

  function setCommentaryExpandedPref(expanded) {
    localStorage.setItem(COMMENTARY_PREF_KEY, expanded ? "1" : "0");
  }

  function setCommentaryCollapsed(callout, collapsed) {
    const cell = callout.querySelector(".commentary-cell");
    const toggle = callout.querySelector(".commentary-toggle");
    if (!cell?.classList.contains("has-toggle") || !toggle) return;
    cell.classList.toggle("is-collapsed", collapsed);
    toggle.textContent = collapsed ? "▶" : "▼";
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Expand commentary" : "Collapse commentary"
    );
  }

  function applyCommentaryExpandedPref(root) {
    const pref = getCommentaryExpandedPref();
    if (pref === null) return;
    root.querySelectorAll(".commentary-callout").forEach((callout) => {
      if (callout.querySelector(".commentary-cell")?.classList.contains("has-toggle")) {
        setCommentaryCollapsed(callout, !pref);
      }
    });
  }

  function initCommentaryCollapsibles(root) {
    const pref = getCommentaryExpandedPref();
    const defaultCollapsed = pref === null ? true : !pref;

    root.querySelectorAll(".commentary-callout").forEach((callout) => {
      const cell = callout.querySelector(".commentary-cell");
      const textEl = callout.querySelector(".commentary-text");
      const toggle = callout.querySelector(".commentary-toggle");
      const head = callout.querySelector(".commentary-head");
      if (!cell || !textEl || !toggle) return;

      cell.classList.remove("has-toggle", "is-collapsed");
      head?.classList.remove("has-toggle");
      toggle.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "▶";

      const lineHeight = parseFloat(getComputedStyle(textEl).lineHeight) || 22;
      const collapsedMax = lineHeight * COMMENTARY_ACCORDION_MIN_LINES + 1;
      const naturalHeight = textEl.scrollHeight;

      if (naturalHeight > collapsedMax) {
        cell.classList.add("has-toggle");
        head?.classList.add("has-toggle");
        toggle.hidden = false;
        setCommentaryCollapsed(callout, defaultCollapsed);
      }
    });
  }

  function initDefinitionCollapsibles(root) {
    root.querySelectorAll(".def-cell").forEach((cell) => {
      const textEl = cell.querySelector(".def-text");
      const toggle = cell.querySelector(".def-toggle");
      const td = cell.closest("td");
      const row = cell.closest("tr");
      if (!textEl || !toggle || !td || !row) return;

      cell.classList.remove("is-collapsed");
      toggle.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "▶";

      const defHeight = measureCellNaturalHeight(td);
      const lineHeight = parseFloat(getComputedStyle(textEl).lineHeight) || 18;
      const collapsedMax = lineHeight * 3 + 1;
      const otherHeights = [...row.querySelectorAll("td")]
        .filter((other) => other !== td)
        .map((other) => measureCellNaturalHeight(other));
      const maxOther = otherHeights.length ? Math.max(...otherHeights) : 0;
      const defMakesRowTaller = defHeight > maxOther + 2;

      cell.classList.remove("has-toggle");
      if (defHeight > collapsedMax && defMakesRowTaller) {
        cell.classList.add("is-collapsed", "has-toggle");
        toggle.hidden = false;
      }
    });
  }

  function formatCell(header, value) {
    const v = (value || "").trim();
    if (!v) return '<span class="cell-empty">—</span>';

    if (header === "Definition") {
      return formatDefinitionCell(value);
    }

    if (header === "IFC") {
      const cls = v.toLowerCase() === "custom" ? "badge-custom" : "badge-existing";
      return `<span class="badge ${cls}">${escapeHtml(v)}</span>`;
    }

    if (header === "Record") {
      return formatRecordCell(value);
    }

    if (header === "IFC Tag" || header === "IFC Entity Type") {
      return `<span class="cell-mono">${enrichedCellHtml(v)}</span>`;
    }

    return enrichedCellHtml(v);
  }

  function renderTable(sheet) {
    const headers = sheet.headers || [];
    const rows = sheet.rows || [];
    if (!headers.length) {
      return "";
    }

    const headHtml = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("");
    const bodyHtml = rows
      .map((row) => {
        const cells = headers
          .map((h, i) => {
            const tdClass = h === "Definition" ? ' class="cell-definition"' : "";
            return `<td${tdClass}>${formatCell(h, row[i])}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `
      <div class="table-card">
        <div class="table-scroll">
          <table class="spec-table">
            <thead><tr>${headHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderEmbeddedTables(root) {
    root.querySelectorAll("[data-sheet-table]").forEach((el) => {
      const id = el.getAttribute("data-sheet-table");
      const sheet = data.sheets[id];
      if (sheet) el.outerHTML = renderTable(sheet);
    });
  }

  function renderPageContent(page) {
    const sheet = data.sheets[page.sheetId];
    if (!sheet) return "";
    const body = sheet.contentHtml || "";
    return `
      <div class="page-view" role="document">
        <article class="section-block" data-sheet="${escapeHtml(page.sheetId)}">
          <div class="page-body rich-text">${body}</div>
        </article>
      </div>`;
  }

  function renderPageHeader(page, index) {
    const line1 = [page.part.title];
    if (page.category) line1.push(page.category.title);
    const line2 = [page.subsection.title];
    if (page.staged && page.item?.title) line2.push(page.item.title);

    return `
      <header class="page-header">
        <p class="page-position">Page ${index + 1} of ${pages.length} · ${escapeHtml(page.part.title)}</p>
        <p class="page-eyebrow">${escapeHtml(line1.join(" > "))}</p>
        <h2 class="page-title">${escapeHtml(line2.join(" - "))}</h2>
      </header>`;
  }

  function buildPrintDocumentHtml() {
    return pages
      .map(
        (page, index) => `
      <section class="print-page-section">
        ${renderPageHeader(page, index)}
        <div class="main">${renderPageContent(page)}</div>
      </section>`
      )
      .join("");
  }

  let printDocumentEl = null;

  function ensurePrintDocumentEl() {
    if (!printDocumentEl) {
      printDocumentEl = document.createElement("div");
      printDocumentEl.id = "print-document";
      printDocumentEl.className = "print-document";
      document.body.appendChild(printDocumentEl);
    }
    return printDocumentEl;
  }

  function preparePrintDocument() {
    if (pinnedFigure) unpinFigure();
    const el = ensurePrintDocumentEl();
    el.innerHTML = `<div class="page-shell">${buildPrintDocumentHtml()}</div>`;
    renderEmbeddedTables(el);
    initDefinitionCollapsibles(el);
    initCommentaryCollapsibles(el);
  }

  function teardownPrintDocument() {
    if (!printDocumentEl) return;
    printDocumentEl.innerHTML = "";
  }

  let printDialogOpen = false;

  function openPrintDialog() {
    if (!printDialogEl) return;
    printDialogEl.hidden = false;
    printDialogOpen = true;
    btnPrintPage?.focus();
  }

  function closePrintDialog() {
    if (!printDialogEl) return;
    printDialogEl.hidden = true;
    printDialogOpen = false;
  }

  function runPrint(mode) {
    closePrintDialog();
    document.documentElement.dataset.printMode = mode;

    if (mode === "document") {
      preparePrintDocument();
    } else {
      teardownPrintDocument();
      if (pinnedFigure) unpinFigure();
    }

    window.print();
  }

  function buildPrimaryNav() {
    navPrimaryEl.innerHTML = data.navigation
      .map(
        (part) => `
      <button
        type="button"
        class="nav-primary-btn"
        data-part="${part.id}"
        aria-current="${part.id === activePartId ? "true" : "false"}"
      >${escapeHtml(part.title)}</button>`
      )
      .join("");
  }

  function buildSecondaryNav() {
    const part = currentPart();
    if (!part) {
      navSecondaryEl.hidden = true;
      navSecondaryEl.innerHTML = "";
      return;
    }

    if (partHasCategories(part)) {
      navSecondaryEl.hidden = !part.categories.length;
      navSecondaryEl.innerHTML = part.categories
        .map(
          (category) => `
      <button
        type="button"
        class="nav-secondary-btn"
        data-part="${part.id}"
        data-category="${category.id}"
        aria-current="${category.id === activeCategoryId ? "true" : "false"}"
      >${escapeHtml(category.title)}</button>`
        )
        .join("");
      return;
    }

    navSecondaryEl.hidden = !part.subsections.length;
    navSecondaryEl.innerHTML = part.subsections
      .map(
        (sub) => `
      <button
        type="button"
        class="nav-secondary-btn"
        data-part="${part.id}"
        data-subsection="${sub.id}"
        aria-current="${sub.id === activeSubsectionId ? "true" : "false"}"
      >${escapeHtml(sub.title)}</button>`
      )
      .join("");
  }

  function tertiaryButtonHtml(partId, categoryId, subsectionId, title) {
    const categoryAttr = categoryId ? `data-category="${categoryId}"` : "";
    return `
      <button
        type="button"
        class="nav-tertiary-btn"
        data-part="${partId}"
        ${categoryAttr}
        data-subsection="${subsectionId}"
        aria-current="${subsectionId === activeSubsectionId ? "true" : "false"}"
      >${escapeHtml(title)}</button>`;
  }

  function buildTertiaryNav() {
    const part = currentPart();
    const category = currentCategory();

    if (!partHasCategories(part)) {
      navTertiaryEl.hidden = true;
      navTertiaryEl.innerHTML = "";
      return;
    }

    if (!category) {
      navTertiaryEl.hidden = true;
      navTertiaryEl.innerHTML = "";
      return;
    }

    if (category.groups) {
      let html = "";
      category.groups.forEach((group) => {
        html += `<span class="nav-tertiary-label">${escapeHtml(group.title)}</span>`;
        group.subsections.forEach((sub) => {
          html += tertiaryButtonHtml(part.id, category.id, sub.id, sub.title);
        });
      });
      navTertiaryEl.hidden = false;
      navTertiaryEl.innerHTML = html;
      return;
    }

    const subs = category.subsections || [];
    if (!subs.length) {
      navTertiaryEl.hidden = true;
      navTertiaryEl.innerHTML = "";
      return;
    }

    navTertiaryEl.hidden = false;
    navTertiaryEl.innerHTML = subs
      .map((sub) => tertiaryButtonHtml(part.id, category.id, sub.id, sub.title))
      .join("");
  }

  function buildQuaternaryNav() {
    const subsection = currentSubsection();
    if (!subsection || !subsectionHasStages(subsection)) {
      navQuaternaryEl.hidden = true;
      navQuaternaryEl.innerHTML = "";
      return;
    }

    const staged = subsection.items.filter((item) => item.title);
    if (staged.length <= 1) {
      navQuaternaryEl.hidden = true;
      navQuaternaryEl.innerHTML = "";
      return;
    }

    const categoryAttr = activeCategoryId ? `data-category="${activeCategoryId}"` : "";
    navQuaternaryEl.hidden = false;
    navQuaternaryEl.innerHTML = staged
      .map(
        (item) => `
      <button
        type="button"
        class="nav-quaternary-btn"
        data-part="${activePartId}"
        ${categoryAttr}
        data-subsection="${activeSubsectionId}"
        data-sheet="${item.id}"
        aria-current="${item.id === activeSheetId ? "true" : "false"}"
      >${escapeHtml(item.title)}</button>`
      )
      .join("");
  }

  function syncNavDeepZone() {
    if (!navSubnavEl) return;
    const hasDeep = !navTertiaryEl.hidden || !navQuaternaryEl.hidden;
    navSubnavEl.classList.toggle("has-deep-nav", hasDeep);
  }

  function syncNavActiveStates() {
    navPrimaryEl.querySelectorAll(".nav-primary-btn").forEach((btn) => {
      const active = btn.dataset.part === activePartId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "true" : "false");
    });

    navSecondaryEl.querySelectorAll(".nav-secondary-btn").forEach((btn) => {
      let active = false;
      if (btn.dataset.category) {
        active = btn.dataset.category === activeCategoryId;
      } else {
        active = btn.dataset.subsection === activeSubsectionId;
      }
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "true" : "false");
    });

    navTertiaryEl.querySelectorAll(".nav-tertiary-btn").forEach((btn) => {
      const active = btn.dataset.subsection === activeSubsectionId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "true" : "false");
    });

    navQuaternaryEl.querySelectorAll(".nav-quaternary-btn").forEach((btn) => {
      const active = btn.dataset.sheet === activeSheetId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function updatePageTurner() {
    const idx = currentPageIndex();
    btnPrev.disabled = idx <= 0;
    btnNext.disabled = idx < 0 || idx >= pages.length - 1;

    if (idx < 0) return;

    const page = pages[idx];
    pagePositionEl.textContent = `Page ${idx + 1} of ${pages.length} · ${page.part.title}`;

    const line1 = [page.part.title];
    if (page.category) line1.push(page.category.title);
    pageEyebrowEl.textContent = line1.join(" > ");

    const line2 = [page.subsection.title];
    if (page.staged && page.item?.title) line2.push(page.item.title);
    pageTitleEl.textContent = line2.join(" - ");
  }

  function setLocation() {
    const hash = activeCategoryId
      ? `${activePartId}/${activeCategoryId}/${activeSubsectionId}/${activeSheetId}`
      : `${activePartId}/${activeSubsectionId}/${activeSheetId}`;
    if (location.hash !== `#${hash}`) {
      history.replaceState(null, "", `#${hash}`);
    }
  }

  function showPage(partId, categoryId, subsectionId, sheetId, scrollTop) {
    unpinFigure();

    const page = findPage(partId, categoryId ?? null, subsectionId, sheetId);
    if (!page) {
      const fallback = pages.find(
        (p) =>
          p.part.id === partId &&
          (categoryId == null ? p.categoryId == null : p.categoryId === categoryId) &&
          p.subsection.id === subsectionId
      );
      if (!fallback) return;
      return showPage(
        fallback.part.id,
        fallback.categoryId,
        fallback.subsection.id,
        fallback.sheetId,
        scrollTop
      );
    }

    activePartId = partId;
    activeCategoryId = categoryId ?? null;
    activeSubsectionId = subsectionId;
    activeSheetId = sheetId;

    mainEl.innerHTML = renderPageContent(page);
    renderEmbeddedTables(mainEl);
    initDefinitionCollapsibles(mainEl);
    initCommentaryCollapsibles(mainEl);
    syncFigurePinAvailability(mainEl);

    buildSecondaryNav();
    buildTertiaryNav();
    buildQuaternaryNav();
    syncNavDeepZone();
    syncNavActiveStates();
    updatePageTurner();
    setLocation();

    if (scrollTop !== false) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      mainEl.focus({ preventScroll: true });
    }

    document.dispatchEvent(new CustomEvent("spec:page-rendered"));
  }

  function showPageByIndex(index) {
    const page = pages[index];
    if (page) {
      showPage(page.part.id, page.categoryId, page.subsection.id, page.sheetId);
    }
  }

  function currentStageTitle() {
    const idx = currentPageIndex();
    if (idx < 0) return null;
    const page = pages[idx];
    if (!page.staged || !page.item?.title) return null;
    return page.item.title;
  }

  function findSubsection(partId, categoryId, subsectionId) {
    const part = findPart(partId);
    if (!part) return null;
    if (partHasCategories(part)) {
      const category = findCategory(part, categoryId);
      return subsectionsInCategory(category).find((s) => s.id === subsectionId) ?? null;
    }
    return part.subsections.find((s) => s.id === subsectionId) ?? null;
  }

  function sheetIdForSubsection(partId, categoryId, subsectionId, preferredStageTitle) {
    const subsection = findSubsection(partId, categoryId, subsectionId);
    if (!subsection) return null;

    if (preferredStageTitle && subsectionHasStages(subsection)) {
      const match = subsection.items.find((item) => item.title === preferredStageTitle);
      if (match) return match.id;
    }

    const page = pages.find(
      (p) =>
        p.part.id === partId &&
        (categoryId == null ? p.categoryId == null : p.categoryId === categoryId) &&
        p.subsection.id === subsectionId
    );
    return page?.sheetId ?? null;
  }

  function firstPageInPart(part) {
    if (partHasCategories(part)) {
      const category = part.categories[0];
      const subsection = subsectionsInCategory(category)[0];
      const sheetId = sheetIdForSubsection(part.id, category.id, subsection.id, null);
      return { partId: part.id, categoryId: category.id, subsectionId: subsection.id, sheetId };
    }
    const subsection = part.subsections[0];
    const sheetId = sheetIdForSubsection(part.id, null, subsection.id, null);
    return { partId: part.id, categoryId: null, subsectionId: subsection.id, sheetId };
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return null;

    const parts = raw.split("/");

    if (parts.length === 4) {
      const [partId, categoryId, subsectionId, sheetId] = parts;
      if (findPage(partId, categoryId, subsectionId, sheetId)) {
        return { partId, categoryId, subsectionId, sheetId };
      }
    }

    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (findPage(a, null, b, c)) {
        return { partId: a, categoryId: null, subsectionId: b, sheetId: c };
      }
      const sheetId = sheetIdForSubsection(a, b, c, null);
      if (sheetId && findPage(a, b, c, sheetId)) {
        return { partId: a, categoryId: b, subsectionId: c, sheetId };
      }
    }

    if (parts.length === 2) {
      const [partId, subsectionId] = parts;
      const sheetId = sheetIdForSubsection(partId, null, subsectionId, null);
      if (sheetId) {
        return { partId, categoryId: null, subsectionId, sheetId };
      }
    }

    return null;
  }

  navPrimaryEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-primary-btn");
    if (!btn) return;
    const part = findPart(btn.dataset.part);
    if (!part) return;
    const target = firstPageInPart(part);
    if (target.sheetId) {
      showPage(target.partId, target.categoryId, target.subsectionId, target.sheetId);
    }
  });

  navSecondaryEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-secondary-btn");
    if (!btn) return;

    if (btn.dataset.category) {
      const category = findCategory(findPart(btn.dataset.part), btn.dataset.category);
      const subsection = subsectionsInCategory(category)[0];
      if (!subsection) return;
      const sheetId = sheetIdForSubsection(
        btn.dataset.part,
        btn.dataset.category,
        subsection.id,
        currentStageTitle()
      );
      if (sheetId) {
        showPage(btn.dataset.part, btn.dataset.category, subsection.id, sheetId);
      }
      return;
    }

    const sheetId = sheetIdForSubsection(
      btn.dataset.part,
      null,
      btn.dataset.subsection,
      currentStageTitle()
    );
    if (sheetId) {
      showPage(btn.dataset.part, null, btn.dataset.subsection, sheetId);
    }
  });

  navTertiaryEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-tertiary-btn");
    if (!btn) return;
    const categoryId = btn.dataset.category || null;
    const sheetId = sheetIdForSubsection(
      btn.dataset.part,
      categoryId,
      btn.dataset.subsection,
      currentStageTitle()
    );
    if (sheetId) {
      showPage(btn.dataset.part, categoryId, btn.dataset.subsection, sheetId);
    }
  });

  navQuaternaryEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-quaternary-btn");
    if (!btn) return;
    const categoryId = btn.dataset.category || null;
    showPage(btn.dataset.part, categoryId, btn.dataset.subsection, btn.dataset.sheet);
  });

  btnPrev.addEventListener("click", () => {
    const idx = currentPageIndex();
    if (idx > 0) showPageByIndex(idx - 1);
  });

  btnNext.addEventListener("click", () => {
    const idx = currentPageIndex();
    if (idx < pages.length - 1) showPageByIndex(idx + 1);
  });

  window.addEventListener("hashchange", () => {
    const parsed = parseHash();
    if (parsed) {
      showPage(parsed.partId, parsed.categoryId, parsed.subsectionId, parsed.sheetId, false);
    }
  });

  function setDefinitionCollapsed(cell, collapsed) {
    const toggle = cell.querySelector(".def-toggle");
    if (!toggle) return;
    cell.classList.toggle("is-collapsed", collapsed);
    toggle.textContent = collapsed ? "▶" : "▼";
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Expand definition" : "Collapse definition"
    );
  }

  mainEl.addEventListener("click", (e) => {
    const commentaryHead = e.target.closest(".commentary-head");
    if (commentaryHead) {
      const callout = commentaryHead.closest(".commentary-callout");
      const cell = callout?.querySelector(".commentary-cell");
      if (!cell?.classList.contains("has-toggle")) return;
      const expanded = cell.classList.contains("is-collapsed");
      setCommentaryExpandedPref(expanded);
      applyCommentaryExpandedPref(mainEl);
      e.stopPropagation();
      return;
    }

    const commentaryCell = e.target.closest(".commentary-cell.has-toggle.is-collapsed");
    if (commentaryCell) {
      setCommentaryExpandedPref(true);
      applyCommentaryExpandedPref(mainEl);
      return;
    }

    const toggle = e.target.closest(".def-toggle");
    if (toggle) {
      const cell = toggle.closest(".def-cell");
      if (!cell?.classList.contains("has-toggle")) return;
      setDefinitionCollapsed(cell, cell.classList.contains("is-collapsed") ? false : true);
      e.stopPropagation();
      return;
    }

    const cell = e.target.closest(".def-cell.has-toggle.is-collapsed");
    if (cell) {
      setDefinitionCollapsed(cell, false);
      return;
    }

    const figureImage = e.target.closest(".figure-image--pinnable");
    if (figureImage) {
      const figure = figureImage.closest(".figure-block");
      if (figure && !figure.classList.contains("is-pinned")) {
        pinFigure(figure);
      }
    }
  });

  mainEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const figureImage = e.target.closest(".figure-image--pinnable");
    if (!figureImage || figureImage.closest(".figure-block.is-pinned")) return;
    e.preventDefault();
    const figure = figureImage.closest(".figure-block");
    if (figure) pinFigure(figure);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      openPrintDialog();
      return;
    }

    if (e.key === "Escape" && printDialogOpen) {
      e.preventDefault();
      closePrintDialog();
      return;
    }

    if (e.target.closest("input, textarea, select")) return;
    const idx = currentPageIndex();
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      showPageByIndex(idx - 1);
    }
    if (e.key === "ArrowRight" && idx < pages.length - 1) {
      e.preventDefault();
      showPageByIndex(idx + 1);
    }
    if (e.key === "Escape" && pinnedFigure) {
      e.preventDefault();
      unpinFigure();
    }
  });

  window.addEventListener("resize", handlePinViewportChange);
  pinDesktopMq.addEventListener("change", handlePinViewportChange);

  btnPrint?.addEventListener("click", openPrintDialog);
  btnPrintPage?.addEventListener("click", () => runPrint("page"));
  btnPrintDocument?.addEventListener("click", () => runPrint("document"));
  btnPrintCancel?.addEventListener("click", closePrintDialog);
  printDialogEl?.addEventListener("click", (e) => {
    if (e.target === printDialogEl) closePrintDialog();
  });

  window.addEventListener("beforeprint", () => {
    if (document.documentElement.dataset.printMode) return;
    document.documentElement.dataset.printMode = "page";
    teardownPrintDocument();
    if (pinnedFigure) unpinFigure();
  });

  window.addEventListener("afterprint", () => {
    teardownPrintDocument();
    delete document.documentElement.dataset.printMode;
  });

  buildPrimaryNav();
  const fromHash = parseHash();
  if (fromHash) {
    showPage(fromHash.partId, fromHash.categoryId, fromHash.subsectionId, fromHash.sheetId, false);
  } else if (pages[0]) {
    showPage(pages[0].part.id, pages[0].categoryId, pages[0].subsection.id, pages[0].sheetId, false);
  }

  window.SpecApp = { showPage, pages, mainEl, setDefinitionCollapsed };
})();
