// Marcas conocidas en Colombia (forma normalizada, sin tildes).
// Se usa para reconocer la marca en lo que escribe el usuario.
// Si una marca no está aquí, el matching intenta reconocerla con la marca
// que reporta el propio proveedor.
export const KNOWN_BRANDS: string[] = [
  'diana', 'roa', 'florhuila', 'supremo', 'arroz blanquita',
  'alqueria', 'colanta', 'parmalat', 'alpina', 'algarra', 'proleche',
  'sello rojo', 'aguila roja', 'juan valdez', 'colcafe', 'nescafe', 'oma', 'lukafe',
  'coca cola', 'pepsi', 'postobon', 'quatro', 'sprite',
  'manuelita', 'incauca', 'riopaila', 'providencia',
  'colgate', 'oral b', 'sensodyne', 'fortident',
  'van camps', 'zenu', 'isabel', 'atun isabel',
  'bonaropa', 'ariel', 'fab', 'dersa', 'rindex', '3d', 'ace',
  'premier', 'oleocali', 'la favorita', 'girasoli', 'riquisimo',
  'familia', 'scott', 'elite', 'rosal',
  'savital', 'sedal', 'pantene', 'head shoulders', 'dove', 'konzil',
  'bimbo', 'comapan', 'santa clara', 'guadalupe',
  'luker', 'corona',
  'protex', 'palmolive', 'rexona', 'johnsons',
  'fabuloso', 'mr musculo', 'clorox', 'limpido', 'blancox', 'axion', 'lavaloza',
  'kokoriko', 'santa reyes', 'huevos oro', 'kikes',
  'doria', 'la muneca', 'monticello', 'comarrico',
  'fruco', 'maggi', 'knorr', 'ramo', 'noel', 'quaker', 'nutresa',
  'ekono', 'carulla', 'tosh',
];

/**
 * Grupos de variantes. Si el usuario pide una variante de un grupo y el
 * producto trae otra variante del mismo grupo, es un producto distinto.
 * Si el producto trae una variante que el usuario no pidió, el match
 * no puede ser EXACTO (no se puede verificar que sea lo que quiere).
 */
export const VARIANT_GROUPS: Record<string, string[]> = {
  leche: ['entera', 'deslactosada', 'descremada', 'semidescremada', 'semi', 'lactosa', 'light', 'polvo', 'saborizada', 'condensada', 'evaporada'],
  medio: ['agua', 'aceite', 'oliva', 'girasol', 'soya', 'tomate', 'picante', 'limon', 'ahumado'],
  sabor: ['fresa', 'chocolate', 'vainilla', 'mora', 'naranja', 'mango', 'maracuya', 'melocoton', 'durazno', 'uva', 'manzana', 'coco', 'canela', 'arequipe', 'mandarina', 'lulo', 'pina', 'cereza', 'menta'],
  dieta: ['zero', 'diet', 'light', 'cero', 'sinazucar'],
  azucar: ['blanca', 'morena', 'refinada', 'pulverizada', 'glass', 'organica', 'cubo', 'cubos'],
  grano: ['integral', 'parboil', 'parbolizado', 'vitamor', 'premium', 'fortificado', 'basmati', 'jazmin'],
  cafe: ['molido', 'grano', 'instantaneo', 'soluble', 'liofilizado', 'descafeinado', 'capsulas'],
  huevo: ['aa', 'aaa', 'jumbo', 'extra', 'criollo', 'campesino'],
  detergente: ['liquido', 'polvo', 'barra', 'gel', 'capsulas'],
  crema: ['total', 'luminous', 'sensitive', 'herbal', 'triple', 'blanqueadora', 'kids', 'infantil', 'carbon', 'maxima', 'proteccion'],
  pan: ['integral', 'blanco', 'multigranos', 'artesanal', 'brioche', 'queso', 'mantequilla', 'hamburguesa', 'perro'],
  cabello: ['anticaspa', 'rizos', 'liso', 'keratina', 'sabila', 'aguacate', 'manzanilla', 'reparacion', 'hidratacion'],
  papel: ['doble', 'triple', 'hoja', 'megarrollo', 'jumbo', 'acolchamax'],
  chocolate: ['clavos', 'canela', 'instantaneo', 'polvo', 'pastilla'],
  aroma: ['lavanda', 'floral', 'frutal', 'bebe', 'marina', 'pasion', 'fresca', 'mar', 'citrico'],
};

/** Palabras que no aportan identidad de producto. */
export const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'y', 'o', 'a', 'al', 'del',
  'x', 'und', 'unds', 'un', 'uds', 'unidad', 'unidades', 'paquete', 'pack', 'bolsa', 'caja',
  'botella', 'frasco', 'lata', 'tarro', 'sobre', 'display', 'bandeja', 'pet', 'vidrio',
  'g', 'gr', 'grs', 'gramo', 'gramos', 'kg', 'kgs', 'kilo', 'kilos', 'ml', 'mls', 'l', 'lt', 'lts', 'litro', 'litros', 'cc', 'lb', 'libra', 'libras',
  'precio', 'oferta', 'promo', 'promocion', 'nuevo', 'nueva', 'rollos', 'rollo', 'piezas',
  'tipo', 'marca', 'producto', 'referencia', 'plu', 'id', 'ref', 'ean', 'sku',
]);
