import { indexNowConfig, indexNowKeyFileName } from "./indexnow-config.mjs";

const decodeXml = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
  return response.text();
};

const keyLocation = `${indexNowConfig.origin}/${indexNowKeyFileName}`;
const hostedKey = (await fetchText(keyLocation)).trim();
if (hostedKey !== indexNowConfig.key) {
  throw new Error(`The hosted IndexNow key at ${keyLocation} does not match.`);
}

const sitemapXml = await fetchText(`${indexNowConfig.origin}/sitemap.xml`);
const urlList = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => decodeXml(match[1].trim()))
  .filter((url) => new URL(url).origin === indexNowConfig.origin);

if (urlList.length === 0) {
  throw new Error("No same-origin URLs were found in the live sitemap.");
}

const maxUrlsPerRequest = 10_000;
const batchCount = Math.ceil(urlList.length / maxUrlsPerRequest);
const batchSize = Math.ceil(urlList.length / batchCount);
const batches = Array.from(
  { length: batchCount },
  (_, index) => urlList.slice(index * batchSize, (index + 1) * batchSize),
);

for (const [index, batch] of batches.entries()) {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(indexNowConfig.origin).host,
      key: indexNowConfig.key,
      keyLocation,
      urlList: batch,
    }),
  });

  if (![200, 202].includes(response.status)) {
    throw new Error(
      `IndexNow batch ${index + 1}/${batches.length} returned HTTP ${response.status}: ${await response.text()}`,
    );
  }

  console.log(
    `Submitted IndexNow batch ${index + 1}/${batches.length} with ${batch.length} URLs (HTTP ${response.status}).`,
  );
}

console.log(`Submitted all ${urlList.length} live sitemap URLs to IndexNow.`);
