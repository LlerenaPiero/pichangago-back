const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'canchas';

let blobServiceClient = null;
let containerClient = null;

function getContainerClient() {
  if (!CONNECTION_STRING) return null;
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  }
  return containerClient;
}

async function uploadBlob(filename, buffer, mimetype) {
  const client = getContainerClient();
  if (!client) throw new Error('AZURE_STORAGE_CONNECTION_STRING no configurada');

  const blockBlobClient = client.getBlockBlobClient(filename);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimetype }
  });
  return blockBlobClient.url;
}

async function deleteBlob(url) {
  const client = getContainerClient();
  if (!client) return;

  const containerPrefix = `${CONTAINER_NAME}/`;
  const idx = url.indexOf(containerPrefix);
  const blobName = idx !== -1 ? decodeURIComponent(url.substring(idx + containerPrefix.length)) : null;
  if (!blobName) return;

  const blockBlobClient = client.getBlockBlobClient(blobName);
  try {
    await blockBlobClient.deleteIfExists();
  } catch (err) {
    console.error('⚠️ Error al eliminar blob:', err.message);
  }
}

const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23EDF0F4" width="400" height="300"/><text x="200" y="140" text-anchor="middle" font-family="sans-serif" font-size="48">⚽</text><text x="200" y="172" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%236B7280">Sin foto</text></svg>';

async function streamBlob(blobName, res) {
  const client = getContainerClient();
  if (!client) {
    res.status(200)
      .setHeader('Content-Type', 'image/svg+xml')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .end(PLACEHOLDER_SVG);
    return;
  }

  const blockBlobClient = client.getBlockBlobClient(blobName);
  try {
    const downloadResponse = await blockBlobClient.download();
    res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', downloadResponse.contentLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (downloadResponse.properties?.contentMD5) {
      const md5Base64 = Buffer.from(downloadResponse.properties.contentMD5).toString('base64');
      res.setHeader('Content-MD5', md5Base64);
    }
    downloadResponse.readableStreamBody.pipe(res);
    downloadResponse.readableStreamBody.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    res.on('close', () => {
      downloadResponse.readableStreamBody?.destroy();
    });
  } catch (err) {
    if (err.statusCode === 404) {
      res.status(200)
        .setHeader('Content-Type', 'image/svg+xml')
        .setHeader('Cache-Control', 'public, max-age=3600')
        .end(PLACEHOLDER_SVG);
    } else {
      console.error('Error al leer blob:', err.message);
      res.status(200)
        .setHeader('Content-Type', 'image/svg+xml')
        .setHeader('Cache-Control', 'public, max-age=3600')
        .end(PLACEHOLDER_SVG);
    }
  }
}

const API_URL = process.env.API_URL || '';

function toProxyUrl(azureUrl) {
  if (!azureUrl) return '';
  const idx = azureUrl.indexOf(`${CONTAINER_NAME}/`);
  if (idx === -1) return azureUrl;
  const blobName = azureUrl.substring(idx + CONTAINER_NAME.length + 1);
  return `${API_URL}/api/uploads?blob=${encodeURIComponent(blobName)}`;
}

module.exports = { uploadBlob, deleteBlob, streamBlob, toProxyUrl };
