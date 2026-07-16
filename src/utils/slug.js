const slugify = (nombre) => {
  const map = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u' };
  return nombre
    .toLowerCase()
    .trim()
    .replace(/[áéíóúñü]/g, ch => map[ch] || ch)
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_/&]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const generarSlug = (nombre, idCancha) => {
  const base = slugify(nombre);
  const suffix = idCancha.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
  return `${base}-${suffix}`;
};

module.exports = { slugify, generarSlug };
