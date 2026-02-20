export const viewerStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }

  .toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 40px;
    background-color: #252526;
    border-bottom: 1px solid #3c3c3c;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    z-index: 100;
  }

  .toolbar button {
    background-color: #0e639c;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .toolbar button:hover {
    background-color: #1177bb;
  }

  .toolbar button:disabled {
    background-color: #3c3c3c;
    cursor: not-allowed;
  }

  .page-info {
    color: #cccccc;
    font-size: 13px;
  }

  .zoom-info {
    color: #cccccc;
    font-size: 13px;
    margin-left: auto;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 12px;
  }

  .search-box input {
    padding: 4px 8px;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background-color: #3c3c3c;
    color: #d4d4d4;
    font-size: 13px;
    width: 150px;
  }

  .search-box input:focus {
    outline: none;
    border-color: #0e639c;
  }

  .search-info {
    color: #cccccc;
    font-size: 12px;
    min-width: 60px;
  }

  .container {
    position: fixed;
    top: 40px;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    gap: 20px;
    background-color: #1e1e1e;
  }

  .page-container {
    background-color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    position: relative;
    --user-unit: 1;
    --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
    --scale-round-x: 1px;
    --scale-round-y: 1px;
  }

  .page-container .textLayer {
    z-index: 2;
    pointer-events: auto;
  }

  .page-container canvas {
    position: relative;
    z-index: 1;
    display: block;
  }

  .loading {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #cccccc;
    font-size: 16px;
  }

  .error {
    color: #f48771;
    text-align: center;
    padding: 20px;
  }
`;
