const bwipjs = require("bwip-js");

/**
 * Generate a CODE128 barcode as a PNG data URL.
 * @param {string} value - The value to encode (e.g., order number)
 * @returns {Promise<string>} Base64 data URL of the barcode image
 */
const generateBarcode = async (value) => {
  const buf = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 2,
    height: 15,
    includetext: true,
    textxalign: "center",
  });

  return `data:image/png;base64,${buf.toString("base64")}`;
};

module.exports = { generateBarcode };
