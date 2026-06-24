/* GT Specification service worker — CACHE_VERSION replaced at build time */
const CACHE_VERSION = "5565cee992b995af";
const CACHE_NAME = "gt-spec-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./download.html",
  "./css/spec.css",
  "./js/app.js",
  "./js/spec-data.js",
  "./js/pwa.js",
  "./js/find.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./content/001_Getting Started/001_Introduction/Process-Design-Construction-As-Built.svg",
  "./content/001_Getting Started/001_Introduction/figure-bim-relationship.svg",
  "./content/001_Getting Started/001_Introduction/figure-information-progression.svg",
  "./content/001_Getting Started/003_General property sets/PSETS.svg",
  "./content/001_Getting Started/004_Connection property sets/Connections.svg",
  "./content/006_Profiles/001_Linear profiles/001_Circular solid section/Circle.SVG",
  "./content/006_Profiles/001_Linear profiles/002_Circular hollow section/CircleHollow.SVG",
  "./content/006_Profiles/001_Linear profiles/003_Elliptical section/Elipse.SVG",
  "./content/006_Profiles/001_Linear profiles/004_Symmetric I-section/I-section.SVG",
  "./content/006_Profiles/001_Linear profiles/005_Asymmetric I-section/I-section-Asym.SVG",
  "./content/006_Profiles/001_Linear profiles/006_Rectangular solid section/Rectangle.SVG",
  "./content/006_Profiles/001_Linear profiles/007_Rectangular hollow section/RectangleHollow.SVG",
  "./content/006_Profiles/001_Linear profiles/008_T-section/T-section.SVG",
  "./content/006_Profiles/001_Linear profiles/009_U-section/U-Section.svg",
  "./content/006_Profiles/001_Linear profiles/010_Z-section/Z-Section.svg",
  "./content/006_Profiles/002_Planar profiles/001_Solid element dimensions/Slab.SVG",
  "./content/006_Profiles/002_Planar profiles/002_Bubble deck slab/VoidedSlab.SVG",
  "./content/006_Profiles/002_Planar profiles/003_Hollowcore slab/HollowCore.svg",
  "./content/006_Profiles/002_Planar profiles/004_Ribbed and waffle slab/RibbedDeck.SVG",
  "./content/006_Profiles/002_Planar profiles/005_Composite deck/CompositeDeck.SVG",
  "./content/007_Fasteners/001_Bolts/Bolt.SVG",
  "./content/007_Fasteners/002_Welds/Fillet-Weld.svg",
  "./content/007_Fasteners/003_Shear studs/Shear_Studs_Combined.svg",
  "./content/008_Connections/001_End plate/PlateEnd.SVG",
  "./content/008_Connections/002_Fin plate/PlateFin.SVG",
  "./content/010_Certificates/002_Competancy/competency.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gt-spec-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNetworkFirstPath(pathname) {
  return (
    pathname.endsWith("/manifest.webmanifest") ||
    pathname.endsWith("/version.json") ||
    pathname.endsWith("/sw.js") ||
    pathname.endsWith("/pwa.js")
  );
}

function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return;
  }
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirstPath(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          cachePut(event.request, response);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        cachePut(event.request, response);
        return response;
      });
    })
  );
});
