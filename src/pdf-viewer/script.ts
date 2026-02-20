export function buildPdfViewerScript(pdfUri: string, pdfWorkerUri: string): string {
  return `
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${pdfWorkerUri}';
    const pdfUri = '${pdfUri}';

    let pdfDoc = null;
    let currentPage = 1;
    let scale = 1.0;
    let renderToken = 0;
    const renderingPages = new Set();
    const pendingPages = new Set();
    const visiblePages = new Set();
    const maxConcurrentRenders = 2;
    let intersectionObserver = null;
    let estimatedPageWidth = 0;
    let estimatedPageHeight = 0;

    const eventBus = new pdfjsViewer.EventBus();
    const linkService = {
      eventBus,
      get pagesCount() {
        return pdfDoc ? pdfDoc.numPages : 0;
      },
      get page() {
        return currentPage;
      },
      set page(value) {
        currentPage = value;
        scrollToPage(currentPage);
        updatePageInfo();
      },
    };
    const findController = new pdfjsViewer.PDFFindController({
      linkService,
      eventBus,
      updateMatchesCountOnProgress: true,
    });

    const container = document.getElementById('container');
    const loading = document.getElementById('loading');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const searchInput = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrev');
    const searchNextBtn = document.getElementById('searchNext');
    const searchInfo = document.getElementById('searchInfo');

    let searchTimeout = null;

    function updatePageInfo() {
      currentPageSpan.textContent = currentPage;
      totalPagesSpan.textContent = pdfDoc ? pdfDoc.numPages : '-';
      zoomLevelSpan.textContent = Math.round(scale * 100);

      prevBtn.disabled = !pdfDoc || currentPage <= 1;
      nextBtn.disabled = !pdfDoc || currentPage >= pdfDoc.numPages;
    }

    async function renderPage(pageNum) {
      if (!pdfDoc) return;

      const pageEl = document.getElementById('page-' + pageNum);
      if (!pageEl) return;
      const canvas = pageEl.querySelector('canvas');
      if (!canvas) return;

      const pageToken = renderToken;
      if (canvas.dataset.renderedScale === String(scale)) {
        return;
      }

      renderingPages.add(pageNum);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        if (pageToken !== renderToken) {
          return;
        }

        pageEl.style.width = viewport.width + 'px';
        pageEl.style.height = viewport.height + 'px';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        if (pageToken !== renderToken) {
          return;
        }

        const existingTextLayer = pageEl.querySelector('.textLayer');
        if (existingTextLayer) {
          existingTextLayer.remove();
        }

        const viewer = window.pdfjsViewer;
        if (viewer && viewer.TextLayerBuilder && viewer.TextHighlighter) {
          const highlighter = new viewer.TextHighlighter({
            findController,
            eventBus,
            pageIndex: pageNum - 1,
          });
          const textLayerBuilder = new viewer.TextLayerBuilder({
            pdfPage: page,
            highlighter,
            onAppend: (layerDiv) => pageEl.appendChild(layerDiv),
          });
          await textLayerBuilder.render({ viewport });
        }

        canvas.dataset.renderedScale = String(scale);
      } catch (_err) {
        // Keep placeholders. Global loader shows fatal errors.
      } finally {
        renderingPages.delete(pageNum);
      }
    }

    function drainRenderQueue() {
      while (pendingPages.size && renderingPages.size < maxConcurrentRenders) {
        const nextPage = pendingPages.values().next().value;
        pendingPages.delete(nextPage);

        void renderPage(nextPage).finally(() => {
          drainRenderQueue();
        });
      }
    }

    function queueRender(pageNum) {
      if (!pdfDoc) return;
      if (pageNum < 1 || pageNum > pdfDoc.numPages) return;
      if (renderingPages.has(pageNum)) return;

      const pageEl = document.getElementById('page-' + pageNum);
      const canvas = pageEl ? pageEl.querySelector('canvas') : null;
      if (canvas && canvas.dataset.renderedScale === String(scale)) {
        return;
      }

      pendingPages.add(pageNum);
      drainRenderQueue();
    }

    function setupPagePlaceholders() {
      container.innerHTML = '';

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.id = 'page-' + i;
        pageContainer.dataset.pageNum = String(i);

        if (estimatedPageWidth && estimatedPageHeight) {
          pageContainer.style.width = estimatedPageWidth + 'px';
          pageContainer.style.height = estimatedPageHeight + 'px';
        }

        const canvas = document.createElement('canvas');
        if (estimatedPageWidth && estimatedPageHeight) {
          canvas.width = Math.floor(estimatedPageWidth);
          canvas.height = Math.floor(estimatedPageHeight);
        }
        pageContainer.appendChild(canvas);
        container.appendChild(pageContainer);
      }
    }

    async function resetForScale() {
      if (!pdfDoc) return;

      renderToken++;
      pendingPages.clear();
      renderingPages.clear();

      try {
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale });
        estimatedPageWidth = viewport.width;
        estimatedPageHeight = viewport.height;
        container.style.setProperty('--scale-factor', viewport.scale);
      } catch {
        // Keep previous estimates
      }

      const pages = container.querySelectorAll('.page-container');
      pages.forEach((pageEl) => {
        const canvas = pageEl.querySelector('canvas');
        if (!canvas) return;
        delete canvas.dataset.renderedScale;

        if (estimatedPageWidth && estimatedPageHeight) {
          pageEl.style.width = estimatedPageWidth + 'px';
          pageEl.style.height = estimatedPageHeight + 'px';
          canvas.width = Math.floor(estimatedPageWidth);
          canvas.height = Math.floor(estimatedPageHeight);
        }
      });

      const pagesToRender = new Set(visiblePages);
      pagesToRender.add(currentPage);
      pagesToRender.add(currentPage - 1);
      pagesToRender.add(currentPage + 1);
      pagesToRender.forEach((n) => queueRender(Number(n)));

      updatePageInfo();
    }

    function initIntersectionObserver() {
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }

      visiblePages.clear();

      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const pageNum = Number(entry.target.dataset.pageNum);
            if (!Number.isFinite(pageNum)) continue;

            if (entry.isIntersecting) {
              visiblePages.add(pageNum);
              queueRender(pageNum);
            } else {
              visiblePages.delete(pageNum);
            }
          }

          if (visiblePages.size) {
            currentPage = Math.min(...Array.from(visiblePages));
            updatePageInfo();
          }
        },
        {
          root: container,
          rootMargin: '300px 0px',
          threshold: 0.01,
        }
      );

      container.querySelectorAll('.page-container').forEach((el) => intersectionObserver.observe(el));
    }

    function scrollToPage(pageNum) {
      const pageEl = document.getElementById('page-' + pageNum);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function dispatchFind(type, findPrevious) {
      const query = searchInput.value;
      eventBus.dispatch('find', {
        source: findController,
        type,
        query,
        caseSensitive: false,
        entireWord: false,
        phraseSearch: true,
        highlightAll: false,
        findPrevious: Boolean(findPrevious),
      });
    }

    function clearFind() {
      eventBus.dispatch('findbarclose', { source: findController });
      searchInfo.textContent = '';
      searchPrevBtn.disabled = true;
      searchNextBtn.disabled = true;
    }

    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        scrollToPage(currentPage);
        updatePageInfo();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (currentPage < pdfDoc.numPages) {
        currentPage++;
        scrollToPage(currentPage);
        updatePageInfo();
      }
    });

    document.getElementById('zoomIn').addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 3.0);
      void resetForScale();
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.5);
      void resetForScale();
    });

    document.getElementById('fitWidth').addEventListener('click', () => {
      const containerWidth = container.clientWidth - 60;
      if (pdfDoc) {
        pdfDoc.getPage(1).then((page) => {
          const viewport = page.getViewport({ scale: 1.0 });
          scale = containerWidth / viewport.width;
          void resetForScale();
        });
      }
    });

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (!searchInput.value || searchInput.value.length < 2) {
          clearFind();
          return;
        }
        dispatchFind(null, false);
      }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          dispatchFind('again', true);
        } else {
          dispatchFind('again', false);
        }
      }
    });

    searchNextBtn.addEventListener('click', () => dispatchFind('again', false));
    searchPrevBtn.addEventListener('click', () => dispatchFind('again', true));

    eventBus.on('updatefindmatchescount', (evt) => {
      const total = evt?.matchesCount?.total ?? 0;
      const current = evt?.matchesCount?.current ?? 0;
      if (!searchInput.value || searchInput.value.length < 2) {
        searchInfo.textContent = '';
        searchPrevBtn.disabled = true;
        searchNextBtn.disabled = true;
        return;
      }
      if (total === 0) {
        searchInfo.textContent = 'No results';
        searchPrevBtn.disabled = true;
        searchNextBtn.disabled = true;
      } else {
        searchInfo.textContent = current + ' / ' + total;
        searchPrevBtn.disabled = false;
        searchNextBtn.disabled = false;
      }
    });

    pdfjsLib.getDocument(pdfUri).promise
      .then((pdf) => {
        pdfDoc = pdf;
        findController.setDocument(pdfDoc);
        loading.style.display = 'none';
        prevBtn.disabled = false;
        nextBtn.disabled = pdfDoc.numPages <= 1;
        totalPagesSpan.textContent = pdfDoc.numPages;

        pdf.getPage(1).then((page) => {
          const containerWidth = container.clientWidth - 60;
          const viewport = page.getViewport({ scale: 1.0 });
          scale = Math.min(containerWidth / viewport.width, 1.5);

          const scaledViewport = page.getViewport({ scale });
          estimatedPageWidth = scaledViewport.width;
          estimatedPageHeight = scaledViewport.height;
          container.style.setProperty('--scale-factor', scaledViewport.scale);

          setupPagePlaceholders();
          initIntersectionObserver();
          updatePageInfo();
          queueRender(1);
          queueRender(2);
        });
      })
      .catch((err) => {
        loading.textContent = 'Error loading PDF: ' + err.message;
        loading.className = 'loading error';
      });
  `;
}
