import WebSocket from "ws";

const targets = await fetch("http://127.0.0.1:54284/json/list").then((response) => response.json());
const target = targets.find((candidate) => candidate.title === "Project Zomboid Map");

if (!target?.webSocketDebuggerUrl) {
  throw new Error("Project Zomboid Map Overwolf window was not found.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let commandId = 0;

socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

function send(method, params = {}) {
  commandId += 1;
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

const expression = `(async () => ({
  title: document.title,
  scripts: Array.from(document.scripts).map((script) => script.src),
  mapImages: Array.from(document.images)
    .filter((image) => image.src.includes('_files/'))
    .map((image) => ({ src: image.src, opacity: image.style.opacity, transform: image.style.transform }))
    .slice(-100),
  bodyText: document.body.innerText.slice(0, 5000),
  buttons: Array.from(document.querySelectorAll('button')).map((button, index) => ({
    index,
    text: button.innerText,
    ariaLabel: button.getAttribute('aria-label'),
    title: button.getAttribute('title'),
    disabled: button.disabled,
    rect: (() => { const rect = button.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()
  })),
  mapView: localStorage.getItem('pzim:map-view:builtin:knox-country:isometric'),
  resources: performance.getEntriesByType('resource').map((entry) => entry.name).slice(-150),
  probes: await Promise.all([
    '/map-data/knox-country/isometric-optimized/catalog.json',
    '/map-data/knox-country/isometric-optimized/global/manifest.json',
    '/map-data/knox-country/isometric-optimized/global/cumulative-reverse/layer29_files/10/0_0.webp'
  ].map(async (url) => {
    const response = await fetch(url);
    return { url, status: response.status, contentType: response.headers.get('content-type') };
  }))
}))()`;

const result = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});

if (result.exceptionDetails) {
  throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
}

console.log(JSON.stringify(result.result.value, null, 2));
socket.close();
