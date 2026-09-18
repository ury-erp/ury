import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(directory, 'ury_short_goods_receipt.html'), 'utf8');

const format = {
  doctype: 'Print Format',
  name: 'URY Short Goods Receipt',
  module: 'URY',
  doc_type: 'POS Invoice',
  print_format_for: 'DocType',
  print_format_type: 'Jinja',
  print_format_builder: 0,
  custom_format: 1,
  standard: 'Yes',
  disabled: 0,
  font_size: 10,
  margin_top: 0,
  margin_bottom: 0,
  margin_left: 0,
  margin_right: 0,
  page_number: 'Hide',
  html,
};

await writeFile(
  join(directory, 'ury_short_goods_receipt.json'),
  `${JSON.stringify(format, null, 2)}\n`,
  'utf8',
);
