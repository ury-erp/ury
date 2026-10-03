import { call } from '@ury/core';

/**
 * Upload an image to Frappe's file store and return its public URL.
 *
 * Two paths, because neither alone is enough: multipart is what the server
 * prefers and the only one that streams, but it needs a CSRF token that some
 * embeddings of this app do not expose, so a base64 RPC stands behind it.
 * Extracted from MenuPage, which had the only copy, so the website editor
 * does not grow a second one that drifts from it.
 */

function extractFileUrl(res: any): string | null {
  const candidates = [res?.message, res?.message?.file_url, res?.message?.name];
  for (const value of candidates) {
    if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('http'))) {
      return value;
    }
  }
  return null;
}

export async function uploadImage(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('filename', file.name);
    formData.append('file_name', file.name);
    formData.append('is_private', '0');

    const baseUrl = import.meta.env?.VITE_FRAPPE_BASE_URL || '';
    const response = await fetch(`${baseUrl}/api/method/upload_file`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
        'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
      },
      credentials: 'include',
    });

    if (response.ok) {
      const url = extractFileUrl(await response.json());
      if (url) return url;
    }
  } catch {
    // Fall through to the RPC below rather than failing here: a blocked
    // multipart request is a configuration difference, not a bad file.
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.readAsDataURL(file);
  });

  const res = await call<any>('upload_file', {
    file_name: file.name,
    filename: file.name,
    filedata: dataUrl.split(',')[1],
    is_private: 0,
  });

  const url = extractFileUrl(res);
  if (!url) throw new Error('Upload response did not contain a valid file URL');
  return url;
}
