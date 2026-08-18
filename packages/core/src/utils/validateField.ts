import validations from '../../../../frontend/src/data/validations.json';

export function validateFieldValue(value: string, rules: string[]): { valid: boolean; message: string } {
  for (const rule of rules) {
    if (rule === 'required') {
      if (!value || value.trim() === '') {
        return { valid: false, message: validations.required };
      }
    } else if (rule.startsWith('minLength:')) {
      const min = parseInt(rule.split(':')[1], 10);
      if (value && value.length < min) {
        return { valid: false, message: validations.minLength.replace('{min}', min.toString()) };
      }
    } else if (rule.startsWith('maxLength:')) {
      const max = parseInt(rule.split(':')[1], 10);
      if (value && value.length > max) {
        return { valid: false, message: validations.maxLength.replace('{max}', max.toString()) };
      }
    } else if (rule.startsWith('pattern:')) {
      const pattern = rule.substring(8);
      const regex = new RegExp(pattern);
      if (value && !regex.test(value)) {
        // @ts-ignore
        const msg = validations.pattern[pattern] || 'Invalid format';
        return { valid: false, message: msg };
      }
    }
  }
  return { valid: true, message: '' };
}
