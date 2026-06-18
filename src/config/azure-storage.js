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

async function streamBlob(blobName, res) {
  const client = getContainerClient();
  if (!client) {
    res.status(500).json({ status: 'error', error: 'Storage no configurado' });
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
  } catch (err) {
    if (err.statusCode === 404) {
      res.status(404).json({ status: 'error', error: 'Imagen no encontrada' });
    } else {
      console.error('Error al leer blob:', err.message);
      res.status(500).json({ status: 'error', error: 'Error al servir imagen' });
    }
  }
}

function toProxyUrl(azureUrl) {
  const idx = azureUrl.indexOf(`${CONTAINER_NAME}/`);
  if (idx === -1) return azureUrl;
  const blobName = azureUrl.substring(idx + CONTAINER_NAME.length + 1);
  return `/api/uploads?blob=${encodeURIComponent(blobName)}`;
}

module.exports = { uploadBlob, deleteBlob, streamBlob, toProxyUrl };
